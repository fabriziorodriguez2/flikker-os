import {
  ExperienceVersion,
  OptimizationMode,
  OptimizationRunStatus,
  RetentionExperimentStatus,
  RetentionStrategyType,
} from '@prisma/client';
import { RetentionOptimizationService } from './retention-optimization.service';

const NOW = new Date('2026-09-15T12:00:00.000Z');

function variantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'control',
    strategyType: RetentionStrategyType.CONTROL,
    allocationPercent: 15,
    active: true,
    incentiveDefinition: null,
    ...overrides,
  };
}

function variantResult(
  overrides: Record<string, unknown> & { variantId: string },
) {
  return {
    variantName: overrides.variantId,
    strategyType: RetentionStrategyType.SOFT_BENEFIT,
    stats: {
      variantId: overrides.variantId,
      assignedCount: 100,
      exposedCount: 100,
      returnedCount: 22,
      confirmedReturnedCount: 22,
      nonReturnedCount: 78,
      returnRate: 0.22,
      confirmedReturnRate: 0.22,
      averageDaysToReturn: 5,
      medianDaysToReturn: 5,
      evidenceState: 'ENOUGH_DATA',
    },
    upliftPercentagePoints: 0.12,
    estimatedIncrementalReturns: 12,
    economics: {
      associatedRevenueEstimate: null,
      incrementalRevenueEstimate: null,
      incrementalGrossMarginEstimate: null,
      knownPromotionalCost: 0,
      estimatedPromotionalCost: 0,
      unknownCostRedemptions: 0,
      estimatedNetIncrementalValue: 2000,
      estimatedROI: null,
    },
    significanceVsControl: { pValue: 0.001, zScore: 4 },
    ...overrides,
  };
}

function experimentResults(variants: unknown[]) {
  return {
    experimentId: 'exp-1',
    experimentName: 'Test experiment',
    attributionWindowDays: 30,
    controlVariantId: 'control',
    variants,
    winner: { kind: 'BEST_ECONOMIC_VARIANT', variantId: 'upgrade' },
  };
}

function makeDeps(
  options: {
    variants?: unknown[];
    business?: Record<string, unknown>;
    settingsOverrides?: Record<string, unknown>;
    metricsResult?: unknown;
    lastRun?: unknown;
    budgetNearLimit?: boolean;
    incentiveActive?: boolean;
  } = {},
) {
  const variants = options.variants ?? [
    variantRow(),
    variantRow({
      id: 'reminder',
      strategyType: RetentionStrategyType.REMINDER,
      allocationPercent: 30,
    }),
    variantRow({
      id: 'upgrade',
      strategyType: RetentionStrategyType.SOFT_BENEFIT,
      allocationPercent: 55,
    }),
  ];

  const tx = {
    retentionVariant: { update: jest.fn().mockResolvedValue({}) },
    retentionOptimizationRun: {
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'run-1', ...args.data }),
      ),
    },
  };

  const prisma = {
    retentionExperiment: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'exp-1',
        businessId: 'biz-1',
        status: RetentionExperimentStatus.RUNNING,
        endAt: null,
        variants,
        business: {
          isActive: true,
          experienceVersion: ExperienceVersion.CHECKIN_V2,
          retentionEngineV2Enabled: true,
          timezone: 'America/Montevideo',
          ...options.business,
        },
      }),
    },
    retentionOptimizationRun: {
      findFirst: jest.fn().mockResolvedValue(options.lastRun ?? null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'run-1', ...args.data }),
      ),
    },
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
    tx,
  };

  const settings = {
    getOrCreate: jest.fn().mockResolvedValue({
      automaticCampaignsEnabled: true,
      optimizationMode: OptimizationMode.AUTOMATIC,
      optimizationCooldownHours: 72,
      dryRunEnabled: false,
      minimumControlPercent: 10,
      minimumExplorationPercent: 15,
      maxAllocationChangePerOptimization: 15,
      minimumMeaningfulUpliftPoints: 5,
      maxAutomatedIncentivesPerMonth: null,
      maxEstimatedIncentiveCostPerMonth: null,
      averageTicketAmount: null,
      minimumSampleSizeForRecommendations: 10,
      minimumExposedPerVariantForOptimization: null,
      ...options.settingsOverrides,
    }),
  };

  const metrics = {
    forExperiment: jest.fn().mockResolvedValue(
      options.metricsResult ??
        experimentResults([
          variantResult({
            variantId: 'control',
            strategyType: RetentionStrategyType.CONTROL,
            upliftPercentagePoints: null,
            significanceVsControl: null,
          }),
          variantResult({ variantId: 'upgrade' }),
        ]),
    ),
  };

  const budget = {
    headroom: jest.fn().mockResolvedValue({
      nearLimit: options.budgetNearLimit ?? false,
      reasonCode: options.budgetNearLimit ? 'NEAR_COST_LIMIT' : null,
    }),
  };

  const decisions = { record: jest.fn().mockResolvedValue(undefined) };

  return { prisma, settings, metrics, budget, decisions };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new RetentionOptimizationService(
    deps.prisma as never,
    deps.settings as never,
    deps.metrics as never,
    deps.budget as never,
    deps.decisions as never,
  );
}

