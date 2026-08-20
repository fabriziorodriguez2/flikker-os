import { CustomerSegment } from '@prisma/client';
import type {
  BenefitIssuanceStatsRow,
  PromotionStatsRow,
  StampCardImpactStats,
  VisitTimingSlot,
  VisitTrendWindow,
} from './insights.repository';
import type { ReactivationFunnelResult } from '../retention-v2/reactivation-funnel';

/**
 * Insights, la parte que "dice" en vez de "calcula" — funciones puras, sin
 * Prisma ni `@Injectable`, mismo patrón que `segmentation.ts`/
 * `message-templates.ts`: `insights.service.ts` hace las cuentas, esto solo
 * las convierte en frases. Nunca se inventa una afirmación con datos
 * insuficientes: por debajo de `MIN_SAMPLE_SIZE` se devuelve
 * `hasEnoughData: false` y una frase que lo dice, en vez de un número
 * potencialmente engañoso.
 */

export const MIN_SAMPLE_SIZE = 5;

export type InsightKind = 'positive' | 'warning' | 'neutral';

export interface InsightStatement {
  id: string;
  statement: string;
  kind: InsightKind;
  hasEnoughData: boolean;
}

export interface InsightsMetricsBundle {
  totalCustomers: number;
  newCustomersInWindow: number;
  windowDays: number;
  returningCustomers: number;
  segmentCounts: Record<CustomerSegment, number>;
  visitTrend: VisitTrendWindow[];
  visitTiming: VisitTimingSlot[];
  stampCard: {
    customersParticipating: number;
    cardsInProgress: number;
    unlockedTotal: number;
    redeemedTotal: number;
  };
  stampCardImpact: StampCardImpactStats;
  benefitStats: BenefitIssuanceStatsRow[];
  promotionStats: PromotionStatsRow[];
  /** "X contactados → Y volvieron → Z% de recuperación" — mismo dato que
   * Notificaciones (`ReactivationFunnelService`), nunca recalculado acá. */
  reactivationFunnel: ReactivationFunnelResult;
  reviewStats: {
    total: number;
    sinceFlikker: number;
    rating: number | null;
    inPeriod: number;
    feedbackInPeriod: number;
  };
}

const WEEKDAY_NAMES = [
  'los domingos',
  'los lunes',
  'los martes',
  'los miércoles',
  'los jueves',
  'los viernes',
  'los sábados',
];

export function generateInsights(
  bundle: InsightsMetricsBundle,
): InsightStatement[] {
  const statements: InsightStatement[] = [
    newVsReturningStatement(bundle),
    stampCardOverviewStatement(bundle),
    reviewStatement(bundle),
  ];

  const churn = churnStatement(bundle);
  if (churn) statements.push(churn);

  const stampImpact = stampCardImpactStatement(bundle);
  if (stampImpact) statements.push(stampImpact);

  const promo = bestPromotionStatement(bundle);
  if (promo) statements.push(promo);

  const reactivation = reactivationFunnelStatement(bundle);
  if (reactivation) statements.push(reactivation);

  const reactivationByArm = reactivationByArmStatement(bundle);
  if (reactivationByArm) statements.push(reactivationByArm);

  const timing = busiestTimingStatement(bundle);
  if (timing) statements.push(timing);

  return statements;
}

function newVsReturningStatement(
  bundle: InsightsMetricsBundle,
): InsightStatement {
  return {
    id: 'new-vs-returning',
    statement: `En los últimos ${bundle.windowDays} días se sumaron ${bundle.newCustomersInWindow} clientes nuevos, y ${bundle.returningCustomers} ya habían venido antes.`,
    kind: 'neutral',
    hasEnoughData: true,
  };
}

