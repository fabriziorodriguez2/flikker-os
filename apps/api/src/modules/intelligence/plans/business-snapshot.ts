import { CustomerSegment } from '@prisma/client';
import { computeVisitFrequency } from '../../retention-v2/visit-frequency';
import { segmentCustomer } from '../../retention-v2/segmentation';
import {
  matchesSegment,
  type CustomerFeatures,
  type SegmentRule,
} from './segment-rules';

/**
 * Foto del negocio para el planificador: los rasgos de cada cliente (para
 * evaluar segmentos) y las métricas verificables (para la evidencia de los
 * planes). Pura: recibe filas ya leídas y no consulta nada.
 *
 * Solo clientes activos y sin baja: a los demás nunca se les escribe, así que
 * contarlos inflaría las oportunidades.
 */

const MS_PER_DAY = 86_400_000;

export interface SnapshotRaw {
  customers: { id: string; isActive: boolean; optedOut: boolean }[];
  visits: { customerId: string; occurredAt: Date }[];
  /** Último mensaje de marketing enviado a cada cliente. */
  lastContacts: { customerId: string; at: Date }[];
  /** Premio activo: visitas que le faltan. */
  rewardRemaining: { customerId: string; remaining: number }[];
  /** Beneficios emitidos sin canjear (vigentes). */
  openBenefits: { customerId: string; expiresAt: Date | null }[];
  /** Canjes de los últimos 90 días. */
  redemptions: { customerId: string; redeemedAt: Date }[];
  /** Clientes con consentimiento de WhatsApp vigente. */
  consented: ReadonlySet<string>;
}

export interface BusinessSnapshot {
  features: ReadonlyMap<string, CustomerFeatures>;
  consented: ReadonlySet<string>;
  /** Métrica → valor. Lo único que un plan puede citar como evidencia. */
  facts: Record<string, number>;
}

/** Qué significa cada métrica, para el prompt y para el dueño. */
export const FACT_DESCRIPTIONS: Record<string, string> = {
  'customers.active': 'Clientes activos y sin baja.',
  'customers.with_whatsapp_consent':
    'De esos, cuántos autorizaron promociones por WhatsApp.',
  'customers.with_visits': 'Clientes con al menos una visita registrada.',
  'customers.single_visit_lapsed_30d':
    'Vinieron una sola vez y hace más de 30 días que no vuelven.',
  'customers.overdue_regulars':
    'Habituales (3+ visitas) que llevan 1,5 veces su frecuencia sin volver.',
  'customers.near_reward': 'Les faltan 1 o 2 visitas para el premio.',
  'customers.with_unredeemed_benefits': 'Tienen un beneficio sin canjear.',
  'customers.benefit_expiring_7d':
    'Tienen un beneficio sin canjear que vence en 7 días o menos.',
  'customers.contacted_last_30d':
    'Recibieron un mensaje de marketing en los últimos 30 días.',
  'visits.last_28d': 'Visitas en los últimos 28 días.',
  'visits.prev_28d': 'Visitas en los 28 días anteriores.',
  'visits.last_28d_vs_prev_change_pct':
    'Variación % de visitas: últimos 28 días contra los 28 anteriores.',
  'visits.unique_customers_last_28d':
    'Clientes distintos que vinieron en los últimos 28 días.',
  'redemptions.last_90d': 'Canjes de beneficios en los últimos 90 días.',
};
for (const segment of Object.values(CustomerSegment)) {
  FACT_DESCRIPTIONS[`customers.segment.${segment}`] =
    `Clientes en la etapa ${segment}.`;
}

const days = (from: Date, to: Date) =>
  Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);

