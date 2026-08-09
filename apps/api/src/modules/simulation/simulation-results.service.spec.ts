import { SimulationResultsService } from './simulation-results.service';
import { SCENARIO_DEFINITIONS } from './scenarios';
import type { DayResult } from './simulation-engine.service';

function makeDay(overrides: Partial<DayResult> = {}): DayResult {
  return {
    day: 0,
    physicalReturns: 0,
    visibleReturns: 0,
    newChurns: 0,
    assignmentsCreated: 0,
    messagesSent: 0,
    messagesControl: 0,
    messagesSkipped: 0,
    messagesDelivered: 0,
    messagesRead: 0,
    messagesFailed: 0,
    outcomesReturned: 0,
    rewardGoalsCreated: 0,
    rewardGoalsUnlocked: 0,
    rewardGoalsRedeemed: 0,
    optimizationRunsApplied: 0,
    optimizationRunsSkipped: 0,
    reviewPrompts: 0,
    reviewClicks: 0,
    ...overrides,
  };
}

function makeVariant(
  strategyType: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    variantId: `v-${strategyType}`,
    variantName: strategyType,
    strategyType,
    stats: {
      variantId: `v-${strategyType}`,
      assignedCount: 100,
      exposedCount: 100,
      returnedCount: 20,
      confirmedReturnedCount: 0,
      nonReturnedCount: 80,
      returnRate: 0.2,
      confirmedReturnRate: 0,
      averageDaysToReturn: null,
      medianDaysToReturn: null,
      evidenceState: 'ENOUGH_DATA',
    },
    upliftPercentagePoints: 5,
    estimatedIncrementalReturns: 5,
    economics: {
      associatedRevenueEstimate: null,
      incrementalRevenueEstimate: 3000,
      incrementalGrossMarginEstimate: null,
      knownPromotionalCost: 100,
      estimatedPromotionalCost: 0,
      unknownCostRedemptions: 0,
      estimatedNetIncrementalValue: null,
      estimatedROI: null,
    },
    significanceVsControl: null,
    ...overrides,
  };
}

function makeMetrics(experimentResults: unknown) {
  return { forExperiment: jest.fn().mockResolvedValue(experimentResults) };
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    retentionVariant: {
      findMany: jest.fn().mockResolvedValue([
        { strategyType: 'CONTROL', allocationPercent: 15 },
        { strategyType: 'REMINDER', allocationPercent: 30 },
        { strategyType: 'PROGRESS_REMINDER', allocationPercent: 30 },
        { strategyType: 'SOFT_BENEFIT', allocationPercent: 25 },
      ]),
    },
    retentionAssignment: { count: jest.fn().mockResolvedValue(15) },
    aiUsageEvent: { count: jest.fn().mockResolvedValue(0) },
    ...overrides,
  };
}

function makeService(
  prisma: ReturnType<typeof makePrisma>,
  metrics: ReturnType<typeof makeMetrics>,
) {
  return new SimulationResultsService(prisma as never, metrics as never);
}

const BASE_INPUT = {
  businessId: 'biz-1',
  experimentId: 'exp-1',
  scenario: SCENARIO_DEFINITIONS.BASELINE_HEALTHY,
  invariantResults: [],
  durationMs: 1234,
};

