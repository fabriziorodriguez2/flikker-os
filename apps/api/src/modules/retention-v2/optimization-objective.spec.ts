import { RetentionStrategyType } from '@prisma/client';
import { selectOptimizationObjective } from './optimization-objective';
import type { VariantResult } from './retention-experiment-metrics.service';

function variant(
  overrides: Partial<VariantResult> & { variantId: string },
): VariantResult {
  return {
    variantName: overrides.variantId,
    strategyType: RetentionStrategyType.SOFT_BENEFIT,
    stats: {
      variantId: overrides.variantId,
      assignedCount: 100,
      exposedCount: 100,
      returnedCount: 20,
      confirmedReturnedCount: 20,
      nonReturnedCount: 80,
      returnRate: 0.2,
      confirmedReturnRate: 0.2,
      averageDaysToReturn: 5,
      medianDaysToReturn: 5,
      evidenceState: 'ENOUGH_DATA',
    },
    upliftPercentagePoints: 0.1,
    estimatedIncrementalReturns: 10,
    economics: {
      associatedRevenueEstimate: null,
      incrementalRevenueEstimate: null,
      incrementalGrossMarginEstimate: null,
      knownPromotionalCost: 0,
      estimatedPromotionalCost: 0,
      unknownCostRedemptions: 0,
      estimatedNetIncrementalValue: null,
      estimatedROI: null,
    },
    significanceVsControl: { pValue: 0.01, zScore: 3 },
    ...overrides,
  };
}

const control = variant({
  variantId: 'control',
  strategyType: RetentionStrategyType.CONTROL,
  stats: {
    variantId: 'control',
    assignedCount: 100,
    exposedCount: 100,
    returnedCount: 10,
    confirmedReturnedCount: 10,
    nonReturnedCount: 90,
    returnRate: 0.1,
    confirmedReturnRate: 0.1,
    averageDaysToReturn: 6,
    medianDaysToReturn: 6,
    evidenceState: 'ENOUGH_DATA',
  },
  upliftPercentagePoints: null,
  significanceVsControl: null,
});

const BASE = {
  previousWinnerVariantId: null,
  minimumMeaningfulUpliftPoints: 5,
};

describe('selectOptimizationObjective — Fase G §6: only ENOUGH_DATA can drive automation', () => {
  it('returns NO_CONCLUSION when control lacks enough data', () => {
    const result = selectOptimizationObjective({
      control: variant({
        variantId: 'control',
        stats: { ...control.stats, evidenceState: 'PRELIMINARY' },
      }),
      candidates: [variant({ variantId: 'a' })],
      ...BASE,
    });
    expect(result.kind).toBe('NO_CONCLUSION');
    expect(result.reasonCode).toBe('OPTIMIZATION_INSUFFICIENT_DATA');
  });

  it('returns NO_CONCLUSION when no candidate has ENOUGH_DATA', () => {
    const result = selectOptimizationObjective({
      control,
      candidates: [
        variant({
          variantId: 'a',
          stats: {
            ...control.stats,
            variantId: 'a',
            evidenceState: 'PRELIMINARY',
          },
        }),
      ],
      ...BASE,
    });
    expect(result.kind).toBe('NO_CONCLUSION');
    expect(result.reasonCode).toBe('OPTIMIZATION_INSUFFICIENT_DATA');
  });

  it('returns NO_CONCLUSION with no control at all', () => {
    const result = selectOptimizationObjective({
      control: undefined,
      candidates: [variant({ variantId: 'a' })],
      ...BASE,
    });
    expect(result.kind).toBe('NO_CONCLUSION');
  });
});

describe('selectOptimizationObjective — economic vs return-rate priority', () => {
  it('prefers BEST_ECONOMIC_VARIANT when every significant candidate has known economics', () => {
    const a = variant({
      variantId: 'a',
      stats: { ...control.stats, variantId: 'a', returnRate: 0.23 },
      economics: { ...control.economics, estimatedNetIncrementalValue: 1300 },
    });
    const b = variant({
      variantId: 'b',
      stats: { ...control.stats, variantId: 'b', returnRate: 0.22 },
      economics: { ...control.economics, estimatedNetIncrementalValue: 2800 },
    });
    const result = selectOptimizationObjective({
      control,
      candidates: [a, b],
      ...BASE,
    });
    expect(result.kind).toBe('BEST_ECONOMIC_VARIANT');
    expect(result.variantId).toBe('b'); // higher net value despite lower return rate
    expect(result.reasonCode).toBe('OPTIMIZATION_BEST_ECONOMIC');
  });

  it('falls back to BEST_RETURN_VARIANT when economics are unknown for some significant candidate', () => {
    const a = variant({
      variantId: 'a',
      stats: { ...control.stats, variantId: 'a', returnRate: 0.25 },
      economics: { ...control.economics, estimatedNetIncrementalValue: null },
    });
    const result = selectOptimizationObjective({
      control,
      candidates: [a],
      ...BASE,
    });
    expect(result.kind).toBe('BEST_RETURN_VARIANT');
    expect(result.reasonCode).toBe('OPTIMIZATION_BEST_RETURN');
  });

  it('never invents economics for a variant that lacks it (Fase D §18 preserved)', () => {
    const a = variant({
      variantId: 'a',
      economics: { ...control.economics, estimatedNetIncrementalValue: 500 },
    });
    const b = variant({
      variantId: 'b',
      economics: { ...control.economics, estimatedNetIncrementalValue: null },
    });
    const result = selectOptimizationObjective({
      control,
      candidates: [a, b],
      ...BASE,
    });
    // Not every significant candidate has economics → must fall back to return rate.
    expect(result.kind).toBe('BEST_RETURN_VARIANT');
  });
});