export function buildBusinessSnapshot(
  raw: SnapshotRaw,
  now: Date,
): BusinessSnapshot {
  const group = <T extends { customerId: string }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const list = map.get(row.customerId) ?? [];
      list.push(row);
      map.set(row.customerId, list);
    }
    return map;
  };
  const visitsBy = group(raw.visits);
  const contactBy = new Map(raw.lastContacts.map((c) => [c.customerId, c.at]));
  const rewardBy = new Map(
    raw.rewardRemaining.map((r) => [r.customerId, r.remaining]),
  );
  const benefitsBy = group(raw.openBenefits);
  const redemptionsBy = group(raw.redemptions);

  const t28 = now.getTime() - 28 * MS_PER_DAY;
  const t56 = now.getTime() - 56 * MS_PER_DAY;
  const t30 = now.getTime() - 30 * MS_PER_DAY;
  const t90 = now.getTime() - 90 * MS_PER_DAY;

  const features = new Map<string, CustomerFeatures>();
  const facts: Record<string, number> = {
    'customers.active': 0,
    'customers.with_whatsapp_consent': 0,
    'customers.with_visits': 0,
    'customers.single_visit_lapsed_30d': 0,
    'customers.overdue_regulars': 0,
    'customers.near_reward': 0,
    'customers.with_unredeemed_benefits': 0,
    'customers.benefit_expiring_7d': 0,
    'customers.contacted_last_30d': 0,
    'visits.last_28d': 0,
    'visits.prev_28d': 0,
    'visits.unique_customers_last_28d': 0,
    'redemptions.last_90d': 0,
  };
  for (const segment of Object.values(CustomerSegment)) {
    facts[`customers.segment.${segment}`] = 0;
  }
  const consented = new Set<string>();

  for (const customer of raw.customers) {
    if (!customer.isActive || customer.optedOut) continue;
    const dates = (visitsBy.get(customer.id) ?? []).map((v) => v.occurredAt);
    const frequency = computeVisitFrequency(dates, now);
    const lastContact = contactBy.get(customer.id) ?? null;
    const { segment } = segmentCustomer({
      frequency,
      lastInterventionAt: lastContact,
      now,
    });
    const benefits = benefitsBy.get(customer.id) ?? [];
    const expiries = benefits
      .map((b) => b.expiresAt)
      .filter((d): d is Date => d !== null && d.getTime() > now.getTime())
      .map((d) =>
        Math.max(0, Math.floor((d.getTime() - now.getTime()) / MS_PER_DAY)),
      );
    const inLast30 = dates.filter((d) => d.getTime() >= t30).length;
    const inLast90 = dates.filter((d) => d.getTime() >= t90).length;
    const inLast28 = dates.filter((d) => d.getTime() >= t28).length;
    const inPrev28 = dates.filter(
      (d) => d.getTime() >= t56 && d.getTime() < t28,
    ).length;

    const f: CustomerFeatures = {
      visitCount: frequency.visitCount,
      visitsLast30Days: inLast30,
      visitsLast90Days: inLast90,
      daysSinceFirstVisit: frequency.firstVisitAt
        ? days(frequency.firstVisitAt, now)
        : null,
      daysSinceLastVisit: frequency.daysSinceLastVisit,
      typicalIntervalDays: frequency.typicalIntervalDays,
      overdueRatio:
        frequency.typicalIntervalDays && frequency.daysSinceLastVisit !== null
          ? Math.round(
              (frequency.daysSinceLastVisit / frequency.typicalIntervalDays) *
                100,
            ) / 100
          : null,
      rewardRemainingVisits: rewardBy.get(customer.id) ?? null,
      unredeemedBenefits: benefits.length,
      daysToNearestBenefitExpiry: expiries.length
        ? Math.min(...expiries)
        : null,
      redemptionsLast90Days: (redemptionsBy.get(customer.id) ?? []).filter(
        (r) => r.redeemedAt.getTime() >= t90,
      ).length,
      daysSinceLastContact: lastContact ? days(lastContact, now) : null,
      segment,
    };
    features.set(customer.id, f);

    facts['customers.active'] += 1;
    if (raw.consented.has(customer.id)) {
      consented.add(customer.id);
      facts['customers.with_whatsapp_consent'] += 1;
    }
    if ((f.visitCount ?? 0) > 0) facts['customers.with_visits'] += 1;
    facts[`customers.segment.${segment}`] += 1;
    if (f.visitCount === 1 && (f.daysSinceLastVisit ?? 0) > 30) {
      facts['customers.single_visit_lapsed_30d'] += 1;
    }
    if ((f.visitCount ?? 0) >= 3 && (f.overdueRatio ?? 0) >= 1.5) {
      facts['customers.overdue_regulars'] += 1;
    }
    if (
      f.rewardRemainingVisits !== null &&
      f.rewardRemainingVisits >= 1 &&
      f.rewardRemainingVisits <= 2
    ) {
      facts['customers.near_reward'] += 1;
    }
    if (f.unredeemedBenefits) facts['customers.with_unredeemed_benefits'] += 1;
    if (
      f.daysToNearestBenefitExpiry !== null &&
      f.daysToNearestBenefitExpiry <= 7
    ) {
      facts['customers.benefit_expiring_7d'] += 1;
    }
    if (f.daysSinceLastContact !== null && f.daysSinceLastContact <= 30) {
      facts['customers.contacted_last_30d'] += 1;
    }
    facts['visits.last_28d'] += inLast28;
    facts['visits.prev_28d'] += inPrev28;
    if (inLast28 > 0) facts['visits.unique_customers_last_28d'] += 1;
    facts['redemptions.last_90d'] += f.redemptionsLast90Days ?? 0;
  }

  // Sin base anterior no hay variación que citar: la métrica no existe.
  if (facts['visits.prev_28d'] > 0) {
    facts['visits.last_28d_vs_prev_change_pct'] =
      Math.round(
        ((facts['visits.last_28d'] - facts['visits.prev_28d']) /
          facts['visits.prev_28d']) *
          1000,
      ) / 10;
  }

  return { features, consented, facts };
}

export interface SegmentPreview {
  /** Clientes activos y sin baja que cumplen la regla. */
  matched: number;
  /** De esos, con consentimiento de WhatsApp: a lo sumo esto se puede contactar. */
  reachable: number;
}

/** Cuántos entran en una regla. Nunca devuelve quiénes. */
export function previewSegment(
  snapshot: BusinessSnapshot,
  rule: SegmentRule,
): SegmentPreview {
  let matched = 0;
  let reachable = 0;
  for (const [id, f] of snapshot.features) {
    if (!matchesSegment(rule, f)) continue;
    matched += 1;
    if (snapshot.consented.has(id)) reachable += 1;
  }
  return { matched, reachable };
}

/** Los ids que entran en la regla y se pueden contactar (solo para ejecutar). */
export function reachableCustomerIds(
  snapshot: BusinessSnapshot,
  rule: SegmentRule,
): string[] {
  const ids: string[] = [];
  for (const [id, f] of snapshot.features) {
    if (snapshot.consented.has(id) && matchesSegment(rule, f)) ids.push(id);
  }
  return ids;
}
