import { pickWeighted, type Rng } from './prng';

/**
 * Simulation Center §8 — the secret ground truth. Real Flikker code (the
 * simulated Customer/Retention Engine rows) never sees a persona label —
 * only the simulator's own bookkeeping does. This is exactly what lets a
 * run test whether Flikker's real algorithms can correctly infer effects
 * from incomplete, noisy, observed data, instead of just replaying answers
 * it was handed.
 */
export type PersonaType =
  | 'WEEKLY_REGULAR'
  | 'BIWEEKLY'
  | 'MONTHLY'
  | 'NEW'
  | 'HIGH_CHURN'
  | 'IRREGULAR'
  | 'PROMOTION_SENSITIVE'
  | 'PROMOTION_INSENSITIVE'
  | 'PROGRESS_SENSITIVE';

export interface PersonaProfile {
  type: PersonaType;
  description: string;
  /** Average days between organic physical returns, absent any message effect. */
  averageCadenceDays: number;
  /** Day-to-day spread around the average — larger = less predictable (§14). */
  cadenceJitterDays: number;
  /**
   * Ground-truth probability [0,1] this persona checks in (scans) on a given
   * physical return, before any scenario-level `checkinComplianceRate`
   * override (§11/§12) is applied on top.
   */
  baselineCheckinComplianceRate: number;
  /** Ground-truth probability a plain REMINDER nudges an extra/earlier return (§13). */
  reminderEffect: number;
  /** Ground-truth probability PROGRESS_REMINDER nudges an extra/earlier return (§13). */
  progressReminderEffect: number;
  /** Ground-truth probability a SOFT_BENEFIT/incentive nudges an extra/earlier return (§13). */
  softBenefitEffect: number;
  /** Probability of leaving a review after a visible (checked-in) visit. */
  reviewClickProbability: number;
  /** Probability this persona stops returning entirely after any given cycle. */
  churnHazardPerCycle: number;
}

/**
 * Ground-truth profiles. Deliberately NOT uniform — REMINDER's effect is
 * small everywhere (§13: "small effect"), PROGRESS_REMINDER is strong only
 * for PROGRESS_SENSITIVE, SOFT_BENEFIT is strong only for
 * PROMOTION_SENSITIVE and near-zero for PROMOTION_INSENSITIVE — exactly the
 * asymmetry a correct experiment/optimization engine should be able to
 * detect from observed (noisy, partial) outcomes alone.
 */