describe('selectOptimizationObjective — Fase G §36: multiple-comparison correction', () => {
  it('rejects a marginal winner once 3+ candidates are compared (p=0.04 fails Holm)', () => {
    const a = variant({
      variantId: 'a',
      significanceVsControl: { pValue: 0.04, zScore: 2 },
    });
    const b = variant({
      variantId: 'b',
      significanceVsControl: { pValue: 0.3, zScore: 1 },
    });
    const c = variant({
      variantId: 'c',
      significanceVsControl: { pValue: 0.6, zScore: 0.5 },
    });
    const result = selectOptimizationObjective({
      control,
      candidates: [a, b, c],
      ...BASE,
    });
    expect(result.kind).toBe('NO_CONCLUSION');
    expect(result.reasonCode).toBe('OPTIMIZATION_NO_CONCLUSION');
  });

  it('accepts a strong winner even with several comparisons', () => {
    const a = variant({
      variantId: 'a',
      significanceVsControl: { pValue: 0.0001, zScore: 5 },
    });
    const b = variant({
      variantId: 'b',
      significanceVsControl: { pValue: 0.4, zScore: 0.8 },
    });
    const c = variant({
      variantId: 'c',
      significanceVsControl: { pValue: 0.7, zScore: 0.4 },
    });
    const result = selectOptimizationObjective({
      control,
      candidates: [a, b, c],
      ...BASE,
    });
    expect(result.variantId).toBe('a');
    expect(result.kind).not.toBe('NO_CONCLUSION');
  });
});

describe('selectOptimizationObjective — Fase G §23: hysteresis against oscillation', () => {
  it('keeps favoring the previous winner when the new pick only barely beats it', () => {
    const a = variant({
      variantId: 'a',
      stats: { ...control.stats, variantId: 'a', returnRate: 0.22 },
      economics: { ...control.economics, estimatedNetIncrementalValue: 1000 },
    });
    const b = variant({
      variantId: 'b',
      stats: { ...control.stats, variantId: 'b', returnRate: 0.221 },
      economics: { ...control.economics, estimatedNetIncrementalValue: 1010 }, // ~1% more, not meaningful
    });
    const result = selectOptimizationObjective({
      control,
      candidates: [a, b],
      previousWinnerVariantId: 'a',
      minimumMeaningfulUpliftPoints: 5,
    });
    expect(result.variantId).toBe('a');
  });

  it('switches to the new winner when the gap is clearly meaningful', () => {
    const a = variant({
      variantId: 'a',
      economics: { ...control.economics, estimatedNetIncrementalValue: 1000 },
    });
    const b = variant({
      variantId: 'b',
      economics: { ...control.economics, estimatedNetIncrementalValue: 2000 }, // 100% more
    });
    const result = selectOptimizationObjective({
      control,
      candidates: [a, b],
      previousWinnerVariantId: 'a',
      minimumMeaningfulUpliftPoints: 5,
    });
    expect(result.variantId).toBe('b');
  });
});

describe('selectOptimizationObjective — Fase G §12: negative uplift', () => {
  it('tags a picked variant with negative uplift as OPTIMIZATION_NEGATIVE_VARIANT', () => {
    const a = variant({ variantId: 'a', upliftPercentagePoints: -0.05 });
    const result = selectOptimizationObjective({
      control,
      candidates: [a],
      ...BASE,
    });
    expect(result.reasonCode).toBe('OPTIMIZATION_NEGATIVE_VARIANT');
  });
});

describe('selectOptimizationObjective — Fase G §35: PROGRESS_REMINDER competes like any variant', () => {
  it('can win purely on economics, with zero extra promotional cost', () => {
    const progress = variant({
      variantId: 'progress',
      strategyType: RetentionStrategyType.PROGRESS_REMINDER,
      stats: { ...control.stats, variantId: 'progress', returnRate: 0.24 },
      economics: {
        ...control.economics,
        knownPromotionalCost: 0,
        estimatedPromotionalCost: 0,
        estimatedNetIncrementalValue: 3000,
      },
    });
    const discount = variant({
      variantId: 'discount',
      economics: { ...control.economics, estimatedNetIncrementalValue: 1500 },
    });
    const result = selectOptimizationObjective({
      control,
      candidates: [progress, discount],
      ...BASE,
    });
    expect(result.variantId).toBe('progress');
    expect(result.kind).toBe('BEST_ECONOMIC_VARIANT');
  });
});

