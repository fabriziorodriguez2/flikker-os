import { ExperienceVersion } from '@prisma/client';
import { RewardGoalSweepService } from './reward-goal-sweep.service';

const NOW = new Date('2026-09-01T12:00:00.000Z');

function makeDeps(
  options: {
    businesses?: unknown[];
    customers?: unknown[];
    hasActiveGoal?: boolean;
    engineDecision?: unknown;
  } = {},
) {
  const prisma = {
    business: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          options.businesses ?? [
            { id: 'biz-1', timezone: 'America/Montevideo' },
          ],
        ),
    },
    customer: {
      findMany: jest
        .fn()
        .mockResolvedValue(options.customers ?? [{ id: 'cust-1' }]),
    },
    customerRewardGoal: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.hasActiveGoal ? { id: 'existing-goal' } : null,
        ),
    },
    visit: { findMany: jest.fn().mockResolvedValue([]) },
    retentionAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const engine = {
    evaluate: jest.fn().mockResolvedValue(
      options.engineDecision ?? {
        action: 'NO_GOAL',
        reasonCode: 'NO_ELIGIBLE_INCENTIVE',
      },
    ),
  };
  return { prisma, engine };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new RewardGoalSweepService(deps.prisma as never, deps.engine as never);
}

describe('RewardGoalSweepService — business ownership (Fase E §42)', () => {
  it('only sweeps CHECKIN_V2 businesses with reward goals enabled', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.runDaily(NOW);

    expect(deps.prisma.business.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          experienceVersion: ExperienceVersion.CHECKIN_V2,
          retentionSettings: { rewardGoalsEnabled: true },
        },
      }),
    );
  });
});

describe('RewardGoalSweepService — skipping the common case', () => {
  it('never re-evaluates a customer who already has an ACTIVE goal', async () => {
    const deps = makeDeps({ hasActiveGoal: true });
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(deps.engine.evaluate).not.toHaveBeenCalled();
    expect(result.evaluated).toBe(0);
  });

  it('evaluates a customer with no active goal', async () => {
    const deps = makeDeps({ hasActiveGoal: false });
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(deps.engine.evaluate).toHaveBeenCalledTimes(1);
    expect(result.evaluated).toBe(1);
  });
});

describe('RewardGoalSweepService — dry run (Fase E §32)', () => {
  it('forwards dryRun to the engine for every customer', async () => {
    const deps = makeDeps({
      engineDecision: {
        action: 'CREATE_GOAL',
        incentiveDefinitionId: 'inc-1',
        targetAdditionalVisits: 1,
        reasonCode: 'NEW_SECOND_VISIT',
      },
    });
    const service = makeService(deps);

    const result = await service.runDaily(NOW, true);

    expect(deps.engine.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cust-1' }),
      { dryRun: true },
    );
    expect(result.created).toBe(1);
  });
});

describe('RewardGoalSweepService — resilience', () => {
  it('keeps sweeping other businesses when one throws', async () => {
    const deps = makeDeps({
      businesses: [
        { id: 'biz-bad', timezone: 'America/Montevideo' },
        { id: 'biz-ok', timezone: 'America/Montevideo' },
      ],
    });
    deps.prisma.customer.findMany
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([{ id: 'cust-1' }]);
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(result.businesses).toBe(2);
    expect(result.evaluated).toBe(1);
  });
});
