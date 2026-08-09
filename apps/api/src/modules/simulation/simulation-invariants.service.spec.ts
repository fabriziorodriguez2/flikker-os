import { SimulationInvariantService } from './simulation-invariants.service';

const NOW = new Date('2026-09-15T12:00:00.000Z');

function makeInput(
  overrides: Partial<
    Parameters<SimulationInvariantService['checkAll']>[0]
  > = {},
) {
  return {
    businessId: 'biz-1',
    experimentId: 'exp-1',
    now: NOW,
    timezone: 'America/Montevideo',
    expectedSimulationDatabaseName: 'flikker_simulation',
    maxAiCallsDefault: 20,
    ...overrides,
  };
}

/** A healthy default Prisma mock — every check should PASS against this. */
function makePrisma(overrides: Record<string, unknown> = {}) {
  const base = {
    $queryRawUnsafe: jest
      .fn()
      .mockResolvedValue([{ current_database: 'flikker_simulation' }]),
    business: {
      findUnique: jest.fn().mockResolvedValue({
        experienceVersion: 'CHECKIN_V2',
        retentionEngineV2Enabled: true,
      }),
    },
    retentionVariant: {
      findMany: jest.fn().mockResolvedValue([
        { strategyType: 'CONTROL', allocationPercent: 15 },
        { strategyType: 'REMINDER', allocationPercent: 30 },
        { strategyType: 'PROGRESS_REMINDER', allocationPercent: 30 },
        { strategyType: 'SOFT_BENEFIT', allocationPercent: 25 },
      ]),
    },
    retentionSettings: {
      findUnique: jest.fn().mockResolvedValue({
        minimumControlPercent: 10,
        minimumExplorationPercent: 15,
        maxAutomatedIncentivesPerMonth: null,
        maxEstimatedIncentiveCostPerMonth: null,
        averageTicketAmount: 600,
      }),
    },
    benefitParticipation: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    retentionAssignment: {
      groupBy: jest.fn().mockResolvedValue([]),
    },
    customerRewardGoal: {
      groupBy: jest.fn().mockResolvedValue([]),
    },
    aiUsageEvent: {
      count: jest.fn().mockResolvedValue(0),
    },
    ...overrides,
  };
  return base;
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new SimulationInvariantService(prisma as never);
}

describe('SimulationInvariantService — §20: every check, PASS on a healthy run', () => {
  it('reports PASS for every check against a well-formed simulation', async () => {
    const service = makeService(makePrisma());
    const results = await service.checkAll(makeInput());

    for (const result of results) {
      expect(result.status).toBe('PASS');
    }
    expect(results.map((r) => r.code).sort()).toEqual(
      [
        'AI_USAGE_WITHIN_MAX_CALLS',
        'ALLOCATION_SUMS_TO_100',
        'CONTROL_FLOOR_RESPECTED',
        'EXPLORATION_FLOOR_RESPECTED',
        'MAX_ONE_ACTIVE_REWARD_GOAL_PER_CUSTOMER',
        'MONTHLY_INCENTIVE_COST_WITHIN_LIMIT',
        'MONTHLY_INCENTIVE_COUNT_WITHIN_LIMIT',
        'NO_ASSIGNMENT_MULTIPLE_VARIANT',
        'NO_DUPLICATE_BENEFIT_PARTICIPATION',
        'NO_DUPLICATE_MESSAGE_PER_ASSIGNMENT',
        'NO_LEGACY_BUSINESS_PROCESSED_BY_V2',
        'SIMULATION_DATABASE_ISOLATED',
      ].sort(),
    );
  });
});

describe('SIMULATION_DATABASE_ISOLATED — §2: the load-bearing safety check', () => {
  it('FAILs (critical) when connected to any database other than the expected simulation one', async () => {
    const prisma = makePrisma({
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValue([{ current_database: 'flikker_os' }]),
    });
    const service = makeService(prisma);
    const results = await service.checkAll(makeInput());
    const check = results.find(
      (r) => r.code === 'SIMULATION_DATABASE_ISOLATED',
    );
    expect(check?.status).toBe('FAIL');
    expect(check?.critical).toBe(true);
  });
});

describe('NO_LEGACY_BUSINESS_PROCESSED_BY_V2', () => {
  it('FAILs when the business is LEGACY', async () => {
    const prisma = makePrisma({
      business: {
        findUnique: jest.fn().mockResolvedValue({
          experienceVersion: 'LEGACY',
          retentionEngineV2Enabled: false,
        }),
      },
    });
    const service = makeService(prisma);
    const results = await service.checkAll(makeInput());
    const check = results.find(
      (r) => r.code === 'NO_LEGACY_BUSINESS_PROCESSED_BY_V2',
    );
    expect(check?.status).toBe('FAIL');
  });
});