export const PERSONA_PROFILES: Record<PersonaType, PersonaProfile> = {
  WEEKLY_REGULAR: {
    type: 'WEEKLY_REGULAR',
    description: 'Vuelve casi religiosamente cada semana, con o sin nudge.',
    averageCadenceDays: 7,
    cadenceJitterDays: 2,
    baselineCheckinComplianceRate: 0.8,
    reminderEffect: 0.05,
    progressReminderEffect: 0.05,
    softBenefitEffect: 0.05,
    reviewClickProbability: 0.25,
    churnHazardPerCycle: 0.01,
  },
  BIWEEKLY: {
    type: 'BIWEEKLY',
    description: 'Cadencia estable cada dos semanas.',
    averageCadenceDays: 14,
    cadenceJitterDays: 3,
    baselineCheckinComplianceRate: 0.7,
    reminderEffect: 0.08,
    progressReminderEffect: 0.08,
    softBenefitEffect: 0.08,
    reviewClickProbability: 0.2,
    churnHazardPerCycle: 0.02,
  },
  MONTHLY: {
    type: 'MONTHLY',
    description: 'Vuelve aproximadamente una vez al mes.',
    averageCadenceDays: 30,
    cadenceJitterDays: 5,
    baselineCheckinComplianceRate: 0.6,
    reminderEffect: 0.1,
    progressReminderEffect: 0.1,
    softBenefitEffect: 0.1,
    reviewClickProbability: 0.15,
    churnHazardPerCycle: 0.03,
  },
  NEW: {
    type: 'NEW',
    description:
      'Pocos datos todavía — comportamiento incierto, alto riesgo de no volver nunca.',
    averageCadenceDays: 21,
    cadenceJitterDays: 10,
    baselineCheckinComplianceRate: 0.5,
    reminderEffect: 0.1,
    progressReminderEffect: 0.1,
    softBenefitEffect: 0.12,
    reviewClickProbability: 0.1,
    churnHazardPerCycle: 0.15,
  },
  HIGH_CHURN: {
    type: 'HIGH_CHURN',
    description:
      'Probabilidad alta de dejar de volver en cualquier ciclo, casi sin importar el estímulo.',
    averageCadenceDays: 25,
    cadenceJitterDays: 8,
    baselineCheckinComplianceRate: 0.4,
    reminderEffect: 0.03,
    progressReminderEffect: 0.03,
    softBenefitEffect: 0.05,
    reviewClickProbability: 0.05,
    churnHazardPerCycle: 0.25,
  },
  IRREGULAR: {
    type: 'IRREGULAR',
    description:
      'Cadencia genuinamente impredecible — mucho ruido, poco patrón (§14).',
    averageCadenceDays: 20,
    cadenceJitterDays: 15,
    baselineCheckinComplianceRate: 0.55,
    reminderEffect: 0.04,
    progressReminderEffect: 0.04,
    softBenefitEffect: 0.04,
    reviewClickProbability: 0.1,
    churnHazardPerCycle: 0.08,
  },
  PROMOTION_SENSITIVE: {
    type: 'PROMOTION_SENSITIVE',
    description:
      'El incentivo (SOFT_BENEFIT) mueve la aguja fuerte; un simple recordatorio, casi nada.',
    averageCadenceDays: 18,
    cadenceJitterDays: 5,
    baselineCheckinComplianceRate: 0.65,
    reminderEffect: 0.03,
    progressReminderEffect: 0.05,
    softBenefitEffect: 0.25,
    reviewClickProbability: 0.12,
    churnHazardPerCycle: 0.05,
  },
  PROMOTION_INSENSITIVE: {
    type: 'PROMOTION_INSENSITIVE',
    description:
      'El incentivo casi no cambia nada — vuelve por costumbre, no por descuento.',
    averageCadenceDays: 16,
    cadenceJitterDays: 5,
    baselineCheckinComplianceRate: 0.7,
    reminderEffect: 0.05,
    progressReminderEffect: 0.05,
    softBenefitEffect: 0.01,
    reviewClickProbability: 0.15,
    churnHazardPerCycle: 0.04,
  },
  PROGRESS_SENSITIVE: {
    type: 'PROGRESS_SENSITIVE',
    description:
      'Ver el progreso hacia una recompensa (PROGRESS_REMINDER) es lo que realmente la trae de vuelta.',
    averageCadenceDays: 15,
    cadenceJitterDays: 4,
    baselineCheckinComplianceRate: 0.75,
    reminderEffect: 0.03,
    progressReminderEffect: 0.22,
    softBenefitEffect: 0.05,
    reviewClickProbability: 0.18,
    churnHazardPerCycle: 0.03,
  },
};

/**
 * Default population mix for scenarios that don't skew toward a specific
 * persona (e.g. BASELINE_HEALTHY). Shares sum to 1 — verified by a test,
 * not just by eyeballing the literals below.
 */
export const DEFAULT_PERSONA_MIX: Record<PersonaType, number> = {
  WEEKLY_REGULAR: 0.15,
  BIWEEKLY: 0.2,
  MONTHLY: 0.2,
  NEW: 0.15,
  HIGH_CHURN: 0.1,
  IRREGULAR: 0.1,
  PROMOTION_SENSITIVE: 0.05,
  PROMOTION_INSENSITIVE: 0.03,
  PROGRESS_SENSITIVE: 0.02,
};

/** Assigns one ground-truth persona to a simulated customer, seeded (§9). */
export function pickPersona(
  rng: Rng,
  mix: Record<PersonaType, number> = DEFAULT_PERSONA_MIX,
): PersonaType {
  const options = (Object.keys(mix) as PersonaType[]).map((type) => ({
    value: type,
    weight: mix[type],
  }));
  return pickWeighted(rng, options);
}
