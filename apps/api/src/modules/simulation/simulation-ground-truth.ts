import {
  PERSONA_PROFILES,
  type PersonaProfile,
  type PersonaType,
} from './personas';
import type { ExperimentVariantCode } from './scenarios';

/** The three strategies that can ever "win" — CONTROL carries no effect of its own (§13). */
export type TreatableVariantCode = Exclude<ExperimentVariantCode, 'CONTROL'>;

const TREATABLE_CODES: TreatableVariantCode[] = [
  'REMINDER',
  'PROGRESS_REMINDER',
  'SOFT_BENEFIT',
];

function personaEffectForVariant(
  persona: PersonaProfile,
  code: TreatableVariantCode,
): number {
  switch (code) {
    case 'REMINDER':
      return persona.reminderEffect;
    case 'PROGRESS_REMINDER':
      return persona.progressReminderEffect;
    case 'SOFT_BENEFIT':
      return persona.softBenefitEffect;
  }
}

export interface GroundTruthEffect {
  variantCode: TreatableVariantCode;
  /** Population-weighted average ground-truth effect across every customer actually in this run. */
  averageEffect: number;
}

export interface GroundTruthSummary {
  effectsByVariant: GroundTruthEffect[];
  /** Null only when there are no customers at all — never a tie-break coin flip. */
  trueWinner: TreatableVariantCode | null;
}

/**
 * Simulation Center §13/§23 — the answer key. Computed purely from each
 * customer's SECRET persona (§8) — never from anything Flikker observed —
 * so a run's `winnerAccuracy` (§23) has a real, independent ground truth to
 * compare against, not a re-derivation of Flikker's own numbers.
 *
 * Population-weighted, not "what a single persona would show": the actual
 * customer mix of THIS run decides which strategy truly performs best for
 * these particular people — exactly why PROMO_SENSITIVE/PROGRESS_SENSITIVE
 * scenarios (§6) skew the mix, to make a specific strategy truly the best
 * one for that run.
 */
export function computeGroundTruth(
  customers: ReadonlyArray<{ persona: PersonaType }>,
  /**
   * Pre-piloto fix (§13/§14/§15) — which codes are actually running in THIS
   * experiment. Defaults to all three (every scenario before this fix had
   * all three) — a two-arm scenario (CONTROL + exactly one challenger) must
   * restrict `trueWinner` to only the code that could ever actually be
   * detected, or `winnerAccuracy` degenerates to permanently INCORRECT: the
   * ground truth is computed from personas regardless of which variants are
   * seeded, so an absent SOFT_BENEFIT/PROGRESS_REMINDER could otherwise
   * "win" a comparison it was never entered into.
   */
  presentCodes: readonly TreatableVariantCode[] = TREATABLE_CODES,
): GroundTruthSummary {
  const effectsByVariant = TREATABLE_CODES.map((code) => {
    const total = customers.reduce(
      (sum, c) =>
        sum + personaEffectForVariant(PERSONA_PROFILES[c.persona], code),
      0,
    );
    return {
      variantCode: code,
      averageEffect: customers.length > 0 ? total / customers.length : 0,
    };
  });

  const comparable = effectsByVariant.filter((e) =>
    presentCodes.includes(e.variantCode),
  );
  const trueWinner =
    customers.length === 0 || comparable.length === 0
      ? null
      : comparable.reduce((best, effect) =>
          effect.averageEffect > best.averageEffect ? effect : best,
        ).variantCode;

  return { effectsByVariant, trueWinner };
}

// ── Economic ground truth (ajuste pre-piloto §1) ────────────────────────────
// A SEPARATE question from `trueWinner` above: `trueWinner` is purely about
// return-rate effect and says nothing about cost. REMINDER/PROGRESS_REMINDER
// never carry a cost; SOFT_BENEFIT/STRONG_BENEFIT do. Two variants can have a
// real, large gap in return-rate effect and a much smaller (or reversed) gap
// once that cost is subtracted — that is not an error to fix, it is the
// exact thing Fase D/G's own economic preference exists to weigh. This
// section answers "which one is truly better by the numbers, in money" as
// its own, independently computable question — never derived from anything
// Flikker observed.

export interface EconomicGroundTruthInput {
  averageTicketAmount: number;
  estimatedMarginPercent: number;
  /** [0,1] — probability a return also becomes a redemption, conditional on returning (§19's rewardRedemptionRate knob). */
  rewardRedemptionRate: number;
  /**
   * The percentage-off value the scenario's SOFT_BENEFIT/STRONG_BENEFIT
   * variant actually carries (mirrors `SimulationSeeder`'s own preference
   * for `PERCENT_OFF_10`) — null when the scenario's incentive carries no
   * percentage at all, in which case that code's true cost — and therefore
   * its true net value — is genuinely unknown, exactly like
   * `estimateIncentiveCost`'s own "unknown, never guessed" rule.
   */
  incentivePercentageValue: number | null;
}

export interface EconomicGroundTruthEffect {
  variantCode: TreatableVariantCode;
  /** Expected net economic value per ASSIGNED customer — revenue-if-returns minus expected redemption cost. Null when the cost is genuinely unknown (see `incentivePercentageValue`). */
  trueNetValuePerCustomer: number | null;
}

export interface EconomicGroundTruthSummary {
  effectsByVariant: EconomicGroundTruthEffect[];
  /** Null when there are no customers, no present codes, or every present code's cost is unknown. */
  economicWinner: TreatableVariantCode | null;
}

const COST_BEARING_CODES: TreatableVariantCode[] = ['SOFT_BENEFIT'];

export function computeEconomicGroundTruth(
  returnEffects: readonly GroundTruthEffect[],
  presentCodes: readonly TreatableVariantCode[],
  input: EconomicGroundTruthInput,
): EconomicGroundTruthSummary {
  const marginFraction = input.estimatedMarginPercent / 100;
  const unitCost =
    input.incentivePercentageValue === null
      ? null
      : (input.incentivePercentageValue / 100) * input.averageTicketAmount;

  const effectsByVariant = returnEffects.map((effect) => {
    const costBearing = COST_BEARING_CODES.includes(effect.variantCode);
    if (costBearing && unitCost === null) {
      return { variantCode: effect.variantCode, trueNetValuePerCustomer: null };
    }
    const expectedRevenue =
      effect.averageEffect * input.averageTicketAmount * marginFraction;
    const expectedCost = costBearing
      ? effect.averageEffect * input.rewardRedemptionRate * (unitCost ?? 0)
      : 0;
    return {
      variantCode: effect.variantCode,
      trueNetValuePerCustomer: expectedRevenue - expectedCost,
    };
  });

  const comparable = effectsByVariant.filter(
    (
      e,
    ): e is {
      variantCode: TreatableVariantCode;
      trueNetValuePerCustomer: number;
    } =>
      presentCodes.includes(e.variantCode) &&
      e.trueNetValuePerCustomer !== null,
  );
  const economicWinner =
    comparable.length === 0
      ? null
      : comparable.reduce((best, e) =>
          e.trueNetValuePerCustomer > best.trueNetValuePerCustomer ? e : best,
        ).variantCode;

  return { effectsByVariant, economicWinner };
}
