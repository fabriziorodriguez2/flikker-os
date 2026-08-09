/**
 * Fase G §36 — a light, dependency-free Holm-Bonferroni correction.
 *
 * Fase D shipped one p-value per variant-vs-CONTROL comparison
 * (`twoProportionZTest`) with an explicit note that it never corrects for
 * running several of those at once. That is fine for a human reading a
 * dashboard, but AUTOMATIC optimization decides on its own — with 3+
 * non-control variants, "at least one p < 0.05 by chance" becomes likely
 * enough that treating any single comparison as "significant" would
 * overreact to noise. Holm-Bonferroni is the standard conservative-but-not-
 * overkill fix, and it is a dozen lines of arithmetic — no statistics
 * package is justified for this.
 *
 * Only used to decide AUTOMATIC eligibility (Fase G §37). The dashboard
 * keeps showing Fase D's original, unadjusted p-values — this never changes
 * what a human sees, only what the optimizer is allowed to act on.
 */

export interface ComparisonInput {
  variantId: string;
  pValue: number;
}

export interface ComparisonResult {
  variantId: string;
  pValue: number;
  /** Holm-adjusted rejection threshold this comparison had to beat. */
  adjustedAlpha: number;
  /** True only if this AND every comparison ranked above it (smaller p) also rejected. */
  significant: boolean;
}

/**
 * Standard Holm-Bonferroni step-down procedure at family-wise level `alpha`
 * (default 0.05): sort p-values ascending, test the smallest against
 * alpha/m, the next against alpha/(m-1), and so on — but a rejection only
 * counts if every comparison ranked before it also rejected (step-down: the
 * first failure stops the chain).
 */
export function holmBonferroniCorrect(
  comparisons: ComparisonInput[],
  alpha = 0.05,
): ComparisonResult[] {
  const m = comparisons.length;
  if (m === 0) return [];

  const sorted = [...comparisons].sort((a, b) => a.pValue - b.pValue);

  const results: ComparisonResult[] = [];
  let chainIntact = true;
  for (let i = 0; i < sorted.length; i++) {
    const adjustedAlpha = alpha / (m - i);
    const rejects = sorted[i].pValue < adjustedAlpha;
    chainIntact = chainIntact && rejects;
    results.push({
      variantId: sorted[i].variantId,
      pValue: sorted[i].pValue,
      adjustedAlpha,
      significant: chainIntact,
    });
  }

  // Return in the caller's original order — callers look up by variantId,
  // never rely on array position.
  const byVariant = new Map(results.map((r) => [r.variantId, r]));
  return comparisons.map((c) => byVariant.get(c.variantId)!);
}
