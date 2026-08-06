import { RetentionExperimentStatus } from '@prisma/client';
import { RetentionResultsOverviewService } from './retention-results-overview.service';
import type { ExperimentResults } from './retention-experiment-metrics.service';

function results(
  overrides: Partial<ExperimentResults> = {},
): ExperimentResults {
  return {
    experimentId: 'exp-1',
    experimentName: 'At-risk recovery',
    attributionWindowDays: 7,
    controlVariantId: 'var-control',
    variants: [
      {
        variantId: 'var-control',
        variantName: 'Control',
        strategyType: 'CONTROL' as never,
        stats: {
          variantId: 'var-control',
          assignedCount: 10,
          exposedCount: 10,
          returnedCount: 2,
          confirmedReturnedCount: 0,
          nonReturnedCount: 8,
          returnRate: 0.2,
          confirmedReturnRate: 0,
          averageDaysToReturn: 3,
          medianDaysToReturn: 3,
          evidenceState: 'ENOUGH_DATA',
        },
        upliftPercentagePoints: null,
        estimatedIncrementalReturns: null,
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
        significanceVsControl: null,
      },
      {
        variantId: 'var-reminder',
        variantName: 'Reminder',
        strategyType: 'REMINDER' as never,
        stats: {
          variantId: 'var-reminder',
          assignedCount: 10,
          exposedCount: 10,
          returnedCount: 6,
          confirmedReturnedCount: 0,
          nonReturnedCount: 4,
          returnRate: 0.6,
          confirmedReturnRate: 0,
          averageDaysToReturn: 4,
          medianDaysToReturn: 4,
          evidenceState: 'ENOUGH_DATA',
        },
        upliftPercentagePoints: 0.4,
        estimatedIncrementalReturns: 4,
        economics: {
          associatedRevenueEstimate: 3000,
          incrementalRevenueEstimate: 2000,
          incrementalGrossMarginEstimate: null,
          knownPromotionalCost: 0,
          estimatedPromotionalCost: 0,
          unknownCostRedemptions: 0,
          estimatedNetIncrementalValue: null,
          estimatedROI: null,
        },
        significanceVsControl: null,
      },
    ],
    winner: { kind: 'BEST_RETURN_RATE', variantId: 'var-reminder' },
    ...overrides,
  };
}

function makeDeps(experimentResults: ExperimentResults) {
  const prisma = {
    retentionExperiment: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: 'exp-1', status: RetentionExperimentStatus.RUNNING },
        ]),
    },
  };
  const metrics = {
    forExperiment: jest.fn().mockResolvedValue(experimentResults),
  };
  return { prisma, metrics };
}

describe('RetentionResultsOverviewService — Fase D §24 dashboard summary', () => {
  it('sums exposure/returns across variants and surfaces the winner’s figures', async () => {
    const deps = makeDeps(results());
    const service = new RetentionResultsOverviewService(
      deps.prisma as never,
      deps.metrics as never,
    );

    const [overview] = await service.forBusiness('biz-1');

    expect(overview.exposedCount).toBe(20);
    expect(overview.returnedCount).toBe(8);
    expect(overview.controlReturnRate).toBe(0.2);
    expect(overview.bestVariant).toEqual({
      variantId: 'var-reminder',
      variantName: 'Reminder',
    });
    expect(overview.upliftBestVariant).toBe(0.4);
    expect(overview.estimatedIncrementalReturns).toBe(4);
    expect(overview.incrementalRevenueEstimate).toBe(2000);
  });

  it('shows no best variant when the winner is NO_CONCLUSION', async () => {
    const deps = makeDeps(
      results({
        winner: { kind: 'NO_CONCLUSION', reason: 'CONTROL_INSUFFICIENT_DATA' },
      }),
    );
    const service = new RetentionResultsOverviewService(
      deps.prisma as never,
      deps.metrics as never,
    );

    const [overview] = await service.forBusiness('biz-1');

    expect(overview.bestVariant).toBeNull();
    expect(overview.upliftBestVariant).toBeNull();
  });
});
