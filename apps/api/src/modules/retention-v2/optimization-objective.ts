import type { VariantResult } from './retention-experiment-metrics.service';
import { holmBonferroniCorrect } from './multiple-comparisons';
import { twoProportionZTest } from './experiment-metrics';

/**
 * Fase G §10/§11/§13/§21/§23/§36/§37 — decides WHICH variant (if any)
 * automatic optimization should favor this round, and WHY. This is the one
 * place all of Fase G's "is this real evidence?" rules live, so both the
 * automatic worker and the manual preview/apply endpoints see the exact
 * same judgment.
 *
 * Deliberately stricter than `determineWinner` (Fase D), which the
 * dashboard still uses unmodified: a human reading PRELIMINARY data can use
 * their own judgment, but nothing here writes to `allocationPercent`
 * without ENOUGH_DATA AND a Holm-corrected significant difference from
 * CONTROL.
 */

export type OptimizationObjectiveKind =
  | 'BEST_ECONOMIC_VARIANT'
  | 'BEST_RETURN_VARIANT'
  | 'NO_CONCLUSION';

export interface ObjectiveDecision {
  kind: OptimizationObjectiveKind;
  variantId: string | null;
  reasonCode:
    | 'OPTIMIZATION_INSUFFICIENT_DATA'
    | 'OPTIMIZATION_NO_CONCLUSION'
    | 'OPTIMIZATION_BEST_RETURN'
    | 'OPTIMIZATION_BEST_ECONOMIC'
    | 'OPTIMIZATION_NEGATIVE_VARIANT';
  /** Every candidate's Holm-adjusted significance, kept for the audit snapshot. */
  evidenceByVariant: Record<
    string,
    { pValue: number; adjustedAlpha: number; significant: boolean }
  >;
  /**
   * Pre-piloto fix (§7/§8) — true whenever there is no picked winner at all
   * (nothing to be ambiguous about), or the picked winner clearly beats the
   * next-best eligible candidate. False means "a pick exists, but it is not
   * clearly ahead of the runner-up" — `checkOptimizationEligibility` is
   * what actually blocks AUTOMATIC on this; `selectOptimizationObjective`
   * itself never withholds `variantId`, so a preview can still show the
   * tentative pick alongside the explanation.
   */
  clearWinner: boolean;
  /** The next-best eligible candidate `picked` was compared against, if any. */
  runnerUpVariantId: string | null;
}

export interface SelectObjectiveInput {
  control: VariantResult | undefined;
  /** Every non-CONTROL, active variant — REMINDER/SOFT_BENEFIT/STRONG_BENEFIT/PROGRESS_REMINDER alike (Fase G §35). */
  candidates: VariantResult[];
  /**
   * The winner an earlier APPLIED round already favored, if any — the
   * hysteresis anchor (Fase G §23). Null on an experiment's first-ever
   * optimization.
   */
  previousWinnerVariantId: string | null;
  /** Hysteresis threshold: minimum meaningful gap, in percentage points, to switch away from the previous winner. */
  minimumMeaningfulUpliftPoints: number;
}

