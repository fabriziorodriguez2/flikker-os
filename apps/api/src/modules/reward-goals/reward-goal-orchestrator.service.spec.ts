import { RewardGoalOrchestratorService } from './reward-goal-orchestrator.service';

const NOW = new Date('2026-09-05T12:00:00.000Z');

function makeDeps(
  options: {
    unlockResult?: unknown;
    engineDecision?: unknown;
    visits?: { occurredAt: Date }[];
    incentiveName?: string;
    createdGoal?: unknown;
    visitCount?: number;
    bonusStampCount?: number;
  } = {},
) {
  const prisma = {
    visit: {
      findMany: jest.fn().mockResolvedValue(options.visits ?? []),
      count: jest.fn().mockResolvedValue(options.visitCount ?? 0),
    },
    retentionAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
    retentionIncentiveDefinition: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ name: options.incentiveName ?? 'Upgrade gratis' }),
    },
    // `maybeCreateGoal` busca el goal recién creado para reportar su
    // progreso REAL (bug real corregido — antes devolvía siempre 0). `null`
    // por default simula el caso dry-run (el engine decide CREATE_GOAL pero
    // nunca escribe la fila); un test dedicado cubre el caso con fila real.
    customerRewardGoal: {
      findFirst: jest.fn().mockResolvedValue(options.createdGoal ?? null),
    },
    rewardGoalBonusStamp: {
      count: jest.fn().mockResolvedValue(options.bonusStampCount ?? 0),
    },
  };
  const engine = {
    evaluate: jest.fn().mockResolvedValue(
      options.engineDecision ?? {
        action: 'NO_GOAL',
        reasonCode: 'NO_ELIGIBLE_INCENTIVE',
      },
    ),
  };
  const unlock = {
    evaluateUnlock: jest
      .fn()
      .mockResolvedValue(options.unlockResult ?? { status: 'no_active_goal' }),
  };
  return { prisma, engine, unlock };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new RewardGoalOrchestratorService(
    deps.prisma as never,
    deps.engine as never,
    deps.unlock as never,
  );
}

describe('RewardGoalOrchestratorService — unlock takes priority', () => {
  it('reports the unlocked benefit and never asks the engine for a new goal', async () => {
    const deps = makeDeps({
      unlockResult: {
        status: 'unlocked',
        goalId: 'goal-1',
        incentiveName: 'Café gratis',
        code: 'ABCD1234',
        expiresAt: new Date('2026-09-20T00:00:00.000Z'),
      },
    });
    const service = makeService(deps);

    const result = await service.afterVisit(
      'biz-1',
      'cust-1',
      'America/Montevideo',
      NOW,
    );

    expect(result).toEqual({
      goal: null,
      unlockedNow: true,
      benefit: {
        name: 'Café gratis',
        code: 'ABCD1234',
        expiresAt: '2026-09-20T00:00:00.000Z',
      },
    });
    expect(deps.engine.evaluate).not.toHaveBeenCalled();
  });

  it('reports progress without touching the engine while a goal is still active', async () => {
    const deps = makeDeps({
      unlockResult: {
        status: 'in_progress',
        goalId: 'goal-1',
        progressVisits: 1,
        targetAdditionalVisits: 3,
        incentiveName: 'Upgrade gratis',
      },
    });
    const service = makeService(deps);

    const result = await service.afterVisit(
      'biz-1',
      'cust-1',
      'America/Montevideo',
      NOW,
    );

    expect(result).toEqual({
      goal: {
        incentiveName: 'Upgrade gratis',
        progressVisits: 1,
        targetAdditionalVisits: 3,
        remainingVisits: 2,
      },
      unlockedNow: false,
      benefit: null,
    });
    expect(deps.engine.evaluate).not.toHaveBeenCalled();
  });
});

describe('RewardGoalOrchestratorService — creating a new goal (Fase E §27)', () => {
  it('only asks the engine when there is no active goal to report — dry-run preview (no row written)', async () => {
    const deps = makeDeps({
      unlockResult: { status: 'no_active_goal' },
      engineDecision: {
        action: 'CREATE_GOAL',
        incentiveDefinitionId: 'inc-1',
        targetAdditionalVisits: 1,
        reasonCode: 'NEW_SECOND_VISIT',
      },
    });
    const service = makeService(deps);

    const result = await service.afterVisit(
      'biz-1',
      'cust-1',
      'America/Montevideo',
      NOW,
    );

    expect(deps.engine.evaluate).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      goal: {
        incentiveName: 'Upgrade gratis',
        progressVisits: 0,
        visitProgress: 0,
        bonusStamps: 0,
        targetAdditionalVisits: 1,
        remainingVisits: 1,
      },
      unlockedNow: false,
      benefit: null,
    });
  });

  /**
   * Bug real corregido — auditoría de caso real: la primera visita nunca
   * dejaba el primer sello. Cuando el engine SÍ escribió la fila (caso real,
   * no dry-run), `maybeCreateGoal` debe reportar el progreso REAL de la
   * visita fundadora (vía `computeProgress`), nunca el 0 hardcodeado de
   * antes.
   */
  it('reports the REAL progress of the founding visit when the engine actually created the goal', async () => {
    const deps = makeDeps({
      unlockResult: { status: 'no_active_goal' },
      engineDecision: {
        action: 'CREATE_GOAL',
        incentiveDefinitionId: 'inc-1',
        targetAdditionalVisits: 3,
        reasonCode: 'NEW_SECOND_VISIT',
      },
      createdGoal: {
        id: 'goal-2',
        activatedAt: new Date(NOW.getTime() - 1),
        targetAdditionalVisits: 3,
        incentiveDefinition: { name: 'Café gratis' },
      },
      visitCount: 1,
      bonusStampCount: 0,
    });
    const service = makeService(deps);

    const result = await service.afterVisit(
      'biz-1',
      'cust-1',
      'America/Montevideo',
      NOW,
    );

    expect(result).toEqual({
      goal: {
        incentiveName: 'Café gratis',
        progressVisits: 1,
        visitProgress: 1,
        bonusStamps: 0,
        targetAdditionalVisits: 3,
        remainingVisits: 2,
      },
      unlockedNow: false,
      benefit: null,
    });
  });

  it('reports nothing when the engine decides not to create a goal', async () => {
    const deps = makeDeps({ unlockResult: { status: 'no_active_goal' } });
    const service = makeService(deps);

    const result = await service.afterVisit(
      'biz-1',
      'cust-1',
      'America/Montevideo',
      NOW,
    );

    expect(result).toEqual({ goal: null, unlockedNow: false, benefit: null });
  });

  it('reports nothing after the transition race is lost elsewhere (already_processed)', async () => {
    const deps = makeDeps({ unlockResult: { status: 'already_processed' } });
    const service = makeService(deps);

    const result = await service.afterVisit(
      'biz-1',
      'cust-1',
      'America/Montevideo',
      NOW,
    );

    expect(result).toEqual({ goal: null, unlockedNow: false, benefit: null });
    expect(deps.engine.evaluate).toHaveBeenCalledTimes(1);
  });
});
