import { RewardGoalUnlockService } from './reward-goal-unlock.service';

const NOW = new Date('2026-09-05T12:00:00.000Z');

function goalFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'goal-1',
    activatedAt: new Date('2026-09-01T00:00:00.000Z'),
    targetAdditionalVisits: 2,
    incentiveDefinition: { name: 'Upgrade gratis' },
    ...overrides,
  };
}

function makeDeps(
  options: {
    goal?: unknown;
    visitCount?: number;
    bonusStampCount?: number;
    transitionedCount?: number;
  } = {},
) {
  const prisma = {
    customerRewardGoal: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.goal === undefined ? goalFixture() : options.goal,
        ),
      updateMany: jest
        .fn()
        .mockResolvedValue({ count: options.transitionedCount ?? 1 }),
    },
    visit: {
      count: jest.fn().mockResolvedValue(options.visitCount ?? 0),
    },
    rewardGoalBonusStamp: {
      count: jest.fn().mockResolvedValue(options.bonusStampCount ?? 0),
    },
  };
  const decisions = { record: jest.fn().mockResolvedValue(undefined) };
  const issuer = {
    issueForGoal: jest.fn().mockResolvedValue({
      participationId: 'part-1',
      code: 'ABCD1234',
      expiresAt: new Date('2026-09-15T00:00:00.000Z'),
    }),
  };
  const unlockNotification = { notify: jest.fn().mockResolvedValue(undefined) };
  return { prisma, decisions, issuer, unlockNotification };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new RewardGoalUnlockService(
    deps.prisma as never,
    deps.decisions as never,
    deps.issuer as never,
    deps.unlockNotification as never,
  );
}

describe('RewardGoalUnlockService — no active goal', () => {
  it('is a no-op', async () => {
    const deps = makeDeps({ goal: null });
    const service = makeService(deps);

    expect(await service.evaluateUnlock('biz-1', 'cust-1', NOW)).toEqual({
      status: 'no_active_goal',
    });
    expect(deps.issuer.issueForGoal).not.toHaveBeenCalled();
  });
});

describe('RewardGoalUnlockService — progress (Fase E §13)', () => {
  it('counts only visits strictly after activatedAt', async () => {
    const deps = makeDeps({ visitCount: 1 });
    const service = makeService(deps);

    await service.evaluateUnlock('biz-1', 'cust-1', NOW);

    expect(deps.prisma.visit.count).toHaveBeenCalledWith({
      where: {
        businessId: 'biz-1',
        customerId: 'cust-1',
        occurredAt: { gt: goalFixture().activatedAt },
      },
    });
  });

  it('stays in progress while below target', async () => {
    const deps = makeDeps({ visitCount: 1 }); // target is 2
    const service = makeService(deps);

    const result = await service.evaluateUnlock('biz-1', 'cust-1', NOW);

    expect(result).toEqual({
      status: 'in_progress',
      goalId: 'goal-1',
      progressVisits: 1,
      visitProgress: 1,
      bonusStamps: 0,
      targetAdditionalVisits: 2,
      incentiveName: 'Upgrade gratis',
    });
    expect(deps.prisma.customerRewardGoal.updateMany).not.toHaveBeenCalled();
  });

  it('adds feedback bonus stamps on top of real visits — either alone can reach the target', async () => {
    const deps = makeDeps({ visitCount: 1, bonusStampCount: 1 }); // target is 2
    const service = makeService(deps);

    const result = await service.evaluateUnlock('biz-1', 'cust-1', NOW);

    expect(deps.prisma.rewardGoalBonusStamp.count).toHaveBeenCalledWith({
      where: { rewardGoalId: 'goal-1' },
    });
    expect(result).toMatchObject({ status: 'unlocked' });
  });
});

