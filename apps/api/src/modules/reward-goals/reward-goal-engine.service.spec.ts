import { CustomerSegment, RewardGoalStatus } from '@prisma/client';
import { RewardGoalEngineService } from './reward-goal-engine.service';

const NOW = new Date('2026-09-01T12:00:00.000Z'); // Tuesday, Montevideo local

function makePrisma(
  options: {
    settings?: unknown;
    activeGoal?: unknown;
    lastClosedGoal?: unknown;
    incentives?: unknown[];
    promisedCount?: number;
    redeemedCount?: number;
    createResult?: unknown;
  } = {},
) {
  return {
    retentionSettings: {
      findUnique: jest.fn().mockResolvedValue(
        options.settings === undefined
          ? {
              rewardGoalsEnabled: true,
              rewardGoalCooldownDays: 3,
              rewardGoalMinVisits: null,
              rewardGoalMaxVisits: null,
              maxPromisedRewardGoalsPerIncentive: null,
            }
          : options.settings,
      ),
    },
    customerRewardGoal: {
      findFirst: jest
        .fn()
        .mockImplementation((args: { where: { status?: unknown } }) => {
          if (args.where.status === RewardGoalStatus.ACTIVE) {
            return Promise.resolve(options.activeGoal ?? null);
          }
          return Promise.resolve(options.lastClosedGoal ?? null);
        }),
      count: jest
        .fn()
        .mockImplementation((args: { where: { status: unknown } }) => {
          const status = args.where.status as
            | { in?: unknown[] }
            | string
            | undefined;
          if (status === RewardGoalStatus.REDEEMED) {
            return Promise.resolve(options.redeemedCount ?? 0);
          }
          return Promise.resolve(options.promisedCount ?? 0);
        }),
      create: jest
        .fn()
        .mockResolvedValue(
          options.createResult ?? { id: 'goal-1', status: 'ACTIVE' },
        ),
    },
    retentionIncentiveDefinition: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          options.incentives ?? [
            { id: 'inc-1', validDays: [], maxTotalRedemptions: null },
          ],
        ),
    },
  };
}

function makeDecisions() {
  return { record: jest.fn().mockResolvedValue(undefined) };
}

// Default "puede sumar" para que cada test de este archivo (sobre las reglas
// puras de reward goals, no sobre el tope de clientes) siga pasando sin
// cambios — el tope self-service tiene su propio describe block más abajo.
function makePlans() {
  return { canAddParticipant: jest.fn().mockResolvedValue(true) };
}

function context(overrides: Record<string, unknown> = {}) {
  return {
    businessId: 'biz-1',
    customerId: 'cust-1',
    segment: CustomerSegment.NEW,
    visitCount: 1,
    timezone: 'America/Montevideo',
    now: NOW,
    ...overrides,
  };
}

describe('RewardGoalEngineService — the owner kill switch', () => {
  it('never evaluates anything while reward goals are disabled', async () => {
    const prisma = makePrisma({ settings: { rewardGoalsEnabled: false } });
    const decisions = makeDecisions();
    const service = new RewardGoalEngineService(
      prisma as never,
      decisions as never,
      makePlans() as never,
    );

    const result = await service.evaluate(context());

    expect(result).toEqual({
      action: 'NO_GOAL',
      reasonCode: 'REWARD_GOALS_DISABLED',
    });
    expect(prisma.customerRewardGoal.create).not.toHaveBeenCalled();
  });
});

describe('RewardGoalEngineService — creating a goal', () => {
  it('creates a goal for a NEW customer with an eligible incentive', async () => {
    const prisma = makePrisma();
    const decisions = makeDecisions();
    const service = new RewardGoalEngineService(
      prisma as never,
      decisions as never,
      makePlans() as never,
    );

    const result = await service.evaluate(context({ visitCount: 1 }));

    expect(result).toMatchObject({
      action: 'CREATE_GOAL',
      targetAdditionalVisits: 1,
    });
    expect(prisma.customerRewardGoal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId: 'biz-1',
        customerId: 'cust-1',
        incentiveDefinitionId: 'inc-1',
        startingVisitCount: 1,
        targetAdditionalVisits: 1,
      }),
    });
  });

  it('logs REWARD_GOAL_CREATED with the segment and reason', async () => {
    const prisma = makePrisma();
    const decisions = makeDecisions();
    const service = new RewardGoalEngineService(
      prisma as never,
      decisions as never,
      makePlans() as never,
    );

    await service.evaluate(context());

    expect(decisions.record).toHaveBeenCalledWith(
      expect.objectContaining({
        decisionCode: 'REWARD_GOAL_CREATED',
        metadata: expect.objectContaining({ reasonCode: 'NEW_SECOND_VISIT' }),
      }),
    );
  });
});