describe('SimulationResultsService — §21: aggregates the day history correctly', () => {
  it('sums every counter across the full day history', async () => {
    const days = [
      makeDay({
        physicalReturns: 10,
        visibleReturns: 7,
        reviewPrompts: 7,
        reviewClicks: 2,
      }),
      makeDay({
        physicalReturns: 5,
        visibleReturns: 5,
        reviewPrompts: 5,
        reviewClicks: 1,
      }),
    ];
    const metrics = makeMetrics({
      variants: [
        makeVariant('CONTROL'),
        makeVariant('REMINDER'),
        makeVariant('PROGRESS_REMINDER'),
        makeVariant('SOFT_BENEFIT'),
      ],
      winner: { kind: 'NO_CONCLUSION', reason: 'NO_CONTROL' },
    });
    const service = makeService(makePrisma(), metrics);

    const result = await service.compute({
      ...BASE_INPUT,
      customers: [],
      dayHistory: days,
    });

    expect(result.physicalReturns).toBe(15);
    expect(result.visibleReturns).toBe(12);
    expect(result.reviewPrompts).toBe(12);
    expect(result.reviewClicks).toBe(3);
    expect(result.checkinVisibilityRate).toBeCloseTo(12 / 15, 5);
  });

  it('reports checkinVisibilityRate as 0 when there were no physical returns at all', async () => {
    const metrics = makeMetrics({
      variants: [],
      winner: { kind: 'NO_CONCLUSION', reason: 'NO_CONTROL' },
    });
    const service = makeService(makePrisma(), metrics);
    const result = await service.compute({
      ...BASE_INPUT,
      customers: [],
      dayHistory: [],
    });
    expect(result.checkinVisibilityRate).toBe(0);
  });

  it('reads the current (final) allocation directly from the DB', async () => {
    const metrics = makeMetrics({
      variants: [],
      winner: { kind: 'NO_CONCLUSION', reason: 'NO_CONTROL' },
    });
    const service = makeService(makePrisma(), metrics);
    const result = await service.compute({
      ...BASE_INPUT,
      customers: [],
      dayHistory: [],
    });
    expect(result.finalAllocation).toEqual({
      CONTROL: 15,
      REMINDER: 30,
      PROGRESS_REMINDER: 30,
      SOFT_BENEFIT: 25,
    });
    expect(result.initialAllocation).toEqual(
      SCENARIO_DEFINITIONS.BASELINE_HEALTHY.experimentAllocation,
    );
  });
});

describe('SimulationResultsService — §23: winner accuracy classification', () => {
  it('CORRECT when Flikker detects exactly the ground-truth winner', async () => {
    const metrics = makeMetrics({
      variants: [
        makeVariant('CONTROL'),
        makeVariant('REMINDER'),
        makeVariant('PROGRESS_REMINDER', { variantId: 'v-PROGRESS_REMINDER' }),
        makeVariant('SOFT_BENEFIT'),
      ],
      winner: { kind: 'BEST_RETURN_RATE', variantId: 'v-PROGRESS_REMINDER' },
    });
    const service = makeService(makePrisma(), metrics);
    const customers = Array.from({ length: 20 }, () => ({
      id: 'c',
      persona: 'PROGRESS_SENSITIVE' as const,
    }));

    const result = await service.compute({
      ...BASE_INPUT,
      customers,
      dayHistory: [],
    });

    expect(result.trueWinner).toBe('PROGRESS_REMINDER');
    expect(result.winnerAccuracy).toBe('CORRECT');
  });

  it('INCORRECT when Flikker detects a different variant than the true winner', async () => {
    const metrics = makeMetrics({
      variants: [
        makeVariant('CONTROL'),
        makeVariant('REMINDER', { variantId: 'v-REMINDER' }),
        makeVariant('PROGRESS_REMINDER'),
        makeVariant('SOFT_BENEFIT'),
      ],
      winner: { kind: 'BEST_RETURN_RATE', variantId: 'v-REMINDER' },
    });
    const service = makeService(makePrisma(), metrics);
    const customers = Array.from({ length: 20 }, () => ({
      id: 'c',
      persona: 'PROGRESS_SENSITIVE' as const, // true winner is PROGRESS_REMINDER
    }));

    const result = await service.compute({
      ...BASE_INPUT,
      customers,
      dayHistory: [],
    });

    expect(result.winnerAccuracy).toBe('INCORRECT');
  });

  it('NO_CONCLUSION (never INCORRECT) when Flikker reaches no conclusion — even with a clear true winner', async () => {
    const metrics = makeMetrics({
      variants: [
        makeVariant('CONTROL'),
        makeVariant('REMINDER'),
        makeVariant('PROGRESS_REMINDER'),
        makeVariant('SOFT_BENEFIT'),
      ],
      winner: { kind: 'NO_CONCLUSION', reason: 'CONTROL_INSUFFICIENT_DATA' },
    });
    const service = makeService(makePrisma(), metrics);
    const customers = Array.from({ length: 20 }, () => ({
      id: 'c',
      persona: 'PROGRESS_SENSITIVE' as const,
    }));

    const result = await service.compute({
      ...BASE_INPUT,
      customers,
      dayHistory: [],
    });

    expect(result.trueWinner).toBe('PROGRESS_REMINDER');
    expect(result.winnerAccuracy).toBe('NO_CONCLUSION');
  });

  it('NO_CONCLUSION when there is no ground-truth winner (empty population), regardless of what Flikker detects', async () => {
    const metrics = makeMetrics({
      variants: [
        makeVariant('CONTROL'),
        makeVariant('REMINDER', { variantId: 'v-REMINDER' }),
      ],
      winner: { kind: 'BEST_RETURN_RATE', variantId: 'v-REMINDER' },
    });
    const service = makeService(makePrisma(), metrics);

    const result = await service.compute({
      ...BASE_INPUT,
      customers: [],
      dayHistory: [],
    });

    expect(result.trueWinner).toBeNull();
    expect(result.winnerAccuracy).toBe('NO_CONCLUSION');
  });
});