export function selectOptimizationObjective(
  input: SelectObjectiveInput,
): ObjectiveDecision {
  if (!input.control || input.control.stats.evidenceState !== 'ENOUGH_DATA') {
    return {
      kind: 'NO_CONCLUSION',
      variantId: null,
      reasonCode: 'OPTIMIZATION_INSUFFICIENT_DATA',
      evidenceByVariant: {},
      clearWinner: true,
      runnerUpVariantId: null,
    };
  }

  // §6: only ENOUGH_DATA may ever justify an automatic change — PRELIMINARY
  // is not enough here, even though the dashboard happily shows it.
  const eligible = input.candidates.filter(
    (c) =>
      c.stats.evidenceState === 'ENOUGH_DATA' &&
      c.significanceVsControl !== null,
  );
  if (eligible.length === 0) {
    return {
      kind: 'NO_CONCLUSION',
      variantId: null,
      reasonCode: 'OPTIMIZATION_INSUFFICIENT_DATA',
      evidenceByVariant: {},
      clearWinner: true,
      runnerUpVariantId: null,
    };
  }

  // §36: Holm-Bonferroni across every eligible comparison, always — with a
  // single candidate this is mathematically a no-op (adjustedAlpha = alpha).
  const corrected = holmBonferroniCorrect(
    eligible.map((c) => ({
      variantId: c.variantId,
      pValue: c.significanceVsControl!.pValue,
    })),
  );
  const evidenceByVariant = Object.fromEntries(
    corrected.map((c) => [c.variantId, c]),
  );

  const significant = eligible.filter(
    (c) => evidenceByVariant[c.variantId]?.significant,
  );
  if (significant.length === 0) {
    return {
      kind: 'NO_CONCLUSION',
      variantId: null,
      reasonCode: 'OPTIMIZATION_NO_CONCLUSION',
      evidenceByVariant,
      clearWinner: true, // nothing picked — nothing to be ambiguous about
      runnerUpVariantId: null,
    };
  }

  // §10: prefer economic value when EVERY significant candidate has a known
  // one — never invent economics for a variant that lacks it (Fase D §18).
  const allHaveEconomics = significant.every(
    (c) => c.economics.estimatedNetIncrementalValue !== null,
  );

  let picked: VariantResult;
  let kind: OptimizationObjectiveKind;
  if (allHaveEconomics) {
    picked = significant.reduce((best, c) =>
      c.economics.estimatedNetIncrementalValue! >
      best.economics.estimatedNetIncrementalValue!
        ? c
        : best,
    );
    kind = 'BEST_ECONOMIC_VARIANT';
  } else {
    picked = significant.reduce((best, c) =>
      c.stats.returnRate > best.stats.returnRate ? c : best,
    );
    kind = 'BEST_RETURN_VARIANT';
  }

  // §23: hysteresis. Only switch away from the previous winner if the new
  // pick beats it by a meaningful margin — otherwise keep favoring the
  // previous winner, even if it is no longer the single best pick this
  // round, to avoid oscillating on noise between rounds.
  if (
    input.previousWinnerVariantId &&
    input.previousWinnerVariantId !== picked.variantId
  ) {
    const previous = significant.find(
      (c) => c.variantId === input.previousWinnerVariantId,
    );
    if (previous) {
      const gap =
        kind === 'BEST_ECONOMIC_VARIANT'
          ? relativeGapPoints(
              picked.economics.estimatedNetIncrementalValue!,
              previous.economics.estimatedNetIncrementalValue!,
            )
          : (picked.stats.returnRate - previous.stats.returnRate) * 100;
      if (gap < input.minimumMeaningfulUpliftPoints) {
        picked = previous;
      }
    }
  }

  // §7/§8 — clear-winner gate. Compares the FINAL pick (after hysteresis)
  // against the best remaining alternative among the other significant
  // candidates, ranked by the same metric `picked` was chosen by. Always a
  // return-rate z-test — even when the objective is economic (§9): a
  // "better" net economic value that is not backed by a statistically
  // distinguishable return rate is exactly the volatile-estimate case this
  // is meant to catch. This is ONE additional, single-shot comparison, not
  // folded into the vs-CONTROL Holm-Bonferroni family above (a different
  // question — "is the pick's margin over its best rival real?" — deserves
  // its own unadjusted 0.05 threshold rather than borrowing a correction
  // built for a different family of comparisons); documented here exactly
  // as chosen, per this fix's own requirement to spell out the rule.
  const rivals = significant.filter((c) => c.variantId !== picked.variantId);
  let clearWinner = true;
  let runnerUpVariantId: string | null = null;
  if (rivals.length > 0) {
    const runnerUp =
      kind === 'BEST_ECONOMIC_VARIANT'
        ? rivals.reduce((best, c) =>
            c.economics.estimatedNetIncrementalValue! >
            best.economics.estimatedNetIncrementalValue!
              ? c
              : best,
          )
        : rivals.reduce((best, c) =>
            c.stats.returnRate > best.stats.returnRate ? c : best,
          );
    runnerUpVariantId = runnerUp.variantId;
    const race = twoProportionZTest(
      runnerUp.stats.returnedCount,
      runnerUp.stats.exposedCount,
      picked.stats.returnedCount,
      picked.stats.exposedCount,
    );
    // Null only when one side has zero exposure — cannot happen here
    // (ENOUGH_DATA already implies exposedCount > 0), kept as "cannot prove
    // it's clear" rather than silently assuming it is.
    clearWinner = race !== null && race.pValue < NEAR_TIE_ALPHA;
  }

  if (
    picked.upliftPercentagePoints !== null &&
    picked.upliftPercentagePoints < 0
  ) {
    return {
      kind,
      variantId: picked.variantId,
      reasonCode: 'OPTIMIZATION_NEGATIVE_VARIANT',
      evidenceByVariant,
      clearWinner,
      runnerUpVariantId,
    };
  }

  return {
    kind,
    variantId: picked.variantId,
    reasonCode:
      kind === 'BEST_ECONOMIC_VARIANT'
        ? 'OPTIMIZATION_BEST_ECONOMIC'
        : 'OPTIMIZATION_BEST_RETURN',
    evidenceByVariant,
    clearWinner,
    runnerUpVariantId,
  };
}

/** Unadjusted single-shot significance threshold for the clear-winner gate (§8). */
const NEAR_TIE_ALPHA = 0.05;

/**
 * Net-value gaps are currency, not percentage points — expressed here as a
 * percentage of the smaller (previous) value, so the same
 * `minimumMeaningfulUpliftPoints` threshold reads consistently whether the
 * objective is economic or return-rate based. A previous net value of 0 (or
 * negative) is treated as "any positive gap is meaningful" rather than
 * dividing by zero.
 */
function relativeGapPoints(current: number, previous: number): number {
  if (previous <= 0) return current > previous ? Infinity : 0;
  return ((current - previous) / previous) * 100;
}