describe('selectOptimizationObjective — pre-piloto fix (§7/§8): clear-winner gate', () => {
  it('is trivially clear when there is only one significant candidate (nothing to be ambiguous against)', () => {
    const a = variant({ variantId: 'a' });
    const result = selectOptimizationObjective({
      control,
      candidates: [a],
      ...BASE,
    });
    expect(result.clearWinner).toBe(true);
    expect(result.runnerUpVariantId).toBeNull();
  });

  it('near-tie (§10 example): UPGRADE 12.0% vs 10OFF 12.4%, both far ahead of CONTROL 8% — not clearly separated from each other', () => {
    const upgrade = variant({
      variantId: 'upgrade',
      stats: {
        ...control.stats,
        variantId: 'upgrade',
        exposedCount: 1000,
        returnedCount: 120,
        returnRate: 0.12,
      },
      economics: { ...control.economics, estimatedNetIncrementalValue: 1000 },
    });
    const tenOff = variant({
      variantId: '10off',
      stats: {
        ...control.stats,
        variantId: '10off',
        exposedCount: 1000,
        returnedCount: 124,
        returnRate: 0.124,
      },
      economics: { ...control.economics, estimatedNetIncrementalValue: 1050 },
    });
    const result = selectOptimizationObjective({
      control,
      candidates: [upgrade, tenOff],
      ...BASE,
    });
    // Still picks the raw best (10off) — a preview must be able to show it —
    // but flags it as not clearly ahead of upgrade.
    expect(result.variantId).toBe('10off');
    expect(result.runnerUpVariantId).toBe('upgrade');
    expect(result.clearWinner).toBe(false);
  });

  it('strong signal (§11 example): SOFT 19% clearly ahead of REMINDER 10%, both far ahead of CONTROL 8%', () => {
    const reminder = variant({
      variantId: 'reminder',
      strategyType: RetentionStrategyType.REMINDER,
      stats: {
        ...control.stats,
        variantId: 'reminder',
        exposedCount: 1000,
        returnedCount: 100,
        returnRate: 0.1,
      },
    });
    const soft = variant({
      variantId: 'soft',
      stats: {
        ...control.stats,
        variantId: 'soft',
        exposedCount: 1000,
        returnedCount: 190,
        returnRate: 0.19,
      },
    });
    const result = selectOptimizationObjective({
      control,
      candidates: [reminder, soft],
      ...BASE,
    });
    expect(result.variantId).toBe('soft');
    expect(result.runnerUpVariantId).toBe('reminder');
    expect(result.clearWinner).toBe(true);
  });

  it('economic winner but statistically ambiguous (§9): net value differs mainly on a volatile cost estimate, return rates barely differ', () => {
    const a = variant({
      variantId: 'a',
      stats: {
        ...control.stats,
        variantId: 'a',
        exposedCount: 500,
        returnedCount: 110,
        returnRate: 0.22,
      },
      economics: { ...control.economics, estimatedNetIncrementalValue: 900 },
    });
    const b = variant({
      variantId: 'b',
      stats: {
        ...control.stats,
        variantId: 'b',
        exposedCount: 500,
        returnedCount: 112,
        returnRate: 0.224,
      },
      // Wins purely on economics — the return-rate gap versus `a` above is
      // nowhere near enough to explain this economic gap statistically.
      economics: { ...control.economics, estimatedNetIncrementalValue: 4000 },
    });
    const result = selectOptimizationObjective({
      control,
      candidates: [a, b],
      ...BASE,
    });
    expect(result.kind).toBe('BEST_ECONOMIC_VARIANT');
    expect(result.variantId).toBe('b');
    // The economic pick is real, but AUTOMATIC must not act on it — the
    // underlying return rate never clearly separated from its rival.
    expect(result.clearWinner).toBe(false);
  });

  it('strong economic AND statistical winner: AUTOMATIC may act', () => {
    const a = variant({
      variantId: 'a',
      stats: {
        ...control.stats,
        variantId: 'a',
        exposedCount: 500,
        returnedCount: 60,
        returnRate: 0.12,
      },
      economics: { ...control.economics, estimatedNetIncrementalValue: 800 },
    });
    const b = variant({
      variantId: 'b',
      stats: {
        ...control.stats,
        variantId: 'b',
        exposedCount: 500,
        returnedCount: 150,
        returnRate: 0.3,
      },
      economics: { ...control.economics, estimatedNetIncrementalValue: 5000 },
    });
    const result = selectOptimizationObjective({
      control,
      candidates: [a, b],
      ...BASE,
    });
    expect(result.kind).toBe('BEST_ECONOMIC_VARIANT');
    expect(result.variantId).toBe('b');
    expect(result.clearWinner).toBe(true);
  });
});
