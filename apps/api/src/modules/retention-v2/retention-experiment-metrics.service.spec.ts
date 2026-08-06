import { RetentionStrategyType } from '@prisma/client';
import { RetentionExperimentMetricsService } from './retention-experiment-metrics.service';

function variant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'var-1',
    name: 'Variant',
    strategyType: RetentionStrategyType.REMINDER,
    incentiveDefinition: null,
    ...overrides,
  };
}

function experiment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exp-1',
    name: 'At-risk recovery',
    attributionWindowDays: 7,
    variants: [
      variant({
        id: 'var-control',
        strategyType: RetentionStrategyType.CONTROL,
      }),
      variant({ id: 'var-reminder' }),
    ],
    ...overrides,
  };
}

/**
 * `assignmentCounts`/`outcomeRows` are keyed by variantId so the mock can
 * return different numbers per variant, matching what the real aggregate
 * queries would return.
 */
function makePrisma(
  options: {
    experiment?: unknown;
    settings?: unknown;
    assignedByVariant?: Record<string, number>;
    exposedByVariant?: Record<string, number>;
    outcomesByVariant?: Record<
      string,
      {
        returned: boolean;
        confirmedByRedemption: boolean;
        daysToReturn: number | null;
      }[]
    >;
  } = {},
) {
  const assignedByVariant = options.assignedByVariant ?? {};
  const exposedByVariant = options.exposedByVariant ?? {};
  const outcomesByVariant = options.outcomesByVariant ?? {};

  return {
    retentionExperiment: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.experiment === undefined ? experiment() : options.experiment,
        ),
    },
    retentionSettings: {
      findUnique: jest.fn().mockResolvedValue(
        options.settings === undefined
          ? {
              minimumSampleSizeForRecommendations: 5,
              averageTicketAmount: null,
              estimatedMarginPercent: null,
            }
          : options.settings,
      ),
    },
    retentionAssignment: {
      count: jest
        .fn()
        .mockImplementation(
          (args: { where: { variantId: string; status?: unknown } }) => {
            const variantId = args.where.variantId;
            if (args.where.status)
              return Promise.resolve(exposedByVariant[variantId] ?? 0);
            return Promise.resolve(assignedByVariant[variantId] ?? 0);
          },
        ),
    },
    retentionOutcome: {
      findMany: jest
        .fn()
        .mockImplementation((args: { where: { variantId: string } }) =>
          Promise.resolve(outcomesByVariant[args.where.variantId] ?? []),
        ),
    },
  };
}

describe('RetentionExperimentMetricsService — tenant scoping', () => {
  it('404s instead of leaking another tenant’s experiment', async () => {
    const prisma = makePrisma({ experiment: null });
    const service = new RetentionExperimentMetricsService(prisma as never);

    await expect(
      service.forExperiment('biz-1', 'exp-other-tenant'),
    ).rejects.toThrow('Experiment not found');
  });
});

describe('RetentionExperimentMetricsService — the E2E-style scenario (Fase D §42)', () => {
  it('matches the worked example exactly: 20%/60% return, +40pp uplift, 4 incremental returns', async () => {
    const prisma = makePrisma({
      settings: {
        minimumSampleSizeForRecommendations: 5,
        averageTicketAmount: 500,
        estimatedMarginPercent: null,
      },
      assignedByVariant: { 'var-control': 10, 'var-reminder': 10 },
      exposedByVariant: { 'var-control': 10, 'var-reminder': 10 },
      outcomesByVariant: {
        'var-control': [
          { returned: true, confirmedByRedemption: false, daysToReturn: 3 },
          { returned: true, confirmedByRedemption: false, daysToReturn: 5 },
        ],
        'var-reminder': Array.from({ length: 6 }, () => ({
          returned: true,
          confirmedByRedemption: false,
          daysToReturn: 4,
        })),
      },
    });
    const service = new RetentionExperimentMetricsService(prisma as never);

    const result = await service.forExperiment('biz-1', 'exp-1');

    const control = result.variants.find((v) => v.variantId === 'var-control')!;
    const reminder = result.variants.find(
      (v) => v.variantId === 'var-reminder',
    )!;

    expect(control.stats.returnRate).toBeCloseTo(0.2);
    expect(reminder.stats.returnRate).toBeCloseTo(0.6);
    expect(reminder.upliftPercentagePoints).toBeCloseTo(0.4);
    expect(reminder.estimatedIncrementalReturns).toBeCloseTo(4);
    expect(reminder.economics.incrementalRevenueEstimate).toBeCloseTo(2000); // 4 * 500
  });
});

