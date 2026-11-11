import { createHash } from 'node:crypto';
import { CustomerSegment, RetentionObjective } from '@prisma/client';
import { computeVisitFrequency } from '../../retention-v2/visit-frequency';
import { segmentCustomer } from '../../retention-v2/segmentation';

/**
 * Modo autónomo de Intelligence: reglas puras. Detectan oportunidades,
 * eligen UNA estrategia por corrida, arman un grupo chico y explican el
 * resultado con conteos reales. No leen la base ni deciden nada que la
 * política o Autopilot no vuelvan a validar: lo que sale de acá es un plan.
 *
 * Con pocos datos no se finge aprendizaje: cada oportunidad dice si sale de
 * la cadencia propia del cliente (BEHAVIORAL) o de una regla de negocio fija
 * (EXPLICIT_RULE), y la explicación lo aclara.
 */

export type StrategyKey =
  | 'SECOND_VISIT'
  | 'OVERDUE'
  | 'INACTIVE'
  | 'NEAR_REWARD'
  | 'BENEFIT_EXPIRING'
  | 'COHORT_DECLINE';

/** 1 sin descuento · 2 progreso o beneficio ya adquirido · 3 catálogo aprobado. */
export type IncentiveLevel = 1 | 2 | 3;

export type Confidence = 'BEHAVIORAL' | 'EXPLICIT_RULE';

interface StrategySpec {
  label: string;
  level: IncentiveLevel;
  /** Objetivo de Autopilot que la ejecuta; null = Autopilot no tiene cómo. */
  objective: RetentionObjective | null;
  notExecutableReason?: string;
}

/** Orden de preferencia dentro de cada nivel de la escalera. */
export const STRATEGIES: Record<StrategyKey, StrategySpec> = {
  SECOND_VISIT: {
    label: 'Segunda visita',
    level: 1,
    // Mismo criterio que la revalidación de Autopilot: el cliente de una
    // sola visita que ya pasó su plazo cae en AT_RISK/INACTIVE.
    objective: RetentionObjective.AT_RISK_RECOVERY,
  },
  OVERDUE: {
    label: 'Demorado según su frecuencia',
    level: 1,
    objective: RetentionObjective.AT_RISK_RECOVERY,
  },
  INACTIVE: {
    label: 'Inactivo',
    level: 1,
    objective: RetentionObjective.INACTIVE_RECOVERY,
  },
  NEAR_REWARD: {
    label: 'Cerca del premio',
    level: 2,
    objective: RetentionObjective.REWARD_GOAL_PROGRESS,
  },
  BENEFIT_EXPIRING: {
    label: 'Beneficio por vencer',
    level: 2,
    objective: null,
    notExecutableReason:
      'Autopilot todavía no tiene un mensaje para avisar que un beneficio vence: se detecta pero no se envía.',
  },
  COHORT_DECLINE: {
    label: 'Clientes habituales que bajaron sus visitas',
    level: 1,
    objective: null,
    notExecutableReason:
      'Es una señal del conjunto, no una lista para contactar: se actúa a través de "Demorado según su frecuencia".',
  },
};

const ORDER: StrategyKey[] = [
  'SECOND_VISIT',
  'OVERDUE',
  'INACTIVE',
  'NEAR_REWARD',
  'BENEFIT_EXPIRING',
  'COHORT_DECLINE',
];

/** Debajo de esto, "pocos datos": se trabaja con reglas fijas y se dice. */
export const FEW_DATA_CUSTOMERS = 30;
/** Cerca del premio = le faltan como mucho estas visitas. */
export const NEAR_REWARD_MAX_REMAINING = 2;
/** Beneficio por vencer = vence dentro de estos días. */
export const EXPIRING_WITHIN_DAYS = 7;
/** Una estrategia ejecutada no se repite hasta cerrar su medición. */
export const MEASUREMENT_WINDOW_DAYS = 14;
const COHORT_WINDOW_DAYS = 28;
const COHORT_MIN_BASE_VISITS = 20;
const COHORT_DROP = 0.25;
const MS_PER_DAY = 86_400_000;

export interface CustomerFacts {
  id: string;
  visitDates: Date[];
  lastInterventionAt: Date | null;
  /** Visitas que le faltan para su premio activo; null = sin tarjeta activa. */
  activeGoalRemaining: number | null;
  /** Días hasta que vence su beneficio más próximo sin canjear; null = ninguno. */
  expiringBenefitInDays: number | null;
}

