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
      // Lo lee `resolveCustomerSegment` al armar el contexto del ciclo
      // siguiente (`ensureNextGoal`).
      findMany: jest.fn().mockResolvedValue([]),
    },
    rewardGoalBonusStamp: {
      count: jest.fn().mockResolvedValue(options.bonusStampCount ?? 0),
    },
    business: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ timezone: 'America/Montevideo' }),
    },
    retentionAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
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
  // El ciclo siguiente se delega al engine — acá se mockea para poder
  // afirmar CON QUÉ se lo llama, sin arrastrar sus reglas a este spec.
  const engine = {
    evaluate: jest.fn().mockResolvedValue({
      action: 'NO_GOAL',
      reasonCode: 'NO_ELIGIBLE_INCENTIVE',
    }),
  };
  return { prisma, decisions, issuer, unlockNotification, engine };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new RewardGoalUnlockService(
    deps.prisma as never,
    deps.decisions as never,
    deps.issuer as never,
    deps.unlockNotification as never,
    deps.engine as never,
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

/**
 * La regla de ciclo: al llegar a N/N, el ciclo siguiente nace en el MISMO
 * flujo, sin esperar al canje, al vencimiento ni a la próxima visita.
 *
 * Antes esto no pasaba: `afterVisit` devolvía temprano al desbloquear y
 * nunca llegaba a crear el goal siguiente, así que el cliente quedaba sin
 * tarjeta hasta su próxima visita.
 */
describe('RewardGoalUnlockService — el ciclo siguiente nace con el unlock', () => {
  function unlockingDeps() {
    // 2 visitas contra un target de 2 → cruza y desbloquea.
    return makeDeps({ visitCount: 2 });
  }

  it('al desbloquear, pide el ciclo siguiente al engine', async () => {
    const deps = unlockingDeps();

    const result = await makeService(deps).evaluateUnlock(
      'biz-1',
      'cust-1',
      NOW,
    );

    expect(result.status).toBe('unlocked');
    expect(deps.engine.evaluate).toHaveBeenCalledTimes(1);
  });

  /**
   * El punto más delicado: la visita que completó el ciclo anterior ya dejó
   * su sello ahí. Si contara también para el nuevo, la tarjeta arrancaría
   * en 1/N en vez de 0/N — el mismo sello dos veces.
   */
  it('marca el trigger como `cycle_completed` — esa visita NO cuenta para el ciclo nuevo', async () => {
    const deps = unlockingDeps();

    await makeService(deps).evaluateUnlock('biz-1', 'cust-1', NOW);

    expect(deps.engine.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'biz-1',
        customerId: 'cust-1',
        // El instante del unlock ES el `occurredAt` de la visita que lo
        // completó (se lo pasa el check-in), y es la frontera del ciclo nuevo.
        now: NOW,
      }),
      { dryRun: false, trigger: 'cycle_completed' },
    );
  });

  it('NO crea ciclo siguiente si el goal no llegó a desbloquear', async () => {
    const deps = makeDeps({ visitCount: 1 }); // 1 de 2 — sigue en progreso

    const result = await makeService(deps).evaluateUnlock(
      'biz-1',
      'cust-1',
      NOW,
    );

    expect(result.status).toBe('in_progress');
    expect(deps.engine.evaluate).not.toHaveBeenCalled();
  });

  /**
   * Idempotencia: el `updateMany` guardado por `status: ACTIVE` es lo que
   * hace que solo UN caller llegue a crear el ciclo siguiente. El segundo
   * ve `count: 0` y se va.
   */
  it('dos unlocks concurrentes: el que pierde la carrera no crea un segundo ciclo', async () => {
    const deps = makeDeps({ visitCount: 2, transitionedCount: 0 });

    const result = await makeService(deps).evaluateUnlock(
      'biz-1',
      'cust-1',
      NOW,
    );

    expect(result.status).toBe('already_processed');
    expect(deps.engine.evaluate).not.toHaveBeenCalled();
    expect(deps.issuer.issueForGoal).not.toHaveBeenCalled();
  });

  it('si crear el ciclo siguiente falla, el unlock y el premio siguen siendo válidos', async () => {
    const deps = unlockingDeps();
    deps.engine.evaluate.mockRejectedValue(new Error('db down'));

    const result = await makeService(deps).evaluateUnlock(
      'biz-1',
      'cust-1',
      NOW,
    );

    expect(result.status).toBe('unlocked');
    if (result.status !== 'unlocked') throw new Error('expected unlocked');
    expect(result.code).toBe('ABCD1234');
  });

  it('un negocio que ya no existe no rompe el unlock', async () => {
    const deps = unlockingDeps();
    deps.prisma.business.findUnique.mockResolvedValue(null);

    const result = await makeService(deps).evaluateUnlock(
      'biz-1',
      'cust-1',
      NOW,
    );

    expect(result.status).toBe('unlocked');
    expect(deps.engine.evaluate).not.toHaveBeenCalled();
  });
});
