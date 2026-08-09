/**
 * Pure per-variant statistics (Fase D §10-14, §22-23, §36). Everything here
 * takes plain counts — the DB query lives in `RetentionExperimentMetricsService`
 * — so the arithmetic that decides what a dashboard says is unit-testable
 * without a database.
 */

export interface VariantCounts {
  variantId: string;
  assignedCount: number;
  exposedCount: number;
  returnedCount: number;
  confirmedReturnedCount: number;
  /** Every `RetentionOutcome.daysToReturn` for this variant's returned outcomes. */
  daysToReturnSamples: number[];
}

export type EvidenceState = 'INSUFFICIENT_DATA' | 'PRELIMINARY' | 'ENOUGH_DATA';

export interface VariantStats {
  variantId: string;
  assignedCount: number;
  exposedCount: number;
  returnedCount: number;
  confirmedReturnedCount: number;
  nonReturnedCount: number;
  returnRate: number;
  confirmedReturnRate: number;
  averageDaysToReturn: number | null;
  medianDaysToReturn: number | null;
  evidenceState: EvidenceState;
}

/**
 * `returnedCount / exposedCount` — never `assignedCount`. An assignment that
 * was never exposed (still PENDING, or SKIPPED before anything happened) has
 * no outcome and must not silently deflate the rate (Fase D §10).
 */
export function computeVariantStats(
  counts: VariantCounts,
  minimumSampleSizeForRecommendations: number,
): VariantStats {
  const { exposedCount, returnedCount, confirmedReturnedCount } = counts;

  return {
    variantId: counts.variantId,
    assignedCount: counts.assignedCount,
    exposedCount,
    returnedCount,
    confirmedReturnedCount,
    nonReturnedCount: exposedCount - returnedCount,
    returnRate: exposedCount > 0 ? returnedCount / exposedCount : 0,
    confirmedReturnRate:
      exposedCount > 0 ? confirmedReturnedCount / exposedCount : 0,
    averageDaysToReturn: average(counts.daysToReturnSamples),
    medianDaysToReturn: median(counts.daysToReturnSamples),
    evidenceState: evidenceState(
      exposedCount,
      minimumSampleSizeForRecommendations,
    ),
  };
}

/**
 * Deliberately simple, documented heuristic rather than a statistical
 * threshold: below the owner's configured minimum is INSUFFICIENT_DATA;
 * below twice that is PRELIMINARY (a read exists, but treat it as an early
 * signal); at or above twice the minimum is ENOUGH_DATA. No winner is ever
 * declared while either side of a comparison is INSUFFICIENT_DATA.
 */
export function evidenceState(
  exposedCount: number,
  minimumSampleSizeForRecommendations: number,
): EvidenceState {
  if (exposedCount < minimumSampleSizeForRecommendations)
    return 'INSUFFICIENT_DATA';
  if (exposedCount < minimumSampleSizeForRecommendations * 2)
    return 'PRELIMINARY';
  return 'ENOUGH_DATA';
}

/**
 * Percentage points, not a relative percentage — Fase D §11 is explicit that
 * "+175%" is not the headline number. Can be negative (§36): an intervention
 * is allowed to do worse than doing nothing at all.
 */
export function upliftPercentagePoints(
  returnRateVariant: number,
  returnRateControl: number,
): number {
  return returnRateVariant - returnRateControl;
}

/**
 * An estimate, not a count of individuals who "returned because of" the
 * variant — no individual causality is ever claimed (Fase D §2, §12).
 */
export function estimatedIncrementalReturns(
  uplift: number,
  exposedCountVariant: number,
): number {
  return uplift * exposedCountVariant;
}

export type WinnerConclusion =
  | { kind: 'NO_CONCLUSION'; reason: string }
  | { kind: 'BEST_RETURN_RATE'; variantId: string }
  | { kind: 'BEST_INCREMENTAL_VALUE'; variantId: string };

/**
 * Deterministic, non-statistical "what does the data suggest right now"
 * (Fase D §23). Never declares a winner without a CONTROL to compare
 * against, or while any side being compared is INSUFFICIENT_DATA — and never
 * optimizes anything automatically (Fase D §37): this is a read, not an
 * action.
 */
export function determineWinner(
  control: VariantStats | undefined,
  candidates: { stats: VariantStats; netIncrementalValue: number | null }[],
): WinnerConclusion {
  if (!control) {
    return { kind: 'NO_CONCLUSION', reason: 'NO_CONTROL' };
  }
  if (control.evidenceState === 'INSUFFICIENT_DATA') {
    return { kind: 'NO_CONCLUSION', reason: 'CONTROL_INSUFFICIENT_DATA' };
  }
  const comparable = candidates.filter(
    (c) => c.stats.evidenceState !== 'INSUFFICIENT_DATA',
  );
  if (comparable.length === 0) {
    return { kind: 'NO_CONCLUSION', reason: 'NO_VARIANT_WITH_ENOUGH_DATA' };
  }

  // Prefer net economic value when every comparable candidate has one — a
  // higher return rate that costs more to achieve is not automatically the
  // better strategy (Fase D §23's own 20% OFF vs. Upgrade example).
  const withValue = comparable.filter((c) => c.netIncrementalValue !== null);
  if (withValue.length === comparable.length) {
    const best = withValue.reduce((a, b) =>
      b.netIncrementalValue! > a.netIncrementalValue! ? b : a,
    );
    return { kind: 'BEST_INCREMENTAL_VALUE', variantId: best.stats.variantId };
  }

  const best = comparable.reduce((a, b) =>
    b.stats.returnRate > a.stats.returnRate ? b : a,
  );
  return { kind: 'BEST_RETURN_RATE', variantId: best.stats.variantId };
}