describe('RewardGoalUnlockService — unlocking', () => {
  it('transitions ACTIVE to UNLOCKED once the target is met', async () => {
    const deps = makeDeps({ visitCount: 2 });
    const service = makeService(deps);

    await service.evaluateUnlock('biz-1', 'cust-1', NOW);

    expect(deps.prisma.customerRewardGoal.updateMany).toHaveBeenCalledWith({
      where: { id: 'goal-1', status: 'ACTIVE' },
      data: { status: 'UNLOCKED', unlockedAt: NOW },
    });
  });

  it('issues the reward only after a successful transition', async () => {
    const deps = makeDeps({ visitCount: 2 });
    const service = makeService(deps);

    const result = await service.evaluateUnlock('biz-1', 'cust-1', NOW);

    expect(deps.issuer.issueForGoal).toHaveBeenCalledWith('goal-1', NOW);
    expect(result).toEqual({
      status: 'unlocked',
      goalId: 'goal-1',
      incentiveName: 'Upgrade gratis',
      code: 'ABCD1234',
      expiresAt: new Date('2026-09-15T00:00:00.000Z'),
    });
  });

  it('logs REWARD_GOAL_UNLOCKED exactly once', async () => {
    const deps = makeDeps({ visitCount: 3 }); // overshoot still unlocks
    const service = makeService(deps);

    await service.evaluateUnlock('biz-1', 'cust-1', NOW);

    expect(deps.decisions.record).toHaveBeenCalledTimes(1);
    expect(deps.decisions.record).toHaveBeenCalledWith(
      expect.objectContaining({ decisionCode: 'REWARD_GOAL_UNLOCKED' }),
    );
  });
});

describe('RewardGoalUnlockService — reward-unlocked notification', () => {
  it('notifies exactly once, with the real goal/participation, after a successful unlock', async () => {
    const deps = makeDeps({ visitCount: 2 });
    const service = makeService(deps);

    await service.evaluateUnlock('biz-1', 'cust-1', NOW);

    expect(deps.unlockNotification.notify).toHaveBeenCalledTimes(1);
    expect(deps.unlockNotification.notify).toHaveBeenCalledWith({
      businessId: 'biz-1',
      customerId: 'cust-1',
      goalId: 'goal-1',
      rewardName: 'Upgrade gratis',
      participationId: 'part-1',
      now: NOW,
    });
  });

  it('never notifies while still in progress', async () => {
    const deps = makeDeps({ visitCount: 1 }); // target is 2
    const service = makeService(deps);

    await service.evaluateUnlock('biz-1', 'cust-1', NOW);

    expect(deps.unlockNotification.notify).not.toHaveBeenCalled();
  });

  it('never notifies when the transition loses the race (already_processed)', async () => {
    const deps = makeDeps({ visitCount: 2, transitionedCount: 0 });
    const service = makeService(deps);

    await service.evaluateUnlock('biz-1', 'cust-1', NOW);

    expect(deps.unlockNotification.notify).not.toHaveBeenCalled();
  });

  it('never notifies when there is no active goal at all', async () => {
    const deps = makeDeps({ goal: null });
    const service = makeService(deps);

    await service.evaluateUnlock('biz-1', 'cust-1', NOW);

    expect(deps.unlockNotification.notify).not.toHaveBeenCalled();
  });

  it('a rejected notification never surfaces as an error from evaluateUnlock', async () => {
    const deps = makeDeps({ visitCount: 2 });
    deps.unlockNotification.notify.mockRejectedValue(new Error('boom'));
    const service = makeService(deps);

    const result = await service.evaluateUnlock('biz-1', 'cust-1', NOW);

    expect(result).toMatchObject({ status: 'unlocked' });
  });
});

describe('RewardGoalUnlockService — concurrency (Fase E §12)', () => {
  it('never issues a reward when the transition loses the race', async () => {
    const deps = makeDeps({ visitCount: 2, transitionedCount: 0 });
    const service = makeService(deps);

    const result = await service.evaluateUnlock('biz-1', 'cust-1', NOW);

    expect(result).toEqual({ status: 'already_processed' });
    expect(deps.issuer.issueForGoal).not.toHaveBeenCalled();
    expect(deps.decisions.record).not.toHaveBeenCalled();
  });

  it('two simultaneous evaluations only ever issue one reward', async () => {
    // Simulate the DB-level guarantee directly: only the first updateMany
    // call reports a real transition; everything after it sees count: 0.
    const deps = makeDeps({ visitCount: 2 });
    let calls = 0;
    deps.prisma.customerRewardGoal.updateMany.mockImplementation(() => {
      calls += 1;
      return Promise.resolve({ count: calls === 1 ? 1 : 0 });
    });
    const service = makeService(deps);

    const [first, second] = await Promise.all([
      service.evaluateUnlock('biz-1', 'cust-1', NOW),
      service.evaluateUnlock('biz-1', 'cust-1', NOW),
    ]);

    const unlockedCount = [first, second].filter(
      (r) => r.status === 'unlocked',
    ).length;
    expect(unlockedCount).toBe(1);
    expect(deps.issuer.issueForGoal).toHaveBeenCalledTimes(1);
  });
});
