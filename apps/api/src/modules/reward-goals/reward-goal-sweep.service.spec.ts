import { ExperienceVersion } from '@prisma/client';
import { RewardGoalSweepService } from './reward-goal-sweep.service';

const NOW = new Date('2026-09-01T12:00:00.000Z');

function makeDeps(
  options: {
    businesses?: unknown[];
    customers?: unknown[];
    hasActiveGoal?: boolean;
    engineDecision?: unknown;
    overdueGoals?: unknown[];
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
      findMany: jest.fn().mockResolvedValue(options.overdueGoals ?? []),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
  const decisions = { record: jest.fn().mockResolvedValue(undefined) };
  return { prisma, engine, decisions };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new RewardGoalSweepService(
    deps.prisma as never,
    deps.engine as never,
    deps.decisions as never,
  );
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

describe('RewardGoalSweepService — expireOverdue (Fase F §0.1)', () => {
  it('finds only ACTIVE goals with a past expiresAt', async () => {
    const deps = makeDeps({ overdueGoals: [] });
    const service = makeService(deps);

    await service.expireOverdue(NOW);

    expect(deps.prisma.customerRewardGoal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'ACTIVE',
          expiresAt: { not: null, lt: NOW },
        },
      }),
    );
  });

  it('transitions each overdue goal ACTIVE → EXPIRED and logs REWARD_GOAL_EXPIRED', async () => {
    const deps = makeDeps({
      overdueGoals: [
        { id: 'goal-1', businessId: 'biz-1', customerId: 'cust-1' },
      ],
    });
    const service = makeService(deps);

    const result = await service.expireOverdue(NOW);

    expect(deps.prisma.customerRewardGoal.updateMany).toHaveBeenCalledWith({
      where: { id: 'goal-1', status: 'ACTIVE' },
      data: { status: 'EXPIRED' },
    });
    expect(deps.decisions.record).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'biz-1',
        customerId: 'cust-1',
        decisionCode: 'REWARD_GOAL_EXPIRED',
      }),
    );
    expect(result).toEqual({ checked: 1, expired: 1 });
  });

  it('never emits a BenefitParticipation or touches the benefits module', async () => {
    const deps = makeDeps({
      overdueGoals: [
        { id: 'goal-1', businessId: 'biz-1', customerId: 'cust-1' },
      ],
    });
    const service = makeService(deps);

    await service.expireOverdue(NOW);

    // The mock Prisma client has no `benefit`/`benefitParticipation` model at
    // all — if the sweep ever touched one, this test would throw on access
    // rather than silently pass.
    expect((deps.prisma as Record<string, unknown>).benefit).toBeUndefined();
    expect(
      (deps.prisma as Record<string, unknown>).benefitParticipation,
    ).toBeUndefined();
  });

  it('idempotent under a race: a goal already closed by a concurrent run is skipped, not double-logged', async () => {
    const deps = makeDeps({
      overdueGoals: [
        { id: 'goal-1', businessId: 'biz-1', customerId: 'cust-1' },
      ],
    });
    deps.prisma.customerRewardGoal.updateMany.mockResolvedValueOnce({
      count: 0,
    });
    const service = makeService(deps);

    const result = await service.expireOverdue(NOW);

    expect(deps.decisions.record).not.toHaveBeenCalled();
    expect(result).toEqual({ checked: 1, expired: 0 });
  });

  it('processes every overdue goal even when the batch spans several businesses/customers', async () => {
    const deps = makeDeps({
      overdueGoals: [
        { id: 'goal-1', businessId: 'biz-1', customerId: 'cust-1' },
        { id: 'goal-2', businessId: 'biz-2', customerId: 'cust-2' },
      ],
    });
    const service = makeService(deps);

    const result = await service.expireOverdue(NOW);

    expect(deps.prisma.customerRewardGoal.updateMany).toHaveBeenCalledTimes(2);
    expect(deps.decisions.record).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ checked: 2, expired: 2 });
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