function churnStatement(
  bundle: InsightsMetricsBundle,
): InsightStatement | null {
  if (bundle.totalCustomers < MIN_SAMPLE_SIZE) {
    return {
      id: 'churn',
      statement:
        'Todavía no hay suficientes clientes registrados para calcular quién dejó de venir.',
      kind: 'neutral',
      hasEnoughData: false,
    };
  }
  const count =
    bundle.segmentCounts[CustomerSegment.AT_RISK] +
    bundle.segmentCounts[CustomerSegment.INACTIVE];
  if (count === 0) {
    return {
      id: 'churn',
      statement:
        'Ningún cliente parece haber dejado de venir todavía — todos siguen dentro de su ritmo habitual.',
      kind: 'positive',
      hasEnoughData: true,
    };
  }
  return {
    id: 'churn',
    statement: `${count} ${count === 1 ? 'cliente' : 'clientes'} ${count === 1 ? 'dejó' : 'dejaron'} de venir o está${count === 1 ? '' : 'n'} tardando más que su ritmo habitual — buen momento para reactivarlo${count === 1 ? '' : 's'}.`,
    kind: 'warning',
    hasEnoughData: true,
  };
}

function stampCardImpactStatement(
  bundle: InsightsMetricsBundle,
): InsightStatement | null {
  const { participants, nonParticipants } = bundle.stampCardImpact;
  if (
    participants.total < MIN_SAMPLE_SIZE ||
    nonParticipants.total < MIN_SAMPLE_SIZE
  ) {
    return null;
  }
  const rateParticipants = participants.returning / participants.total;
  const rateNonParticipants = nonParticipants.returning / nonParticipants.total;
  if (rateNonParticipants === 0) {
    if (rateParticipants === 0) return null;
    return {
      id: 'stamp-card-impact',
      statement: `El ${Math.round(rateParticipants * 100)}% de los clientes con tarjeta de sellos volvió a visitarte, mientras que los que no participan casi no repiten visita.`,
      kind: 'positive',
      hasEnoughData: true,
    };
  }
  const ratio = rateParticipants / rateNonParticipants;
  if (ratio <= 1) return null; // no hay una señal real que destacar
  return {
    id: 'stamp-card-impact',
    statement: `Los clientes con tarjeta de sellos vuelven ${ratio.toLocaleString('es-UY', { maximumFractionDigits: 1 })}x más que quienes no participan.`,
    kind: 'positive',
    hasEnoughData: true,
  };
}

function stampCardOverviewStatement(
  bundle: InsightsMetricsBundle,
): InsightStatement {
  const { unlockedTotal, redeemedTotal } = bundle.stampCard;
  if (unlockedTotal === 0) {
    return {
      id: 'stamp-card-overview',
      statement: 'Todavía no se desbloqueó ninguna tarjeta de sellos completa.',
      kind: 'neutral',
      hasEnoughData: true,
    };
  }
  return {
    id: 'stamp-card-overview',
    statement: `Se desbloquearon ${unlockedTotal} recompensa${unlockedTotal === 1 ? '' : 's'} de tarjeta y se canjearon ${redeemedTotal}.`,
    kind: 'neutral',
    hasEnoughData: true,
  };
}

function bestPromotionStatement(
  bundle: InsightsMetricsBundle,
): InsightStatement | null {
  const candidate = bundle.promotionStats.find((p) => p.sentCount > 0);
  if (!candidate) return null;
  if (candidate.sentCount < MIN_SAMPLE_SIZE) {
    return {
      id: 'promotion-performance',
      statement:
        'Todavía es pronto para evaluar el rendimiento de tu última promoción.',
      kind: 'neutral',
      hasEnoughData: false,
    };
  }
  const name = candidate.benefitTitle ? `"${candidate.benefitTitle}"` : '';
  return {
    id: 'promotion-performance',
    statement: `Tu promoción ${name} generó ${candidate.benefitsRedeemed} canje${candidate.benefitsRedeemed === 1 ? '' : 's'} sobre ${candidate.sentCount} envíos.`,
    kind: candidate.benefitsRedeemed > 0 ? 'positive' : 'neutral',
    hasEnoughData: true,
  };
}

/**
 * El KPI principal de Retención/Reactivación — mismo número real que
 * Notificaciones (`ReactivationFunnelService`, atribución de
 * `RetentionOutcome` contra `Visit`, "contactado" ya exige que el mensaje
 * haya salido de verdad por el canal). Se muestra en cuanto hay al menos un
 * contacto — no hay un "mínimo de muestra" propio acá: `evidenceState` ya
 * vive en el número mismo si algún día hace falta mostrarlo.
 */