export interface Opportunity {
  strategy: StrategyKey;
  label: string;
  incentiveLevel: IncentiveLevel;
  objective: RetentionObjective | null;
  executable: boolean;
  notExecutableReason: string | null;
  confidence: Confidence;
  candidateIds: string[];
  /** Segmento de cada candidato (para elegir el experimento de Autopilot). */
  segments: Record<string, CustomerSegment>;
  count: number;
  rationale: string;
}

export interface DetectionResult {
  opportunities: Opportunity[];
  customersWithVisits: number;
  fewData: boolean;
}

/**
 * Detecta las seis estrategias en una sola pasada (O(n) sobre clientes y
 * visitas): sirve igual para 0, 105 o miles de clientes.
 */
export function detectOpportunities(
  customers: CustomerFacts[],
  now: Date,
): DetectionResult {
  const buckets: Record<StrategyKey, { ids: string[]; behavioral: number }> = {
    SECOND_VISIT: { ids: [], behavioral: 0 },
    OVERDUE: { ids: [], behavioral: 0 },
    INACTIVE: { ids: [], behavioral: 0 },
    NEAR_REWARD: { ids: [], behavioral: 0 },
    BENEFIT_EXPIRING: { ids: [], behavioral: 0 },
    COHORT_DECLINE: { ids: [], behavioral: 0 },
  };
  const segments: Record<string, CustomerSegment> = {};
  let customersWithVisits = 0;
  let cohortPrevious = 0;
  let cohortCurrent = 0;
  const cohortLost: string[] = [];
  const windowStart = now.getTime() - COHORT_WINDOW_DAYS * MS_PER_DAY;
  const previousStart = windowStart - COHORT_WINDOW_DAYS * MS_PER_DAY;

  for (const customer of customers) {
    const frequency = computeVisitFrequency(customer.visitDates, now);
    if (frequency.visitCount > 0) customersWithVisits += 1;
    const { segment } = segmentCustomer({
      frequency,
      lastInterventionAt: customer.lastInterventionAt,
      now,
    });
    segments[customer.id] = segment;
    const behavioral = frequency.hasReliableCadence ? 1 : 0;

    if (
      frequency.visitCount === 1 &&
      (segment === CustomerSegment.AT_RISK ||
        segment === CustomerSegment.INACTIVE)
    ) {
      buckets.SECOND_VISIT.ids.push(customer.id);
    } else if (
      frequency.visitCount >= 2 &&
      segment === CustomerSegment.AT_RISK
    ) {
      buckets.OVERDUE.ids.push(customer.id);
      buckets.OVERDUE.behavioral += behavioral;
    } else if (
      frequency.visitCount >= 2 &&
      segment === CustomerSegment.INACTIVE
    ) {
      buckets.INACTIVE.ids.push(customer.id);
      buckets.INACTIVE.behavioral += behavioral;
    }

    if (
      customer.activeGoalRemaining !== null &&
      customer.activeGoalRemaining > 0 &&
      customer.activeGoalRemaining <= NEAR_REWARD_MAX_REMAINING
    ) {
      buckets.NEAR_REWARD.ids.push(customer.id);
    }
    if (
      customer.expiringBenefitInDays !== null &&
      customer.expiringBenefitInDays >= 0 &&
      customer.expiringBenefitInDays <= EXPIRING_WITHIN_DAYS
    ) {
      buckets.BENEFIT_EXPIRING.ids.push(customer.id);
    }

    // Cohorte: clientes con al menos 2 visitas, últimos 28 días vs los 28 anteriores.
    if (frequency.visitCount >= 2) {
      let inPrevious = 0;
      let inCurrent = 0;
      for (const at of customer.visitDates) {
        const t = at.getTime();
        if (t >= windowStart && t < now.getTime()) inCurrent += 1;
        else if (t >= previousStart && t < windowStart) inPrevious += 1;
      }
      cohortPrevious += inPrevious;
      cohortCurrent += inCurrent;
      if (inPrevious > 0 && inCurrent === 0) cohortLost.push(customer.id);
    }
  }

  const cohortDeclined =
    cohortPrevious >= COHORT_MIN_BASE_VISITS &&
    cohortCurrent <= cohortPrevious * (1 - COHORT_DROP);
  if (cohortDeclined) buckets.COHORT_DECLINE.ids.push(...cohortLost);

  const fewData = customersWithVisits < FEW_DATA_CUSTOMERS;
  const opportunities: Opportunity[] = [];
  for (const strategy of ORDER) {
    const bucket = buckets[strategy];
    if (bucket.ids.length === 0) continue;
    const spec = STRATEGIES[strategy];
    // Solo es "comportamiento" si la mayoría tiene cadencia propia confiable
    // y el negocio tiene base suficiente; si no, es una regla fija.
    const confidence: Confidence =
      !fewData && bucket.behavioral * 2 > bucket.ids.length
        ? 'BEHAVIORAL'
        : 'EXPLICIT_RULE';
    const candidateSegments: Record<string, CustomerSegment> = {};
    for (const id of bucket.ids) candidateSegments[id] = segments[id];
    opportunities.push({
      strategy,
      label: spec.label,
      incentiveLevel: spec.level,
      objective: spec.objective,
      executable: spec.objective !== null,
      notExecutableReason: spec.notExecutableReason ?? null,
      confidence,
      candidateIds: bucket.ids,
      segments: candidateSegments,
      count: bucket.ids.length,
      rationale: rationaleFor(strategy, bucket.ids.length, {
        cohortPrevious,
        cohortCurrent,
      }),
    });
  }
  return { opportunities, customersWithVisits, fewData };
}