describe('RetentionOptimizationService — Fase G §41: safety gates never write', () => {
  it('engine disabled → SKIPPED, never touches allocationPercent', async () => {
    const deps = makeDeps({ business: { retentionEngineV2Enabled: false } });
    const service = makeService(deps);

    const result = await service.runAutomatic('biz-1', 'exp-1', NOW);

    expect(result.status).toBe(OptimizationRunStatus.SKIPPED);
    expect(deps.prisma.tx.retentionVariant.update).not.toHaveBeenCalled();
  });

  it('LEGACY business → SKIPPED', async () => {
    const deps = makeDeps({
      business: { experienceVersion: ExperienceVersion.LEGACY },
    });
    const service = makeService(deps);
    const result = await service.runAutomatic('biz-1', 'exp-1', NOW);
    expect(result.status).toBe(OptimizationRunStatus.SKIPPED);
  });

  it('dry-run → PREVIEWED (not APPLIED), never writes allocation, logs DRY_RUN_OPTIMIZATION_PROPOSED', async () => {
    const deps = makeDeps({ settingsOverrides: { dryRunEnabled: true } });
    const service = makeService(deps);

    const result = await service.runAutomatic('biz-1', 'exp-1', NOW);

    expect(result.status).toBe(OptimizationRunStatus.PREVIEWED);
    expect(result.dryRun).toBe(true);
    expect(deps.prisma.tx.retentionVariant.update).not.toHaveBeenCalled();
    expect(deps.decisions.record).toHaveBeenCalledWith(
      expect.objectContaining({
        decisionCode: 'DRY_RUN_OPTIMIZATION_PROPOSED',
      }),
    );
  });

  it('insufficient data (PRELIMINARY) → SKIPPED, OPTIMIZATION_INSUFFICIENT_DATA', async () => {
    const deps = makeDeps({
      metricsResult: experimentResults([
        variantResult({
          variantId: 'control',
          strategyType: RetentionStrategyType.CONTROL,
          upliftPercentagePoints: null,
          significanceVsControl: null,
          stats: {
            ...variantResult({ variantId: 'control' }).stats,
            evidenceState: 'PRELIMINARY',
          },
        }),
        variantResult({ variantId: 'upgrade' }),
      ]),
    });
    const service = makeService(deps);
    const result = await service.runAutomatic('biz-1', 'exp-1', NOW);
    expect(result.status).toBe(OptimizationRunStatus.SKIPPED);
    expect(result.reasonCode).toBe('OPTIMIZATION_INSUFFICIENT_DATA');
  });

  it('PAUSED experiment → SKIPPED, never writes', async () => {
    const deps = makeDeps();
    deps.prisma.retentionExperiment.findFirst.mockResolvedValueOnce({
      id: 'exp-1',
      businessId: 'biz-1',
      status: RetentionExperimentStatus.PAUSED,
      endAt: null,
      variants: [
        variantRow(),
        variantRow({
          id: 'upgrade',
          allocationPercent: 85,
          strategyType: RetentionStrategyType.SOFT_BENEFIT,
        }),
      ],
      business: {
        isActive: true,
        experienceVersion: ExperienceVersion.CHECKIN_V2,
        retentionEngineV2Enabled: true,
        timezone: 'America/Montevideo',
      },
    });
    const service = makeService(deps);
    const result = await service.runAutomatic('biz-1', 'exp-1', NOW);
    expect(result.status).toBe(OptimizationRunStatus.SKIPPED);
    expect(deps.prisma.tx.retentionVariant.update).not.toHaveBeenCalled();
  });

  it('cooldown active → SKIPPED, OPTIMIZATION_COOLDOWN', async () => {
    const deps = makeDeps({
      lastRun: {
        winnerVariantId: 'upgrade',
        appliedAt: new Date(NOW.getTime() - 10 * 3_600_000),
      },
    });
    const service = makeService(deps);
    const result = await service.runAutomatic('biz-1', 'exp-1', NOW);
    expect(result.status).toBe(OptimizationRunStatus.SKIPPED);
    expect(result.reasonCode).toBe('OPTIMIZATION_COOLDOWN');
  });

  it('no winner (NO_CONCLUSION) → SKIPPED, never writes', async () => {
    const deps = makeDeps({
      metricsResult: experimentResults([
        variantResult({
          variantId: 'control',
          strategyType: RetentionStrategyType.CONTROL,
          upliftPercentagePoints: null,
          significanceVsControl: null,
        }),
        variantResult({
          variantId: 'upgrade',
          significanceVsControl: { pValue: 0.9, zScore: 0.1 },
        }),
      ]),
    });
    const service = makeService(deps);
    const result = await service.runAutomatic('biz-1', 'exp-1', NOW);
    expect(result.status).toBe(OptimizationRunStatus.SKIPPED);
    expect(deps.prisma.tx.retentionVariant.update).not.toHaveBeenCalled();
  });

  it('budget exhausted → never grows the incentive-bearing winner, flags OPTIMIZATION_BUDGET_CONSTRAINED', async () => {
    const deps = makeDeps({
      variants: [
        variantRow(),
        variantRow({
          id: 'upgrade',
          strategyType: RetentionStrategyType.SOFT_BENEFIT,
          allocationPercent: 85,
          incentiveDefinition: {
            active: true,
            estimatedCost: 80,
            percentageValue: null,
            fixedValue: null,
          },
        }),
      ],
      budgetNearLimit: true,
    });
    const service = makeService(deps);
    const result = await service.runAutomatic('biz-1', 'exp-1', NOW);
    expect(result.reasonCode).toBe('OPTIMIZATION_BUDGET_CONSTRAINED');
    expect(deps.prisma.tx.retentionVariant.update).not.toHaveBeenCalled();
  });

  it('Fase G §37: the automatic worker never writes below the configured minimumExposedPerVariantForOptimization, even with ENOUGH_DATA', async () => {
    const deps = makeDeps({
      // Stricter than minimumSampleSizeForRecommendations(10) — the exposure
      // floor this business configured for AUTOMATIC specifically.
      settingsOverrides: { minimumExposedPerVariantForOptimization: 200 },
    });
    const service = makeService(deps);

    const result = await service.runAutomatic('biz-1', 'exp-1', NOW);

    // The default fixture's variants are exposed=100 each — ENOUGH_DATA
    // (2x the 10-sample minimum) but still under this business's own
    // stricter 200 floor for AUTOMATIC.
    expect(result.status).toBe(OptimizationRunStatus.SKIPPED);
    expect(result.reasonCode).toBe('OPTIMIZATION_INSUFFICIENT_DATA');
    expect(deps.prisma.tx.retentionVariant.update).not.toHaveBeenCalled();
  });

  it('Fase G §37: a manual apply is NOT held to the stricter AUTOMATIC exposure floor', async () => {
    const deps = makeDeps({
      settingsOverrides: { minimumExposedPerVariantForOptimization: 200 },
    });
    const service = makeService(deps);

    const result = await service.apply('biz-1', 'exp-1', NOW);

    expect(result.status).toBe(OptimizationRunStatus.APPLIED);
    expect(deps.prisma.tx.retentionVariant.update).toHaveBeenCalled();
  });
});

