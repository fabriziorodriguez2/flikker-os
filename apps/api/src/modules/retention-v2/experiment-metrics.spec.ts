import {
  computeVariantStats,
  determineWinner,
  estimatedIncrementalReturns,
  evidenceState,
  twoProportionZTest,
  upliftPercentagePoints,
  type VariantCounts,
  type VariantStats,
} from './experiment-metrics';

function counts(overrides: Partial<VariantCounts> = {}): VariantCounts {
  return {
    variantId: 'var-1',
    assignedCount: 100,
    exposedCount: 100,
    returnedCount: 0,
    confirmedReturnedCount: 0,
    daysToReturnSamples: [],
    ...overrides,
  };
}

describe('computeVariantStats — Fase D §10', () => {
  it('divides by exposedCount, never assignedCount', () => {
    const stats = computeVariantStats(
      counts({ assignedCount: 120, exposedCount: 100, returnedCount: 20 }),
      30,
    );
    expect(stats.returnRate).toBe(0.2);
  });

  it('is exactly 0% when nobody returned, not undefined or NaN', () => {
    const stats = computeVariantStats(
      counts({ exposedCount: 50, returnedCount: 0 }),
      30,
    );
    expect(stats.returnRate).toBe(0);
    expect(stats.nonReturnedCount).toBe(50);
  });

  it('never divides by zero when nobody was ever exposed', () => {
    const stats = computeVariantStats(
      counts({ exposedCount: 0, returnedCount: 0 }),
      30,
    );
    expect(stats.returnRate).toBe(0);
    expect(stats.confirmedReturnRate).toBe(0);
  });

  it('computes average and median days to return', () => {
    const stats = computeVariantStats(
      counts({ returnedCount: 3, daysToReturnSamples: [2, 4, 6] }),
      30,
    );
    expect(stats.averageDaysToReturn).toBe(4);
    expect(stats.medianDaysToReturn).toBe(4);
  });

  it('median of an even sample averages the two middle values', () => {
    const stats = computeVariantStats(
      counts({ returnedCount: 4, daysToReturnSamples: [1, 2, 3, 10] }),
      30,
    );
    expect(stats.medianDaysToReturn).toBe(2.5);
  });

  it('days-to-return is null when there is nothing to average', () => {
    const stats = computeVariantStats(counts({ daysToReturnSamples: [] }), 30);
    expect(stats.averageDaysToReturn).toBeNull();
    expect(stats.medianDaysToReturn).toBeNull();
  });
});

describe('evidenceState — Fase D §13', () => {
  it('below the minimum is INSUFFICIENT_DATA', () => {
    expect(evidenceState(10, 30)).toBe('INSUFFICIENT_DATA');
  });

  it('at least the minimum but under 2x is PRELIMINARY', () => {
    expect(evidenceState(40, 30)).toBe('PRELIMINARY');
  });

  it('at 2x the minimum or above is ENOUGH_DATA', () => {
    expect(evidenceState(60, 30)).toBe('ENOUGH_DATA');
  });
});

describe('upliftPercentagePoints / estimatedIncrementalReturns — Fase D §11-12', () => {
  it('is percentage points, not a relative percentage', () => {
    expect(upliftPercentagePoints(0.22, 0.08)).toBeCloseTo(0.14);
  });

  it('can be negative — an intervention can underperform doing nothing (§36)', () => {
    expect(upliftPercentagePoints(0.09, 0.12)).toBeCloseTo(-0.03);
  });

  it('estimated incremental returns scale uplift by exposure', () => {
    expect(estimatedIncrementalReturns(0.14, 100)).toBeCloseTo(14);
  });

  it('negative uplift gives negative incremental returns, shown honestly', () => {
    expect(estimatedIncrementalReturns(-0.03, 100)).toBeCloseTo(-3);
  });
});