describe('SimulationResultsService — ajuste pre-piloto §1: the legacy single winnerAccuracy can be misleading once Flikker optimizes on economics', () => {
  it('a case where the OLD winnerAccuracy says INCORRECT, but BOTH the return-only and economic-only reads say CORRECT — Flikker just answered a different, also-correct question', async () => {
    // Ground truth (persona-based, return-rate only): SOFT_BENEFIT's effect
    // (0.052) is barely above REMINDER's (0.0498) — SOFT_BENEFIT is the
    // true RETURN winner. But SOFT_BENEFIT's real 10%-of-ticket cost is a
    // constant ~10% haircut on ITS OWN revenue regardless of effect size —
    // for a gap this narrow, that haircut is enough for REMINDER's
    // zero-cost revenue to win on NET VALUE. Both are real, non-contradictory
    // ground-truth facts about the SAME population.
    const customers = [
      ...Array.from({ length: 99 }, () => ({
        id: 'c',
        persona: 'WEEKLY_REGULAR' as const,
      })),
      { id: 'c-promo', persona: 'PROMOTION_SENSITIVE' as const },
    ];

    const metrics = makeMetrics({
      variants: [
        makeVariant('CONTROL'),
        makeVariant('REMINDER', {
          variantId: 'v-REMINDER',
          stats: {
            variantId: 'v-REMINDER',
            assignedCount: 100,
            exposedCount: 100,
            returnedCount: 13,
            confirmedReturnedCount: 0,
            nonReturnedCount: 87,
            returnRate: 0.13,
            confirmedReturnRate: 0,
            averageDaysToReturn: null,
            medianDaysToReturn: null,
            evidenceState: 'ENOUGH_DATA',
          },
          economics: {
            associatedRevenueEstimate: null,
            incrementalRevenueEstimate: 3000,
            incrementalGrossMarginEstimate: 500,
            knownPromotionalCost: 0,
            estimatedPromotionalCost: 0,
            unknownCostRedemptions: 0,
            estimatedNetIncrementalValue: 500,
            estimatedROI: null,
          },
        }),
        makeVariant('PROGRESS_REMINDER', {
          stats: {
            variantId: 'v-PROGRESS_REMINDER',
            assignedCount: 100,
            exposedCount: 100,
            returnedCount: 5,
            confirmedReturnedCount: 0,
            nonReturnedCount: 95,
            returnRate: 0.05,
            confirmedReturnRate: 0,
            averageDaysToReturn: null,
            medianDaysToReturn: null,
            evidenceState: 'ENOUGH_DATA',
          },
          economics: {
            associatedRevenueEstimate: null,
            incrementalRevenueEstimate: 300,
            incrementalGrossMarginEstimate: 50,
            knownPromotionalCost: 0,
            estimatedPromotionalCost: 0,
            unknownCostRedemptions: 0,
            estimatedNetIncrementalValue: 50,
            estimatedROI: null,
          },
        }),
        makeVariant('SOFT_BENEFIT', {
          stats: {
            variantId: 'v-SOFT_BENEFIT',
            assignedCount: 100,
            exposedCount: 100,
            returnedCount: 14,
            confirmedReturnedCount: 14,
            nonReturnedCount: 86,
            returnRate: 0.135,
            confirmedReturnRate: 0.135,
            averageDaysToReturn: null,
            medianDaysToReturn: null,
            evidenceState: 'ENOUGH_DATA',
          },
          economics: {
            associatedRevenueEstimate: null,
            incrementalRevenueEstimate: 3200,
            incrementalGrossMarginEstimate: 520,
            knownPromotionalCost: 40,
            estimatedPromotionalCost: 0,
            unknownCostRedemptions: 0,
            estimatedNetIncrementalValue: 480,
            estimatedROI: null,
          },
        }),
      ],
      // The real dashboard/optimizer prefers economics once every comparable
      // candidate has one — REMINDER (500) beats SOFT_BENEFIT (480).
      winner: { kind: 'BEST_INCREMENTAL_VALUE', variantId: 'v-REMINDER' },
    });
    const service = makeService(makePrisma(), metrics);

    const result = await service.compute({
      ...BASE_INPUT,
      // PROGRESS_REMINDER excluded from this scenario's allocation on
      // purpose: it is also zero-cost, and WEEKLY_REGULAR/PROMOTION_SENSITIVE
      // both give it a true effect of exactly 0.05 — with it present, IT
      // would edge out REMINDER's (slightly diluted) 0.0498 for the
      // ground-truth economic win, muddying this specific demonstration.
      // Excluding it from `presentCodes` keeps the comparison to exactly the
      // two variants this test is about.
      scenario: {
        ...BASE_INPUT.scenario,
        experimentAllocation: { CONTROL: 15, REMINDER: 30, SOFT_BENEFIT: 25 },
      },
      customers,
      dayHistory: [],
    });

    // The ground truth: SOFT_BENEFIT truly is the better RETURN, REMINDER
    // truly is the better ECONOMIC choice — both real, both computed
    // independently of anything Flikker did.
    expect(result.returnWinner).toBe('SOFT_BENEFIT');
    expect(result.economicWinner).toBe('REMINDER');

    // The legacy single metric flags this as wrong...
    expect(result.trueWinner).toBe('SOFT_BENEFIT');
    expect(result.detectedWinner).toEqual({
      kind: 'BEST_INCREMENTAL_VALUE',
      variantId: 'v-REMINDER',
    });
    expect(result.winnerAccuracy).toBe('INCORRECT');

    // ...but each split, objective-matched read says Flikker got its OWN
    // question right.
    expect(result.detectedReturnWinner).toBe('SOFT_BENEFIT');
    expect(result.returnWinnerAccuracy).toBe('CORRECT');
    expect(result.detectedEconomicWinner).toBe('REMINDER');
    expect(result.economicWinnerAccuracy).toBe('CORRECT');
    expect(result.optimizationObjectiveUsed).toBe('ECONOMIC');
  });
});