describe('RewardGoalEngineService — gating', () => {
  it('does not create a second goal, and does not log the steady state', async () => {
    const prisma = makePrisma({ activeGoal: { id: 'existing-goal' } });
    const decisions = makeDecisions();
    const service = new RewardGoalEngineService(
      prisma as never,
      decisions as never,
      makePlans() as never,
    );

    const result = await service.evaluate(context());

    expect(result).toEqual({
      action: 'NO_GOAL',
      reasonCode: 'ALREADY_HAS_ACTIVE_GOAL',
    });
    expect(prisma.customerRewardGoal.create).not.toHaveBeenCalled();
    expect(decisions.record).not.toHaveBeenCalled();
  });

  it('respects the cooldown after a recently closed goal', async () => {
    const prisma = makePrisma({
      lastClosedGoal: { updatedAt: new Date('2026-08-31T12:00:00.000Z') }, // 1 day ago, cooldown 3
    });
    const decisions = makeDecisions();
    const service = new RewardGoalEngineService(
      prisma as never,
      decisions as never,
      makePlans() as never,
    );

    const result = await service.evaluate(context());

    expect(result).toEqual({
      action: 'NO_GOAL',
      reasonCode: 'COOLDOWN_ACTIVE',
    });
    expect(decisions.record).toHaveBeenCalledWith(
      expect.objectContaining({ decisionCode: 'REWARD_GOAL_SKIPPED' }),
    );
  });

  it('creates a goal once the cooldown has elapsed', async () => {
    const prisma = makePrisma({
      lastClosedGoal: { updatedAt: new Date('2026-08-20T12:00:00.000Z') }, // 12 days ago
    });
    const decisions = makeDecisions();
    const service = new RewardGoalEngineService(
      prisma as never,
      decisions as never,
      makePlans() as never,
    );

    const result = await service.evaluate(context());

    expect(result.action).toBe('CREATE_GOAL');
  });

  it('skips AT_RISK — defers to the Retention Engine', async () => {
    const prisma = makePrisma();
    const decisions = makeDecisions();
    const service = new RewardGoalEngineService(
      prisma as never,
      decisions as never,
      makePlans() as never,
    );

    const result = await service.evaluate(
      context({ segment: CustomerSegment.AT_RISK }),
    );

    expect(result).toEqual({
      action: 'NO_GOAL',
      reasonCode: 'AT_RISK_DEFERRED_TO_RETENTION_ENGINE',
    });
  });
});

describe('RewardGoalEngineService — capacity protection (Fase E §10)', () => {
  it('excludes an incentive already at its promised-goals cap', async () => {
    const prisma = makePrisma({
      incentives: [{ id: 'inc-1', validDays: [], maxTotalRedemptions: null }],
      promisedCount: 5,
      settings: {
        rewardGoalsEnabled: true,
        rewardGoalCooldownDays: 3,
        rewardGoalMinVisits: null,
        rewardGoalMaxVisits: null,
        maxPromisedRewardGoalsPerIncentive: 5,
      },
    });
    const decisions = makeDecisions();
    const service = new RewardGoalEngineService(
      prisma as never,
      decisions as never,
      makePlans() as never,
    );

    const result = await service.evaluate(context());

    expect(result).toEqual({
      action: 'NO_GOAL',
      reasonCode: 'NO_ELIGIBLE_INCENTIVE',
    });
  });

  it('excludes an incentive whose promised+redeemed already reaches its total cap', async () => {
    const prisma = makePrisma({
      incentives: [{ id: 'inc-1', validDays: [], maxTotalRedemptions: 10 }],
      promisedCount: 6,
      redeemedCount: 4,
    });
    const decisions = makeDecisions();
    const service = new RewardGoalEngineService(
      prisma as never,
      decisions as never,
      makePlans() as never,
    );

    const result = await service.evaluate(context());

    expect(result).toEqual({
      action: 'NO_GOAL',
      reasonCode: 'NO_ELIGIBLE_INCENTIVE',
    });
  });

  it('excludes an incentive not valid today', async () => {
    // NOW is a Tuesday (2); the incentive only allows weekends.
    const prisma = makePrisma({
      incentives: [
        { id: 'inc-1', validDays: [6, 7], maxTotalRedemptions: null },
      ],
    });
    const decisions = makeDecisions();
    const service = new RewardGoalEngineService(
      prisma as never,
      decisions as never,
      makePlans() as never,
    );

    const result = await service.evaluate(context());

    expect(result).toEqual({
      action: 'NO_GOAL',
      reasonCode: 'NO_ELIGIBLE_INCENTIVE',
    });
  });
});

describe('RewardGoalEngineService — dry run (Fase E §32)', () => {
  it('decides but never creates a goal', async () => {
    const prisma = makePrisma();
    const decisions = makeDecisions();
    const service = new RewardGoalEngineService(
      prisma as never,
      decisions as never,
      makePlans() as never,
    );

    const result = await service.evaluate(context(), { dryRun: true });

    expect(result.action).toBe('CREATE_GOAL');
    expect(prisma.customerRewardGoal.create).not.toHaveBeenCalled();
  });

  it('logs DRY_RUN_WOULD_CREATE_REWARD_GOAL instead of the live code', async () => {
    const prisma = makePrisma();
    const decisions = makeDecisions();
    const service = new RewardGoalEngineService(
      prisma as never,
      decisions as never,
      makePlans() as never,
    );

    await service.evaluate(context(), { dryRun: true });

    expect(decisions.record).toHaveBeenCalledWith(
      expect.objectContaining({
        decisionCode: 'DRY_RUN_WOULD_CREATE_REWARD_GOAL',
      }),
    );
  });

  it('never logs a NO_GOAL decision in dry run — only what it would create', async () => {
    const prisma = makePrisma({ activeGoal: null });
    prisma.customerRewardGoal.findFirst.mockImplementation(
      (args: { where: { status?: unknown } }) => {
        if (args.where.status === RewardGoalStatus.ACTIVE)
          return Promise.resolve(null);
        return Promise.resolve(null);
      },
    );
    const decisions = makeDecisions();
    const service = new RewardGoalEngineService(
      prisma as never,
      decisions as never,
      makePlans() as never,
    );

    await service.evaluate(context({ segment: CustomerSegment.AT_RISK }), {
      dryRun: true,
    });

    expect(decisions.record).not.toHaveBeenCalled();
  });
});