describe('twoProportionZTest — Fase D §14', () => {
  it('a large, clear difference yields a small p-value', () => {
    const result = twoProportionZTest(8, 100, 22, 100);
    expect(result).not.toBeNull();
    expect(result!.pValue).toBeLessThan(0.05);
  });

  it('identical rates yield a p-value near 1', () => {
    const result = twoProportionZTest(20, 100, 20, 100);
    expect(result!.pValue).toBeGreaterThan(0.9);
  });

  it('returns null instead of dividing by zero with no exposure', () => {
    expect(twoProportionZTest(0, 0, 5, 50)).toBeNull();
  });
});

function stats(overrides: Partial<VariantStats> = {}): VariantStats {
  return {
    variantId: 'var-1',
    assignedCount: 100,
    exposedCount: 100,
    returnedCount: 10,
    confirmedReturnedCount: 0,
    nonReturnedCount: 90,
    returnRate: 0.1,
    confirmedReturnRate: 0,
    averageDaysToReturn: 3,
    medianDaysToReturn: 3,
    evidenceState: 'ENOUGH_DATA',
    ...overrides,
  };
}

describe('determineWinner — Fase D §23', () => {
  it('NO_CONCLUSION without a CONTROL', () => {
    expect(determineWinner(undefined, [])).toEqual({
      kind: 'NO_CONCLUSION',
      reason: 'NO_CONTROL',
    });
  });

  it('NO_CONCLUSION when CONTROL itself has insufficient data', () => {
    const control = stats({ evidenceState: 'INSUFFICIENT_DATA' });
    const candidate = {
      stats: stats({ variantId: 'var-2', returnRate: 0.2 }),
      netIncrementalValue: null,
    };
    expect(determineWinner(control, [candidate])).toEqual({
      kind: 'NO_CONCLUSION',
      reason: 'CONTROL_INSUFFICIENT_DATA',
    });
  });

  it('NO_CONCLUSION when every candidate has insufficient data', () => {
    const control = stats();
    const candidate = {
      stats: stats({ variantId: 'var-2', evidenceState: 'INSUFFICIENT_DATA' }),
      netIncrementalValue: null,
    };
    expect(determineWinner(control, [candidate])).toEqual({
      kind: 'NO_CONCLUSION',
      reason: 'NO_VARIANT_WITH_ENOUGH_DATA',
    });
  });

  it('picks the best return rate when economics are not available for every candidate', () => {
    const control = stats({ returnRate: 0.08 });
    const weak = {
      stats: stats({ variantId: 'var-weak', returnRate: 0.11 }),
      netIncrementalValue: null,
    };
    const strong = {
      stats: stats({ variantId: 'var-strong', returnRate: 0.22 }),
      netIncrementalValue: 500,
    };
    expect(determineWinner(control, [weak, strong])).toEqual({
      kind: 'BEST_RETURN_RATE',
      variantId: 'var-strong',
    });
  });

  it('prefers net economic value over raw return rate once every candidate has one', () => {
    // The Fase D §23 example: higher return rate can still be the worse deal.
    const control = stats({ returnRate: 0.08 });
    const higherReturnCheaperMargin = {
      stats: stats({ variantId: 'discount-20', returnRate: 0.24 }),
      netIncrementalValue: 300,
    };
    const lowerReturnBetterMargin = {
      stats: stats({ variantId: 'upgrade', returnRate: 0.22 }),
      netIncrementalValue: 450,
    };
    expect(
      determineWinner(control, [
        higherReturnCheaperMargin,
        lowerReturnBetterMargin,
      ]),
    ).toEqual({ kind: 'BEST_INCREMENTAL_VALUE', variantId: 'upgrade' });
  });

  it('never returns a variant flagged INSUFFICIENT_DATA even if it looks best', () => {
    const control = stats({ returnRate: 0.08 });
    const insufficient = {
      stats: stats({
        variantId: 'var-lucky',
        returnRate: 0.9,
        evidenceState: 'INSUFFICIENT_DATA',
      }),
      netIncrementalValue: null,
    };
    const solid = {
      stats: stats({ variantId: 'var-solid', returnRate: 0.15 }),
      netIncrementalValue: null,
    };
    expect(determineWinner(control, [insufficient, solid])).toEqual({
      kind: 'BEST_RETURN_RATE',
      variantId: 'var-solid',
    });
  });
});