// ── Return-only / economic-only winner reads (ajuste pre-piloto §1) ─────────
// `determineWinner` above answers ONE question — "what does the dashboard
// say right now" — which deliberately prefers net economic value over raw
// return rate whenever every comparable candidate has a known one (Fase D
// §23's own upgrade-vs-discount example). That single answer conflates two
// different questions the moment Flikker actually optimizes on economics:
// "did it pick the variant with the best RETURN RATE?" and "did it pick the
// variant with the best NET VALUE?" can have different correct answers. The
// two functions below isolate each question on its own, reusing exactly the
// same NO_CONCLUSION gates `determineWinner` already uses (duplicated
// rather than refactored out of it, to avoid changing that already-shipped,
// already-tested function's behavior for the real dashboard at all).

/** Same question as `determineWinner`, but ALWAYS by return rate — economics, if present, are ignored entirely. */
export function determineWinnerByReturnRate(
  control: VariantStats | undefined,
  candidates: { stats: VariantStats }[],
): WinnerConclusion {
  if (!control) return { kind: 'NO_CONCLUSION', reason: 'NO_CONTROL' };
  if (control.evidenceState === 'INSUFFICIENT_DATA') {
    return { kind: 'NO_CONCLUSION', reason: 'CONTROL_INSUFFICIENT_DATA' };
  }
  const comparable = candidates.filter(
    (c) => c.stats.evidenceState !== 'INSUFFICIENT_DATA',
  );
  if (comparable.length === 0) {
    return { kind: 'NO_CONCLUSION', reason: 'NO_VARIANT_WITH_ENOUGH_DATA' };
  }
  const best = comparable.reduce((a, b) =>
    b.stats.returnRate > a.stats.returnRate ? b : a,
  );
  return { kind: 'BEST_RETURN_RATE', variantId: best.stats.variantId };
}

/**
 * Same question as `determineWinner`, but ALWAYS by net economic value —
 * never falls back to return rate. NO_CONCLUSION whenever even one
 * comparable candidate's net value is unknown (same "never guess" rule
 * `determineWinner` itself uses), since picking "the best of the ones we
 * happen to know" would silently ignore a candidate that might really be
 * better.
 */
export function determineWinnerByEconomics(
  control: VariantStats | undefined,
  candidates: { stats: VariantStats; netIncrementalValue: number | null }[],
): WinnerConclusion {
  if (!control) return { kind: 'NO_CONCLUSION', reason: 'NO_CONTROL' };
  if (control.evidenceState === 'INSUFFICIENT_DATA') {
    return { kind: 'NO_CONCLUSION', reason: 'CONTROL_INSUFFICIENT_DATA' };
  }
  const comparable = candidates.filter(
    (c) => c.stats.evidenceState !== 'INSUFFICIENT_DATA',
  );
  if (comparable.length === 0) {
    return { kind: 'NO_CONCLUSION', reason: 'NO_VARIANT_WITH_ENOUGH_DATA' };
  }
  if (comparable.some((c) => c.netIncrementalValue === null)) {
    return { kind: 'NO_CONCLUSION', reason: 'ECONOMICS_UNKNOWN' };
  }
  const best = comparable.reduce((a, b) =>
    b.netIncrementalValue! > a.netIncrementalValue! ? b : a,
  );
  return { kind: 'BEST_INCREMENTAL_VALUE', variantId: best.stats.variantId };
}

// ── Optional significance read (Fase D §14) ─────────────────────────────────
// A plain two-proportion z-test — no statistics library: the math is a dozen
// lines and pulling in a dependency for it would be disproportionate. This is
// never the sole basis for anything the UI decides to show or hide; it is an
// extra, clearly-labelled number alongside the sample-size states above.

export interface SignificanceRead {
  pValue: number;
  /** z-statistic, kept for anyone who wants to sanity-check `pValue`. */
  zScore: number;
}

export function twoProportionZTest(
  returnedA: number,
  exposedA: number,
  returnedB: number,
  exposedB: number,
): SignificanceRead | null {
  if (exposedA === 0 || exposedB === 0) return null;

  const p1 = returnedA / exposedA;
  const p2 = returnedB / exposedB;
  const pooled = (returnedA + returnedB) / (exposedA + exposedB);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / exposedA + 1 / exposedB));
  if (se === 0) return null;

  const zScore = (p2 - p1) / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(zScore)));
  return { pValue, zScore };
}

/** Standard normal CDF via the Abramowitz–Stegun erf approximation (7.1.26). */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * z);
  const poly =
    t *
    (0.31938153 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const pdf = Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI);
  return 1 - pdf * poly;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