describe('RetentionOptimizationService — Fase G §29/§45: modes', () => {
  it('OFF: preview is rejected, nothing computed to apply', async () => {
    const deps = makeDeps({
      settingsOverrides: { optimizationMode: OptimizationMode.OFF },
    });
    const service = makeService(deps);
    const result = await service.preview('biz-1', 'exp-1', NOW);
    expect(result.status).toBe(OptimizationRunStatus.SKIPPED);
    expect(result.reasonCode).toBe('OPTIMIZATION_NOT_ELIGIBLE');
  });

  it('OFF: manual apply is also rejected', async () => {
    const deps = makeDeps({
      settingsOverrides: { optimizationMode: OptimizationMode.OFF },
    });
    const service = makeService(deps);
    const result = await service.apply('biz-1', 'exp-1', NOW);
    expect(result.status).toBe(OptimizationRunStatus.SKIPPED);
    expect(deps.prisma.tx.retentionVariant.update).not.toHaveBeenCalled();
  });

  it('ASSISTED: preview is generated', async () => {
    const deps = makeDeps({
      settingsOverrides: { optimizationMode: OptimizationMode.ASSISTED },
    });
    const service = makeService(deps);
    const result = await service.preview('biz-1', 'exp-1', NOW);
    expect(result.status).toBe(OptimizationRunStatus.PREVIEWED);
  });

  it('ASSISTED: the automatic worker never applies on its own', async () => {
    const deps = makeDeps({
      settingsOverrides: { optimizationMode: OptimizationMode.ASSISTED },
    });
    const service = makeService(deps);
    const result = await service.runAutomatic('biz-1', 'exp-1', NOW);
    expect(result.status).toBe(OptimizationRunStatus.SKIPPED);
    expect(result.reasonCode).toBe('OPTIMIZATION_NOT_ELIGIBLE');
    expect(deps.prisma.tx.retentionVariant.update).not.toHaveBeenCalled();
  });

  it('ASSISTED: a manual apply (owner confirms) DOES apply', async () => {
    const deps = makeDeps({
      settingsOverrides: { optimizationMode: OptimizationMode.ASSISTED },
    });
    const service = makeService(deps);
    const result = await service.apply('biz-1', 'exp-1', NOW);
    expect(result.status).toBe(OptimizationRunStatus.APPLIED);
    expect(deps.prisma.tx.retentionVariant.update).toHaveBeenCalled();
  });

  it('AUTOMATIC: the worker applies safely on its own', async () => {
    const deps = makeDeps({
      settingsOverrides: { optimizationMode: OptimizationMode.AUTOMATIC },
    });
    const service = makeService(deps);
    const result = await service.runAutomatic('biz-1', 'exp-1', NOW);
    expect(result.status).toBe(OptimizationRunStatus.APPLIED);
    expect(deps.prisma.tx.retentionVariant.update).toHaveBeenCalled();
  });
});