describe('ALLOCATION_SUMS_TO_100', () => {
  it('FAILs when active variants do not sum to 100', async () => {
    const prisma = makePrisma({
      retentionVariant: {
        findMany: jest.fn().mockResolvedValue([
          { strategyType: 'CONTROL', allocationPercent: 15 },
          { strategyType: 'REMINDER', allocationPercent: 30 },
        ]),
      },
    });
    const service = makeService(prisma);
    const results = await service.checkAll(makeInput());
    const check = results.find((r) => r.code === 'ALLOCATION_SUMS_TO_100');
    expect(check?.status).toBe('FAIL');
    expect(check?.message).toContain('45');
  });
});

describe('CONTROL_FLOOR_RESPECTED', () => {
  it('FAILs when CONTROL drops below the configured minimum', async () => {
    const prisma = makePrisma({
      retentionVariant: {
        findMany: jest.fn().mockResolvedValue([
          { strategyType: 'CONTROL', allocationPercent: 5 },
          { strategyType: 'REMINDER', allocationPercent: 95 },
        ]),
      },
    });
    const service = makeService(prisma);
    const results = await service.checkAll(makeInput());
    const check = results.find((r) => r.code === 'CONTROL_FLOOR_RESPECTED');
    expect(check?.status).toBe('FAIL');
  });

  it('PASSes at exactly the floor', async () => {
    const prisma = makePrisma({
      retentionVariant: {
        findMany: jest.fn().mockResolvedValue([
          { strategyType: 'CONTROL', allocationPercent: 10 },
          { strategyType: 'REMINDER', allocationPercent: 90 },
        ]),
      },
    });
    const service = makeService(prisma);
    const results = await service.checkAll(makeInput());
    const check = results.find((r) => r.code === 'CONTROL_FLOOR_RESPECTED');
    expect(check?.status).toBe('PASS');
  });
});

describe('EXPLORATION_FLOOR_RESPECTED', () => {
  it('FAILs when combined non-winning exploration drops below the floor', async () => {
    // CONTROL 15, REMINDER 80 (the "winner"), PROGRESS 5 → exploration = 5, floor 15.
    const prisma = makePrisma({
      retentionVariant: {
        findMany: jest.fn().mockResolvedValue([
          { strategyType: 'CONTROL', allocationPercent: 15 },
          { strategyType: 'REMINDER', allocationPercent: 80 },
          { strategyType: 'PROGRESS_REMINDER', allocationPercent: 5 },
        ]),
      },
    });
    const service = makeService(prisma);
    const results = await service.checkAll(makeInput());
    const check = results.find((r) => r.code === 'EXPLORATION_FLOOR_RESPECTED');
    expect(check?.status).toBe('FAIL');
  });

  it('pre-piloto fix (§13/§14): PASSes vacuously for a genuine two-arm experiment (CONTROL + one challenger) — the formula has no "other" arm to floor', async () => {
    // CONTROL 30, REMINDER 70 — sum(nonControl) - largest = 70 - 70 = 0,
    // which would FAIL against the 15-point floor if treated like a normal
    // 3+ variant experiment. A two-arm design has nothing else to explore.
    const prisma = makePrisma({
      retentionVariant: {
        findMany: jest.fn().mockResolvedValue([
          { strategyType: 'CONTROL', allocationPercent: 30 },
          { strategyType: 'REMINDER', allocationPercent: 70 },
        ]),
      },
    });
    const service = makeService(prisma);
    const results = await service.checkAll(makeInput());
    const check = results.find((r) => r.code === 'EXPLORATION_FLOOR_RESPECTED');
    expect(check?.status).toBe('PASS');
  });
});