function reactivationFunnelStatement(
  bundle: InsightsMetricsBundle,
): InsightStatement | null {
  const { overall } = bundle.reactivationFunnel;
  if (overall.contacted === 0) return null;

  const recoveryPercent = Math.round(overall.recoveryRate * 1000) / 10;
  return {
    id: 'reactivation-funnel',
    statement: `Flikker contactó a ${overall.contacted} ${overall.contacted === 1 ? 'cliente' : 'clientes'} y ${overall.returned} ${overall.returned === 1 ? 'volvió' : 'volvieron'} (${recoveryPercent}% de recuperación).`,
    kind: overall.returned > 0 ? 'positive' : 'neutral',
    hasEnoughData: true,
  };
}

/**
 * El detalle recordatorio-solo vs. con beneficio — solo cuando los dos
 * brazos ya tienen volumen suficiente (`byArm !== null`, mismo gate que ya
 * aplica `ReactivationFunnelService`). Afirmación separada a propósito: la
 * principal (arriba) nunca depende de este detalle para mostrarse.
 */
function reactivationByArmStatement(
  bundle: InsightsMetricsBundle,
): InsightStatement | null {
  const { byArm } = bundle.reactivationFunnel;
  if (!byArm) return null;

  const reminderPct = Math.round(byArm.reminderOnly.recoveryRate * 1000) / 10;
  const benefitPct = Math.round(byArm.withBenefit.recoveryRate * 1000) / 10;
  return {
    id: 'reactivation-by-arm',
    statement: `Solo recordatorio recupera ${reminderPct}%, y con beneficio ${benefitPct}%.`,
    kind: 'neutral',
    hasEnoughData: true,
  };
}

function busiestTimingStatement(
  bundle: InsightsMetricsBundle,
): InsightStatement | null {
  const total = bundle.visitTiming.reduce((sum, slot) => sum + slot.count, 0);
  if (total < 20) {
    return {
      id: 'busiest-timing',
      statement:
        'Todavía no hay suficientes visitas registradas para saber qué días/horarios son los de mayor movimiento.',
      kind: 'neutral',
      hasEnoughData: false,
    };
  }

  // Se agrupa por ventanas de 3 horas (0-3, 3-6, …) por día: una sola hora
  // suelta es demasiado ruidosa para afirmar algo con confianza.
  const windowCounts = new Map<string, number>();
  for (const slot of bundle.visitTiming) {
    const windowStart = Math.floor(slot.hour / 3) * 3;
    const key = `${slot.weekday}-${windowStart}`;
    windowCounts.set(key, (windowCounts.get(key) ?? 0) + slot.count);
  }

  let bestKey: string | null = null;
  let bestCount = 0;
  for (const [key, count] of windowCounts) {
    if (count > bestCount) {
      bestKey = key;
      bestCount = count;
    }
  }
  if (!bestKey || bestCount < 3) return null;

  const [weekdayStr, windowStartStr] = bestKey.split('-');
  const weekday = Number(weekdayStr);
  const windowStart = Number(windowStartStr);
  const windowEnd = windowStart + 3;

  return {
    id: 'busiest-timing',
    statement: `${capitalize(WEEKDAY_NAMES[weekday])} entre las ${pad(windowStart)}:00 y las ${pad(windowEnd)}:00 concentran el mayor número de visitas.`,
    kind: 'neutral',
    hasEnoughData: true,
  };
}

function reviewStatement(bundle: InsightsMetricsBundle): InsightStatement {
  if (bundle.reviewStats.total === 0) {
    return {
      id: 'reviews',
      statement: 'Todavía no tenés reseñas de Google registradas.',
      kind: 'neutral',
      hasEnoughData: false,
    };
  }
  const ratingText =
    bundle.reviewStats.rating !== null
      ? ` con un rating de ${bundle.reviewStats.rating.toLocaleString('es-UY', { maximumFractionDigits: 1 })}★`
      : '';
  return {
    id: 'reviews',
    statement: `Desde que usás Flikker recibiste ${bundle.reviewStats.sinceFlikker} reseñas nuevas (${bundle.reviewStats.total} en total)${ratingText}.`,
    kind: 'positive',
    hasEnoughData: true,
  };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