describe('SimulationResultsService — §22: estimation error', () => {
  it('is null when the true incremental revenue is exactly 0 (avoids a misleading 0%/Infinity)', async () => {
    const metrics = makeMetrics({
      variants: [
        makeVariant('CONTROL'),
        makeVariant('REMINDER'),
        makeVariant('PROGRESS_REMINDER'),
        makeVariant('SOFT_BENEFIT'),
      ],
      winner: { kind: 'NO_CONCLUSION', reason: 'NO_CONTROL' },
    });
    const service = makeService(makePrisma(), metrics);
    // No customers → every ground-truth effect is 0 → trueIncrementalRevenue is 0.
    const result = await service.compute({
      ...BASE_INPUT,
      customers: [],
      dayHistory: [],
    });
    expect(result.estimationErrorPercent).toBeNull();
  });

  it('computes a real percentage once there is a non-zero true incremental revenue', async () => {
    const metrics = makeMetrics({
      variants: [
        makeVariant('CONTROL'),
        makeVariant('REMINDER'),
        makeVariant('PROGRESS_REMINDER', {
          economics: {
            associatedRevenueEstimate: null,
            incrementalRevenueEstimate: 1000,
            incrementalGrossMarginEstimate: null,
            knownPromotionalCost: 0,
            estimatedPromotionalCost: 0,
            unknownCostRedemptions: 0,
            estimatedNetIncrementalValue: null,
            estimatedROI: null,
          },
        }),
        makeVariant('SOFT_BENEFIT'),
      ],
      winner: { kind: 'NO_CONCLUSION', reason: 'NO_CONTROL' },
    });
    const service = makeService(makePrisma(), metrics);
    const customers = Array.from({ length: 20 }, () => ({
      id: 'c',
      persona: 'PROGRESS_SENSITIVE' as const,
    }));

    const result = await service.compute({
      ...BASE_INPUT,
      customers,
      dayHistory: [],
    });

    expect(result.estimationErrorPercent).not.toBeNull();
    expect(result.estimationErrorPercent).toBeGreaterThanOrEqual(0);
  });
});