describe('RetentionExperimentMetricsService — insufficient data', () => {
  it('reports INSUFFICIENT_DATA and withholds uplift below the minimum sample size', async () => {
    const prisma = makePrisma({
      settings: {
        minimumSampleSizeForRecommendations: 30,
        averageTicketAmount: null,
        estimatedMarginPercent: null,
      },
      assignedByVariant: { 'var-control': 5, 'var-reminder': 5 },
      exposedByVariant: { 'var-control': 5, 'var-reminder': 5 },
      outcomesByVariant: {
        'var-control': [
          { returned: true, confirmedByRedemption: false, daysToReturn: 3 },
        ],
        'var-reminder': [
          { returned: true, confirmedByRedemption: false, daysToReturn: 3 },
        ],
      },
    });
    const service = new RetentionExperimentMetricsService(prisma as never);

    const result = await service.forExperiment('biz-1', 'exp-1');

    const reminder = result.variants.find(
      (v) => v.variantId === 'var-reminder',
    )!;
    expect(reminder.stats.evidenceState).toBe('INSUFFICIENT_DATA');
    expect(reminder.upliftPercentagePoints).toBeNull();
    expect(result.winner.kind).toBe('NO_CONCLUSION');
  });
});

describe('RetentionExperimentMetricsService — a variant with zero exposure', () => {
  it('reports a 0% rate rather than crashing on a division by zero', async () => {
    const prisma = makePrisma({
      assignedByVariant: { 'var-control': 10, 'var-reminder': 0 },
      exposedByVariant: { 'var-control': 10, 'var-reminder': 0 },
      outcomesByVariant: {
        'var-control': [
          { returned: true, confirmedByRedemption: false, daysToReturn: 3 },
        ],
      },
    });
    const service = new RetentionExperimentMetricsService(prisma as never);

    const result = await service.forExperiment('biz-1', 'exp-1');

    const reminder = result.variants.find(
      (v) => v.variantId === 'var-reminder',
    )!;
    expect(reminder.stats.returnRate).toBe(0);
    expect(reminder.stats.evidenceState).toBe('INSUFFICIENT_DATA');
  });
});

describe('RetentionExperimentMetricsService — an experiment with no CONTROL', () => {
  it('is not reportable as a winner, even with clean variant data', async () => {
    const prisma = makePrisma({
      experiment: experiment({
        variants: [
          variant({
            id: 'var-only',
            strategyType: RetentionStrategyType.REMINDER,
          }),
        ],
      }),
      assignedByVariant: { 'var-only': 20 },
      exposedByVariant: { 'var-only': 20 },
      outcomesByVariant: {
        'var-only': Array.from({ length: 5 }, () => ({
          returned: true,
          confirmedByRedemption: false,
          daysToReturn: 3,
        })),
      },
    });
    const service = new RetentionExperimentMetricsService(prisma as never);

    const result = await service.forExperiment('biz-1', 'exp-1');

    expect(result.controlVariantId).toBeNull();
    expect(result.winner).toEqual({
      kind: 'NO_CONCLUSION',
      reason: 'NO_CONTROL',
    });
  });
});

describe('RetentionExperimentMetricsService — PROGRESS_REMINDER (Fase E §26)', () => {
  it('is measured exactly like any other variant — no parallel metrics path', async () => {
    const prisma = makePrisma({
      experiment: experiment({
        variants: [
          variant({
            id: 'var-control',
            strategyType: RetentionStrategyType.CONTROL,
          }),
          variant({
            id: 'var-progress',
            strategyType: RetentionStrategyType.PROGRESS_REMINDER,
          }),
        ],
      }),
      assignedByVariant: { 'var-control': 10, 'var-progress': 10 },
      exposedByVariant: { 'var-control': 10, 'var-progress': 10 },
      outcomesByVariant: {
        'var-control': [
          { returned: true, confirmedByRedemption: false, daysToReturn: 3 },
        ],
        'var-progress': Array.from({ length: 4 }, () => ({
          returned: true,
          confirmedByRedemption: false,
          daysToReturn: 3,
        })),
      },
      settings: {
        minimumSampleSizeForRecommendations: 5,
        averageTicketAmount: null,
        estimatedMarginPercent: null,
      },
    });
    const service = new RetentionExperimentMetricsService(prisma as never);

    const result = await service.forExperiment('biz-1', 'exp-1');
    const progress = result.variants.find(
      (v) => v.variantId === 'var-progress',
    )!;

    // 4/10 vs control's 1/10 — a real, comparable uplift, computed by the
    // exact same code path as REMINDER or SOFT_BENEFIT.
    expect(progress.stats.returnRate).toBeCloseTo(0.4);
    expect(progress.upliftPercentagePoints).toBeCloseTo(0.3);
    // No incentive is attached, so there is nothing to cost.
    expect(progress.economics.knownPromotionalCost).toBe(0);
    expect(progress.economics.estimatedPromotionalCost).toBe(0);
  });
});