function rationaleFor(
  strategy: StrategyKey,
  count: number,
  cohort: { cohortPrevious: number; cohortCurrent: number },
): string {
  const people = `${count} ${count === 1 ? 'cliente' : 'clientes'}`;
  switch (strategy) {
    case 'SECOND_VISIT':
      return `${people} vinieron una sola vez y ya pasó el plazo normal para una segunda visita.`;
    case 'OVERDUE':
      return `${people} están tardando más de lo habitual en volver.`;
    case 'INACTIVE':
      return `${people} dejaron de venir hace bastante.`;
    case 'NEAR_REWARD':
      return `${people} están a ${NEAR_REWARD_MAX_REMAINING} visitas o menos de su premio.`;
    case 'BENEFIT_EXPIRING':
      return `${people} tienen un beneficio sin canjear que vence en ${EXPIRING_WITHIN_DAYS} días o menos.`;
    case 'COHORT_DECLINE':
      return `Los clientes habituales hicieron ${cohort.cohortCurrent} visitas en los últimos 28 días contra ${cohort.cohortPrevious} en los 28 anteriores; ${people} no volvieron.`;
  }
}

// ---------------------------------------------------------------------------
// Elección
// ---------------------------------------------------------------------------

export type DiscardReason =
  | 'NOT_EXECUTABLE'
  | 'NO_AUTOPILOT_EXPERIMENT'
  | 'STILL_MEASURING'
  | 'NO_ELIGIBLE'
  | 'NOT_CHOSEN';

export interface Discarded {
  strategy: StrategyKey;
  label: string;
  count: number;
  reason: DiscardReason;
  detail: string;
}

export interface PastRun {
  strategy: string | null;
  incentiveLevel: number | null;
  status: string;
  mode: string;
  createdAt: Date;
  /** Expuestos (enviados) y que volvieron, medidos por Autopilot. */
  exposed: number;
  returned: number;
}

export interface StrategyChoice {
  chosen: {
    opportunity: Opportunity;
    eligibleIds: string[];
    incentiveLevel: IncentiveLevel;
  } | null;
  discarded: Discarded[];
}

/**
 * Elige UNA estrategia. Primero la escalera (sin descuento antes que
 * progreso, y el catálogo solo si lo anterior no funcionó), después el
 * orden fijo. Una estrategia ejecutada en los últimos 14 días no se repite:
 * todavía se está midiendo.
 */