describe('RetentionOptimizationService — pre-piloto fix (§7/§12): AUTOMATIC never applies an ambiguous winner, ASSISTED still can', () => {
  // Two significant candidates, both far ahead of CONTROL, near-tied against
  // each other on return rate — 'b' only edges 'a' out on economics.
  const nearTieResults = () =>
    experimentResults([
      variantResult({
        variantId: 'control',
        strategyType: RetentionStrategyType.CONTROL,
        upliftPercentagePoints: null,
        significanceVsControl: null,
        stats: {
          variantId: 'control',
          assignedCount: 500,
          exposedCount: 500,
          returnedCount: 40,
          confirmedReturnedCount: 40,
          nonReturnedCount: 460,
          returnRate: 0.08,
          confirmedReturnRate: 0.08,
          averageDaysToReturn: 6,
          medianDaysToReturn: 6,
          evidenceState: 'ENOUGH_DATA',
        },
      }),
      variantResult({
        variantId: 'a',
        stats: {
          variantId: 'a',
          assignedCount: 500,
          exposedCount: 500,
          returnedCount: 110,
          confirmedReturnedCount: 110,
          nonReturnedCount: 390,
          returnRate: 0.22,
          confirmedReturnRate: 0.22,
          averageDaysToReturn: 5,
          medianDaysToReturn: 5,
          evidenceState: 'ENOUGH_DATA',
        },
        economics: {
          associatedRevenueEstimate: null,
          incrementalRevenueEstimate: null,
          incrementalGrossMarginEstimate: null,
          knownPromotionalCost: 0,
          estimatedPromotionalCost: 0,
          unknownCostRedemptions: 0,
          estimatedNetIncrementalValue: 900,
          estimatedROI: null,
        },
      }),
      variantResult({
        variantId: 'b',
        stats: {
          variantId: 'b',
          assignedCount: 500,
          exposedCount: 500,
          returnedCount: 112,
          confirmedReturnedCount: 112,
          nonReturnedCount: 388,
          returnRate: 0.224,
          confirmedReturnRate: 0.224,
          averageDaysToReturn: 5,
          medianDaysToReturn: 5,
          evidenceState: 'ENOUGH_DATA',
        },
        economics: {
          associatedRevenueEstimate: null,
          incrementalRevenueEstimate: null,
          incrementalGrossMarginEstimate: null,
          knownPromotionalCost: 0,
          estimatedPromotionalCost: 0,
          unknownCostRedemptions: 0,
          estimatedNetIncrementalValue: 4000,
          estimatedROI: null,
        },
      }),
    ]);

  it('AUTOMATIC worker: SKIPPED with OPTIMIZATION_AMBIGUOUS_WINNER, never writes an allocation', async () => {
    const deps = makeDeps({
      settingsOverrides: { optimizationMode: OptimizationMode.AUTOMATIC },
      metricsResult: nearTieResults(),
    });
    const service = makeService(deps);

    const result = await service.runAutomatic('biz-1', 'exp-1', NOW);

    expect(result.status).toBe(OptimizationRunStatus.SKIPPED);
    expect(result.reasonCode).toBe('OPTIMIZATION_AMBIGUOUS_WINNER');
    expect(deps.prisma.tx.retentionVariant.update).not.toHaveBeenCalled();
  });

  it('ASSISTED preview: still shows the tentative economic pick, not blocked by ambiguity', async () => {
    const deps = makeDeps({
      settingsOverrides: { optimizationMode: OptimizationMode.ASSISTED },
      metricsResult: nearTieResults(),
    });
    const service = makeService(deps);

    const result = await service.preview('biz-1', 'exp-1', NOW);

    expect(result.status).toBe(OptimizationRunStatus.PREVIEWED);
    expect(result.winnerVariantId).toBe('b');
    expect(
      (result.evidenceSnapshot as { clearWinner: boolean }).clearWinner,
    ).toBe(false);
  });

  it('ASSISTED: a manual apply (owner confirms) may still apply an ambiguous pick — the click is its own safety valve', async () => {
    const deps = makeDeps({
      settingsOverrides: { optimizationMode: OptimizationMode.ASSISTED },
      metricsResult: nearTieResults(),
    });
    const service = makeService(deps);

    const result = await service.apply('biz-1', 'exp-1', NOW);

    expect(result.status).toBe(OptimizationRunStatus.APPLIED);
    expect(deps.prisma.tx.retentionVariant.update).toHaveBeenCalled();
  });
});

