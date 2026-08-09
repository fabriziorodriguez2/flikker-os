import { holmBonferroniCorrect } from './multiple-comparisons';

describe('holmBonferroniCorrect — Fase G §36', () => {
  it('returns nothing for zero comparisons', () => {
    expect(holmBonferroniCorrect([])).toEqual([]);
  });

  it('with a single comparison, behaves like plain alpha (no correction needed)', () => {
    const result = holmBonferroniCorrect([{ variantId: 'v1', pValue: 0.03 }]);
    expect(result[0].adjustedAlpha).toBeCloseTo(0.05, 5);
    expect(result[0].significant).toBe(true);
  });

  it('rejects a marginal winner (p=0.04) once 3+ variants are compared', () => {
    // 3 comparisons: alpha/3 ≈ 0.0167 for the smallest p-value. A p of 0.04
    // would have passed uncorrected (< 0.05) but must NOT survive Holm.
    const result = holmBonferroniCorrect([
      { variantId: 'a', pValue: 0.04 },
      { variantId: 'b', pValue: 0.3 },
      { variantId: 'c', pValue: 0.6 },
    ]);
    const a = result.find((r) => r.variantId === 'a')!;
    expect(a.significant).toBe(false);
  });

  it('accepts a strong winner (very small p) even with several comparisons', () => {
    const result = holmBonferroniCorrect([
      { variantId: 'a', pValue: 0.0001 },
      { variantId: 'b', pValue: 0.4 },
      { variantId: 'c', pValue: 0.7 },
    ]);
    const a = result.find((r) => r.variantId === 'a')!;
    expect(a.significant).toBe(true);
  });

  it('step-down: a later comparison is never significant once an earlier one fails, even if its own p is small', () => {
    // b's raw p would pass alpha/(3-1)=0.025 on its own, but a (ranked
    // first) fails its own threshold, breaking the chain for everything after.
    const result = holmBonferroniCorrect([
      { variantId: 'a', pValue: 0.02 }, // needs < alpha/3 ≈ 0.0167 — fails
      { variantId: 'b', pValue: 0.021 }, // needs < alpha/2 = 0.025 — would pass alone
      { variantId: 'c', pValue: 0.6 },
    ]);
    const a = result.find((r) => r.variantId === 'a')!;
    const b = result.find((r) => r.variantId === 'b')!;
    expect(a.significant).toBe(false);
    expect(b.significant).toBe(false);
  });

  it('preserves the caller-provided order in the returned array', () => {
    const result = holmBonferroniCorrect([
      { variantId: 'z', pValue: 0.5 },
      { variantId: 'a', pValue: 0.01 },
    ]);
    expect(result.map((r) => r.variantId)).toEqual(['z', 'a']);
  });
});