export function chooseStrategy(input: {
  opportunities: Opportunity[];
  /** Candidatos que pasaron consentimiento, frecuencia y "ya asignado". */
  eligibleByStrategy: Partial<Record<StrategyKey, string[]>>;
  /** Objetivos con un experimento de Autopilot corriendo. */
  runningObjectives: ReadonlySet<RetentionObjective>;
  history: PastRun[];
  catalogIncentiveAvailable: boolean;
  now: Date;
}): StrategyChoice {
  const discarded: Discarded[] = [];
  let chosen: StrategyChoice['chosen'] = null;
  const ranked = [...input.opportunities].sort(
    (a, b) =>
      a.incentiveLevel - b.incentiveLevel ||
      ORDER.indexOf(a.strategy) - ORDER.indexOf(b.strategy),
  );
  for (const opportunity of ranked) {
    const base = {
      strategy: opportunity.strategy,
      label: opportunity.label,
      count: opportunity.count,
    };
    if (!opportunity.executable || !opportunity.objective) {
      discarded.push({
        ...base,
        reason: 'NOT_EXECUTABLE',
        detail: opportunity.notExecutableReason ?? 'Autopilot no la ejecuta.',
      });
      continue;
    }
    if (!input.runningObjectives.has(opportunity.objective)) {
      discarded.push({
        ...base,
        reason: 'NO_AUTOPILOT_EXPERIMENT',
        detail:
          opportunity.objective === RetentionObjective.REWARD_GOAL_PROGRESS
            ? 'La automatización "Cerca del premio" no está activa.'
            : 'La automatización "Te extrañamos" no está activa.',
      });
      continue;
    }
    const lastExecuted = input.history.find(
      (run) =>
        run.strategy === opportunity.strategy &&
        run.mode === 'PILOT' &&
        run.status === 'EXECUTED',
    );
    if (
      lastExecuted &&
      input.now.getTime() - lastExecuted.createdAt.getTime() <
        MEASUREMENT_WINDOW_DAYS * MS_PER_DAY
    ) {
      discarded.push({
        ...base,
        reason: 'STILL_MEASURING',
        detail: `Se ejecutó hace menos de ${MEASUREMENT_WINDOW_DAYS} días: primero se mide el resultado.`,
      });
      continue;
    }
    const eligible = input.eligibleByStrategy[opportunity.strategy] ?? [];
    if (eligible.length === 0) {
      discarded.push({
        ...base,
        reason: 'NO_ELIGIBLE',
        detail:
          'Ningún candidato cumple consentimiento de WhatsApp, frecuencia máxima o no estar ya en curso.',
      });
      continue;
    }
    if (chosen) {
      discarded.push({
        ...base,
        reason: 'NOT_CHOSEN',
        detail: 'Una estrategia por corrida: queda para una próxima.',
      });
      continue;
    }
    chosen = {
      opportunity,
      eligibleIds: eligible,
      incentiveLevel: incentiveLevelFor(
        opportunity,
        input.history,
        input.catalogIncentiveAvailable,
      ),
    };
  }
  return { chosen, discarded };
}

/**
 * Escalera de incentivos. Sube a catálogo (3) solo si la misma estrategia ya
 * se probó sin descuento al menos dos veces, con 5+ clientes expuestos en
 * total, y nadie volvió; y solo si hay un incentivo aprobado con costo
 * estimable. Nunca baja la vara por su cuenta en otro caso.
 */
export function incentiveLevelFor(
  opportunity: Pick<Opportunity, 'strategy' | 'incentiveLevel'>,
  history: PastRun[],
  catalogIncentiveAvailable: boolean,
): IncentiveLevel {
  if (!catalogIncentiveAvailable || opportunity.incentiveLevel !== 1) {
    return opportunity.incentiveLevel;
  }
  const tried = history.filter(
    (run) =>
      run.strategy === opportunity.strategy &&
      run.mode === 'PILOT' &&
      run.status === 'EXECUTED' &&
      (run.incentiveLevel ?? 1) < 3,
  );
  const exposed = tried.reduce((sum, run) => sum + run.exposed, 0);
  const returned = tried.reduce((sum, run) => sum + run.returned, 0);
  return tried.length >= 2 && exposed >= 5 && returned === 0 ? 3 : 1;
}

/**
 * Grupo chico y estable: orden por hash del día + cliente (rota entre días,
 * pero el mismo día da siempre el mismo grupo, también en un reintento).
 */