describe('MONTHLY_INCENTIVE_COUNT_WITHIN_LIMIT / COST_WITHIN_LIMIT', () => {
  it('PASSes trivially when no cap is configured', async () => {
    const service = makeService(makePrisma());
    const results = await service.checkAll(makeInput());
    expect(
      results.find((r) => r.code === 'MONTHLY_INCENTIVE_COUNT_WITHIN_LIMIT')
        ?.status,
    ).toBe('PASS');
    expect(
      results.find((r) => r.code === 'MONTHLY_INCENTIVE_COST_WITHIN_LIMIT')
        ?.status,
    ).toBe('PASS');
  });

  it('FAILs the count check once this month exceeds the configured cap', async () => {
    const participations = Array.from({ length: 5 }, () => ({
      createdAt: NOW,
      retentionAssignment: {
        variant: {
          incentiveDefinition: {
            estimatedCost: 100,
            percentageValue: null,
            fixedValue: null,
          },
        },
      },
    }));
    const prisma = makePrisma({
      benefitParticipation: {
        findMany: jest.fn().mockResolvedValue(participations),
      },
      retentionSettings: {
        findUnique: jest.fn().mockResolvedValue({
          minimumControlPercent: 10,
          minimumExplorationPercent: 15,
          maxAutomatedIncentivesPerMonth: 3,
          maxEstimatedIncentiveCostPerMonth: null,
          averageTicketAmount: 600,
        }),
      },
    });
    const service = makeService(prisma);
    const results = await service.checkAll(makeInput());
    const check = results.find(
      (r) => r.code === 'MONTHLY_INCENTIVE_COUNT_WITHIN_LIMIT',
    );
    expect(check?.status).toBe('FAIL');
  });

  it('FAILs the cost check once estimated spend exceeds the configured cap', async () => {
    const participations = [
      {
        createdAt: NOW,
        retentionAssignment: {
          variant: {
            incentiveDefinition: {
              estimatedCost: 5000,
              percentageValue: null,
              fixedValue: null,
            },
          },
        },
      },
    ];
    const prisma = makePrisma({
      benefitParticipation: {
        findMany: jest.fn().mockResolvedValue(participations),
      },
      retentionSettings: {
        findUnique: jest.fn().mockResolvedValue({
          minimumControlPercent: 10,
          minimumExplorationPercent: 15,
          maxAutomatedIncentivesPerMonth: null,
          maxEstimatedIncentiveCostPerMonth: 1000,
          averageTicketAmount: 600,
        }),
      },
    });
    const service = makeService(prisma);
    const results = await service.checkAll(makeInput());
    const check = results.find(
      (r) => r.code === 'MONTHLY_INCENTIVE_COST_WITHIN_LIMIT',
    );
    expect(check?.status).toBe('FAIL');
  });
});

describe('duplicate-guard checks (defense-in-depth of real @unique constraints)', () => {
  // `checkAll` runs every check concurrently (Promise.all) and three
  // different checks call `retentionAssignment.groupBy` — so which call
  // happens in which order is never guaranteed. Branch on `by` instead of
  // relying on call sequence.
  it('FAILs NO_DUPLICATE_MESSAGE_PER_ASSIGNMENT if the DB ever reports a duplicate', async () => {
    const prisma = makePrisma({
      retentionAssignment: {
        groupBy: jest.fn().mockImplementation((args: { by: string[] }) => {
          if (args.by[0] === 'messageId') {
            return Promise.resolve([{ messageId: 'm1', _count: { _all: 2 } }]);
          }
          return Promise.resolve([]);
        }),
      },
    });
    const service = makeService(prisma);
    const results = await service.checkAll(makeInput());
    expect(
      results.find((r) => r.code === 'NO_DUPLICATE_MESSAGE_PER_ASSIGNMENT')
        ?.status,
    ).toBe('FAIL');
    // Sibling checks sharing the same mocked method stay unaffected.
    expect(
      results.find((r) => r.code === 'NO_ASSIGNMENT_MULTIPLE_VARIANT')?.status,
    ).toBe('PASS');
  });

  it('FAILs MAX_ONE_ACTIVE_REWARD_GOAL_PER_CUSTOMER when a customer has two ACTIVE goals', async () => {
    const prisma = makePrisma({
      customerRewardGoal: {
        groupBy: jest.fn().mockImplementation((args: { by: string[] }) => {
          if (args.by[0] === 'customerId') {
            return Promise.resolve([{ customerId: 'c1', _count: { _all: 2 } }]);
          }
          return Promise.resolve([]);
        }),
      },
    });
    const service = makeService(prisma);
    const results = await service.checkAll(makeInput());
    expect(
      results.find((r) => r.code === 'MAX_ONE_ACTIVE_REWARD_GOAL_PER_CUSTOMER')
        ?.status,
    ).toBe('FAIL');
  });
});

describe('AI_USAGE_WITHIN_MAX_CALLS — §17/§19', () => {
  it('PASSes at exactly the cap', async () => {
    const prisma = makePrisma({
      aiUsageEvent: { count: jest.fn().mockResolvedValue(20) },
    });
    const service = makeService(prisma);
    const results = await service.checkAll(
      makeInput({ maxAiCallsDefault: 20 }),
    );
    expect(
      results.find((r) => r.code === 'AI_USAGE_WITHIN_MAX_CALLS')?.status,
    ).toBe('PASS');
  });

  it('FAILs once AI usage exceeds the configured cap', async () => {
    const prisma = makePrisma({
      aiUsageEvent: { count: jest.fn().mockResolvedValue(21) },
    });
    const service = makeService(prisma);
    const results = await service.checkAll(
      makeInput({ maxAiCallsDefault: 20 }),
    );
    const check = results.find((r) => r.code === 'AI_USAGE_WITHIN_MAX_CALLS');
    expect(check?.status).toBe('FAIL');
    expect(check?.critical).toBe(true);
  });
});