describe('RetentionOptimizationService — Fase G §16/§40: audit trail', () => {
  it('applying persists previous/proposed/applied allocations and a metrics snapshot, never chain-of-thought text', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const result = (await service.runAutomatic(
      'biz-1',
      'exp-1',
      NOW,
    )) as unknown as {
      previousAllocations: Record<string, number>;
      proposedAllocations: Record<string, number>;
      appliedAllocations: Record<string, number>;
      metricsSnapshot: unknown;
    };

    expect(result.previousAllocations).toEqual({
      control: 15,
      reminder: 30,
      upgrade: 55,
    });
    expect(result.appliedAllocations).toEqual(result.proposedAllocations);
    expect(JSON.stringify(result.metricsSnapshot)).not.toMatch(
      /prompt|chain.?of.?thought/i,
    );
  });

  it('logs a decision-log entry for every run, applied or not', async () => {
    const deps = makeDeps({ business: { retentionEngineV2Enabled: false } });
    const service = makeService(deps);
    await service.runAutomatic('biz-1', 'exp-1', NOW);
    expect(deps.decisions.record).toHaveBeenCalledTimes(1);
  });
});

describe('RetentionOptimizationService — Fase G §38: rollback', () => {
  it('throws when there is nothing applied to roll back', async () => {
    const deps = makeDeps({ lastRun: null });
    const service = makeService(deps);
    await expect(service.rollback('biz-1', 'exp-1', NOW)).rejects.toThrow();
  });

  it('restores the previous allocation and creates a NEW run rather than deleting history', async () => {
    const deps = makeDeps({
      lastRun: {
        winnerVariantId: 'upgrade',
        appliedAt: new Date(NOW.getTime() - 100 * 3_600_000),
        previousAllocations: { control: 15, upgrade: 85 },
      },
    });
    const service = makeService(deps);

    const result = await service.rollback('biz-1', 'exp-1', NOW);

    expect(result.status).toBe(OptimizationRunStatus.ROLLED_BACK);
    expect(deps.prisma.tx.retentionVariant.update).toHaveBeenCalled();
    // A rollback is a new row, never a delete/update of the old one.
    expect(
      deps.prisma.tx.retentionOptimizationRun.create,
    ).toHaveBeenCalledTimes(1);
  });
});