describe('RewardGoalEngineService — business-level dry run (Fase E §32)', () => {
  it('forces dry-run even when the caller asked for a real evaluation, if the business has it on', async () => {
    const prisma = makePrisma({
      settings: {
        rewardGoalsEnabled: true,
        rewardGoalCooldownDays: 3,
        rewardGoalMinVisits: null,
        rewardGoalMaxVisits: null,
        maxPromisedRewardGoalsPerIncentive: null,
        dryRunEnabled: true,
      },
    });
    const decisions = makeDecisions();
    const service = new RewardGoalEngineService(
      prisma as never,
      decisions as never,
      makePlans() as never,
    );

    // The check-in trigger always calls with dryRun: false (default) — the
    // business's own pilot switch is what must still stop a real create.
    const result = await service.evaluate(context());

    expect(result.action).toBe('CREATE_GOAL');
    expect(prisma.customerRewardGoal.create).not.toHaveBeenCalled();
    expect(decisions.record).toHaveBeenCalledWith(
      expect.objectContaining({
        decisionCode: 'DRY_RUN_WOULD_CREATE_REWARD_GOAL',
      }),
    );
  });
});

describe('RewardGoalEngineService — concurrency', () => {
  it('recovers when the partial unique index rejects a racing create', async () => {
    const prisma = makePrisma();
    prisma.customerRewardGoal.create.mockRejectedValue(
      new Error('unique violation'),
    );
    // The pre-check sees no ACTIVE goal yet (so the engine proceeds to
    // create); the post-race recovery lookup, called only from inside the
    // catch block, then finds the winner another worker just created.
    let activeGoalCalls = 0;
    prisma.customerRewardGoal.findFirst.mockImplementation(
      (args: { where: { status?: unknown } }) => {
        if (args.where.status === RewardGoalStatus.ACTIVE) {
          activeGoalCalls += 1;
          return Promise.resolve(
            activeGoalCalls === 1 ? null : { id: 'winner-goal' },
          );
        }
        return Promise.resolve(null);
      },
    );
    const decisions = makeDecisions();
    const service = new RewardGoalEngineService(
      prisma as never,
      decisions as never,
      makePlans() as never,
    );

    const result = await service.evaluate(context());

    expect(result.action).toBe('CREATE_GOAL');
    expect(prisma.customerRewardGoal.create).toHaveBeenCalledTimes(1);
    expect(activeGoalCalls).toBe(2);
  });
});

describe('RewardGoalEngineService — tope self-service de 50 clientes (Fase FREE sellos)', () => {
  it('no crea la tarjeta cuando el negocio ya está en el límite — nunca la unicidad de la fila', async () => {
    const prisma = makePrisma();
    const decisions = makeDecisions();
    const plans = makePlans();
    plans.canAddParticipant.mockResolvedValue(false);
    const service = new RewardGoalEngineService(
      prisma as never,
      decisions as never,
      plans as never,
    );

    const result = await service.evaluate(context());

    expect(result).toEqual({
      action: 'NO_GOAL',
      reasonCode: 'PARTICIPANT_LIMIT_REACHED',
    });
    expect(prisma.customerRewardGoal.create).not.toHaveBeenCalled();
    expect(plans.canAddParticipant).toHaveBeenCalledWith('biz-1', 'cust-1');
  });

  it('sin límite (canAddParticipant true) crea la tarjeta normalmente', async () => {
    const prisma = makePrisma();
    const decisions = makeDecisions();
    const plans = makePlans();
    const service = new RewardGoalEngineService(
      prisma as never,
      decisions as never,
      plans as never,
    );

    const result = await service.evaluate(context());

    expect(result.action).toBe('CREATE_GOAL');
    expect(prisma.customerRewardGoal.create).toHaveBeenCalledTimes(1);
  });

  it('nunca consulta el límite si la decisión ya era NO_GOAL por otro motivo', async () => {
    const prisma = makePrisma({ settings: { rewardGoalsEnabled: false } });
    const decisions = makeDecisions();
    const plans = makePlans();
    const service = new RewardGoalEngineService(
      prisma as never,
      decisions as never,
      plans as never,
    );

    await service.evaluate(context());

    expect(plans.canAddParticipant).not.toHaveBeenCalled();
  });
});