export function selectGroup(
  eligibleIds: string[],
  size: number,
  runKey: string,
): string[] {
  if (size <= 0) return [];
  return [...eligibleIds]
    .map((id) => ({
      id,
      key: createHash('sha256').update(`${runKey}:${id}`).digest('hex'),
    }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .slice(0, size)
    .map((row) => row.id);
}

// ---------------------------------------------------------------------------
// Explicación
// ---------------------------------------------------------------------------

export interface RunFacts {
  totalCustomers: number;
  activeCustomers: number;
  withPhone: number;
  withWhatsappConsent: number;
  optedOut: number;
  customersWithVisits: number;
  fewData: boolean;
  policyAccepted: boolean;
  policyPaused: boolean;
  messageCostSet: boolean;
  campaignsThisWeek: number;
  campaignsCap: number | null;
  recipientsThisWeek: number;
  recipientsCap: number | null;
  messagingSpentMonth: number;
  messagingBudget: number | null;
  currency: string;
}

export interface Explanation {
  explanation: string;
  suggestions: string[];
}

/** Texto determinístico: todos los números salen de `facts`, nada se inventa. */
export function explainRun(input: {
  mode: 'DRY_RUN' | 'PILOT';
  status: 'SIMULATED' | 'EXECUTED' | 'BLOCKED' | 'NO_ACTION';
  facts: RunFacts;
  opportunities: Opportunity[];
  discarded: Discarded[];
  blockers: { code: string; message: string }[];
  chosen: { label: string; groupSize: number; eligible: number } | null;
}): Explanation {
  const { facts } = input;
  const parts: string[] = [];
  const suggestions: string[] = [];

  if (input.status === 'EXECUTED' && input.chosen) {
    parts.push(
      `Se eligió "${input.chosen.label}": ${input.chosen.groupSize} de ${input.chosen.eligible} clientes elegibles quedaron en Autopilot, que les escribe dentro del horario y la política.`,
    );
  } else if (input.status === 'SIMULATED' && input.chosen) {
    parts.push(
      `Simulación: se habría elegido "${input.chosen.label}" para ${input.chosen.groupSize} de ${input.chosen.eligible} clientes elegibles. No se contactó a nadie.`,
    );
  } else if (input.status === 'BLOCKED') {
    parts.push(
      `Había oportunidades, pero la política no permite actuar: ${[
        ...new Set(input.blockers.map((b) => b.message)),
      ].join(' ')}`,
    );
  } else if (input.opportunities.length === 0) {
    parts.push(
      facts.customersWithVisits === 0
        ? 'Todavía no hay clientes con visitas registradas: no hay nada para analizar.'
        : `Ninguno de los ${facts.customersWithVisits} clientes con visitas está demorado, inactivo ni cerca de su premio: no hacía falta contactar a nadie.`,
    );
  } else {
    parts.push(
      `Se encontraron ${input.opportunities.length} oportunidades, pero ninguna se pudo usar hoy.`,
    );
  }

  parts.push(
    `Base: ${facts.activeCustomers} clientes activos, ${facts.withWhatsappConsent} con WhatsApp autorizado, ${facts.optedOut} dados de baja.`,
  );
  if (facts.fewData) {
    parts.push(
      `Con ${facts.customersWithVisits} clientes con visitas hay pocos datos: las estrategias usan reglas fijas del negocio, no un patrón aprendido.`,
    );
  }

  const acted = input.status === 'EXECUTED' || input.status === 'SIMULATED';
  if (!acted) {
    if (!facts.policyAccepted) {
      suggestions.push(
        'Aceptá la política de envíos en Configuración → Políticas.',
      );
    }
    if (facts.policyPaused) {
      suggestions.push(
        'Los envíos están pausados: revisá el motivo y reanudalos en Políticas.',
      );
    }
    if (!facts.messageCostSet) {
      suggestions.push('Falta que Flikker cargue el costo por mensaje.');
    }
    if (facts.withWhatsappConsent === 0 && facts.activeCustomers > 0) {
      suggestions.push(
        `Ninguno de tus ${facts.activeCustomers} clientes autorizó WhatsApp: pedilo con la casilla del check-in o registralo desde la ficha del cliente.`,
      );
    }
    if (input.discarded.some((d) => d.reason === 'NO_AUTOPILOT_EXPERIMENT')) {
      suggestions.push(
        'Activá las automatizaciones en Notificaciones → Automáticas para que Autopilot pueda ejecutar estas estrategias.',
      );
    }
    if (
      facts.campaignsCap !== null &&
      facts.campaignsThisWeek >= facts.campaignsCap
    ) {
      suggestions.push(
        `Ya se usaron las ${facts.campaignsCap} campañas nuevas de esta semana: la próxima corrida es la semana que viene.`,
      );
    }
    if (
      facts.messagingBudget !== null &&
      facts.messagingSpentMonth >= facts.messagingBudget
    ) {
      suggestions.push(
        `El presupuesto de mensajería del mes (${facts.currency} ${facts.messagingBudget}) está usado: se puede subir en Políticas o esperar al mes que viene.`,
      );
    }
    if (input.opportunities.length === 0 && facts.customersWithVisits > 0) {
      suggestions.push(
        'Mientras tanto, conviene sumar clientes nuevos al programa (QR en el mostrador) para tener a quién acompañar.',
      );
    }
  }
  return { explanation: parts.join(' '), suggestions };
}
