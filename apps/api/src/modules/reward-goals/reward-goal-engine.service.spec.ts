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
          // `hasActiveGoal` ahora consulta `status: RewardGoalStatus.ACTIVE`
          // — un STRING plano. `isCooldownActive` consulta
          // `status: { in: CLOSED_STATUSES } }` — un OBJETO. Es lo que
          // distingue acá a una llamada de la otra (mock, no la implementación
          // real — Prisma de verdad filtraría por el valor, no por la forma).
          const status = args.where.status;
          if (typeof status === 'string') {
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

  it('respects the cooldown after a recently EXPIRED goal (never completed)', async () => {
    const prisma = makePrisma({
      lastClosedGoal: {
        status: 'EXPIRED',
        updatedAt: new Date('2026-08-31T12:00:00.000Z'), // 1 day ago, cooldown 3
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
      reasonCode: 'COOLDOWN_ACTIVE',
    });
    expect(decisions.record).toHaveBeenCalledWith(
      expect.objectContaining({ decisionCode: 'REWARD_GOAL_SKIPPED' }),
    );
  });

  it('creates a goal once the cooldown has elapsed (last closed was CANCELLED)', async () => {
    const prisma = makePrisma({
      lastClosedGoal: {
        status: 'CANCELLED',
        updatedAt: new Date('2026-08-20T12:00:00.000Z'), // 12 days ago
      },
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

  it('a REDEEMED goal never triggers cooldown, even less than a day later — auditoría de caso real (Fase E §33 revisado)', async () => {
    const prisma = makePrisma({
      lastClosedGoal: {
        status: 'REDEEMED',
        // 22 horas antes de NOW — mucho menos que el cooldown de 3 días, y
        // sin embargo NUNCA debe bloquear: el ciclo anterior ya se completó
        // y canjeó de verdad, la próxima Visit válida arranca uno nuevo.
        updatedAt: new Date('2026-08-31T14:00:00.000Z'),
      },
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

/**
 * Punto 7 de la auditoría: reversión deliberada de la política anterior
 * ("no new cycle while UNLOCKED is unredeemed" — este mismo describe block
 * fijaba ESO antes). Causa raíz encontrada: un goal UNLOCKED no tiene ningún
 * camino de salida que dependa del cliente (REDEEMED solo lo escribe el
 * negocio al canjear; el barrido diario viejo solo miraba ACTIVE), así que
 * bloquear la tarjeta siguiente mientras estuviera UNLOCKED dejaba al
 * cliente congelado para siempre si no volvía a canjear. Ver el comentario
 * de `hasActiveGoal` en el service.
 */
describe('RewardGoalEngineService — un premio UNLOCKED sin canjear ya NO frena la tarjeta siguiente', () => {
  it('crea un goal nuevo aunque el cliente tenga un premio UNLOCKED sin canjear (ni bloqueo, ni cooldown)', async () => {
    // `hasActiveGoal` ahora consulta literal `status: ACTIVE` — un goal
    // UNLOCKED no matchea esa condición en la base real, así que acá alcanza
    // con `activeGoal: null`. `isCooldownActive` ahora consulta
    // `status: { in: CLOSED_STATUSES } }` (REDEEMED/EXPIRED/CANCELLED) — un
    // UNLOCKED tampoco matchea eso, así que `lastClosedGoal: null` es
    // correcto también: desde el punto de vista de las DOS queries del
    // engine, el UNLOCKED es completamente invisible, y por eso ya no frena
    // nada.
    const prisma = makePrisma({ activeGoal: null, lastClosedGoal: null });
    const decisions = makeDecisions();
    const service = new RewardGoalEngineService(
      prisma as never,
      decisions as never,
      makePlans() as never,
    );

    const result = await service.evaluate(context());

    expect(result.action).toBe('CREATE_GOAL');
    expect(prisma.customerRewardGoal.create).toHaveBeenCalledTimes(1);
  });

  it('SÍ sigue bloqueando mientras la tarjeta en curso está ACTIVE — eso no cambió', async () => {
    const prisma = makePrisma({ activeGoal: { id: 'active-goal' } });
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
  });

  it('allows a new goal once the previous one is REDEEMED (not just UNLOCKED)', async () => {
    const prisma = makePrisma({
      activeGoal: null,
      lastClosedGoal: {
        status: 'REDEEMED',
        updatedAt: new Date('2026-08-01T12:00:00.000Z'),
      },
    });
    const decisions = makeDecisions();
    const service = new RewardGoalEngineService(
      prisma as never,
      decisions as never,
      makePlans() as never,
    );

    const result = await service.evaluate(context());

    expect(result.action).toBe('CREATE_GOAL');
    expect(prisma.customerRewardGoal.create).toHaveBeenCalledTimes(1);
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
    // Two different queries both mean "is there a live goal right now?":
    // the pre-check (`hasActiveGoal`, plain `status: ACTIVE` since this
    // session's fix) and the post-race recovery lookup inside `createGoal`'s
    // catch block (also plain `status: ACTIVE`, unchanged — a goal can only
    // ever race to create while ACTIVE; UNLOCKED no longer participates in
    // this at all).
    let activeGoalCalls = 0;
    prisma.customerRewardGoal.findFirst.mockImplementation(
      (args: { where: { status?: unknown } }) => {
        const status = args.where.status;
        // Solo el string plano `ACTIVE` es "¿hay un goal vivo?" — lo consulta
        // TANTO `hasActiveGoal` (el pre-check, dentro del `Promise.all` de
        // `evaluate`) como la recuperación post-carrera dentro del catch de
        // `createGoal`. `isCooldownActive` usa una forma distinta
        // (`{ in: CLOSED_STATUSES } }`, un objeto) y no participa de esta
        // carrera — siempre "sin cierre reciente" acá, para no interferir.
        if (status === RewardGoalStatus.ACTIVE) {
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

/**
 * La frontera temporal de cada ciclo (`activatedAt`), que es lo único que
 * decide si la visita del momento cuenta o no.
 *
 * Todos los consumidores de progreso cuentan `occurredAt > activatedAt`,
 * ESTRICTAMENTE. Por eso un milisegundo acá cambia el resultado, y por eso
 * los dos casos tienen que estar fijados por separado: son opuestos.
 */
describe('RewardGoalEngineService — activatedAt: qué visita cuenta y cuál no', () => {
  function creatingPrisma() {
    return makePrisma({ activeGoal: null, lastClosedGoal: null });
  }

  it('trigger `visit` (default): la visita fundadora SÍ cuenta — activatedAt queda 1ms ANTES', async () => {
    const prisma = creatingPrisma();
    const service = new RewardGoalEngineService(
      prisma as never,
      makeDecisions() as never,
      makePlans() as never,
    );

    await service.evaluate(context());

    const created = prisma.customerRewardGoal.create.mock.calls[0][0];
    expect(created.data.activatedAt).toEqual(new Date(NOW.getTime() - 1));
    // Una visita en `NOW` es estrictamente posterior → entra: 1/N.
    expect(NOW > created.data.activatedAt).toBe(true);
  });

  it('trigger `cycle_completed`: la visita que completó el ciclo anterior NO cuenta — activatedAt queda EN ese instante', async () => {
    const prisma = creatingPrisma();
    const service = new RewardGoalEngineService(
      prisma as never,
      makeDecisions() as never,
      makePlans() as never,
    );

    await service.evaluate(context(), {
      dryRun: false,
      trigger: 'cycle_completed',
    });

    const created = prisma.customerRewardGoal.create.mock.calls[0][0];
    expect(created.data.activatedAt).toEqual(NOW);
    // La visita que completó el ciclo ocurrió EN `NOW`: no es estrictamente
    // posterior a sí misma, así que queda afuera → la tarjeta arranca 0/N.
    expect(NOW > created.data.activatedAt).toBe(false);
    // Y la próxima visita válida sí entra.
    expect(new Date(NOW.getTime() + 1) > created.data.activatedAt).toBe(true);
  });

  it('`cycle_completed` ignora el cooldown — completar una tarjeta nunca frena la siguiente', async () => {
    const prisma = makePrisma({
      activeGoal: null,
      lastClosedGoal: {
        status: 'EXPIRED',
        updatedAt: new Date(NOW.getTime() - 3600_000), // hace una hora
      },
    });
    const service = new RewardGoalEngineService(
      prisma as never,
      makeDecisions() as never,
      makePlans() as never,
    );

    const result = await service.evaluate(context(), {
      dryRun: false,
      trigger: 'cycle_completed',
    });

    expect(result.action).toBe('CREATE_GOAL');
  });

  it('con trigger `visit`, ese mismo cooldown SÍ frena — la regla no se aflojó para todos', async () => {
    const prisma = makePrisma({
      activeGoal: null,
      lastClosedGoal: {
        status: 'EXPIRED',
        updatedAt: new Date(NOW.getTime() - 3600_000),
      },
    });
    const service = new RewardGoalEngineService(
      prisma as never,
      makeDecisions() as never,
      makePlans() as never,
    );

    expect((await service.evaluate(context())).reasonCode).toBe(
      'COOLDOWN_ACTIVE',
    );
  });

  /*
    §8: el ciclo siguiente sigue pasando por TODAS las reglas del engine. Si
    el dueño apagó los sellos, no se crea uno vacío — la regla vigente no se
    toca ni se inventa una excepción.
  */
  it('con los sellos apagados NO crea el ciclo siguiente, ni siquiera tras un unlock', async () => {
    const prisma = makePrisma({
      settings: {
        rewardGoalsEnabled: false,
        rewardGoalCooldownDays: 3,
        rewardGoalMinVisits: null,
        rewardGoalMaxVisits: null,
        maxPromisedRewardGoalsPerIncentive: null,
      },
    });
    const service = new RewardGoalEngineService(
      prisma as never,
      makeDecisions() as never,
      makePlans() as never,
    );

    const result = await service.evaluate(context(), {
      dryRun: false,
      trigger: 'cycle_completed',
    });

    expect(result).toEqual({
      action: 'NO_GOAL',
      reasonCode: 'REWARD_GOALS_DISABLED',
    });
    expect(prisma.customerRewardGoal.create).not.toHaveBeenCalled();
  });

  it('sin incentivo elegible tampoco crea un ciclo vacío', async () => {
    const prisma = makePrisma({ activeGoal: null, incentives: [] });
    const service = new RewardGoalEngineService(
      prisma as never,
      makeDecisions() as never,
      makePlans() as never,
    );

    const result = await service.evaluate(context(), {
      dryRun: false,
      trigger: 'cycle_completed',
    });

    expect(result.reasonCode).toBe('NO_ELIGIBLE_INCENTIVE');
    expect(prisma.customerRewardGoal.create).not.toHaveBeenCalled();
  });

  /*
    §3: el target se congela al crear. Si el dueño después pasa de 6 a 8, el
    ciclo ya creado conserva su 6 — `targetAdditionalVisits` es una columna,
    no una lectura viva de la configuración.
  */
  it('snapshotea el target al crearse — un cambio posterior de config no lo mueve', async () => {
    const prisma = makePrisma({
      activeGoal: null,
      settings: {
        rewardGoalsEnabled: true,
        rewardGoalCooldownDays: 3,
        rewardGoalMinVisits: 6,
        rewardGoalMaxVisits: 6,
        maxPromisedRewardGoalsPerIncentive: null,
      },
    });
    const service = new RewardGoalEngineService(
      prisma as never,
      makeDecisions() as never,
      makePlans() as never,
    );

    await service.evaluate(context(), {
      dryRun: false,
      trigger: 'cycle_completed',
    });

    const created = prisma.customerRewardGoal.create.mock.calls[0][0];
    expect(created.data.targetAdditionalVisits).toBe(6);
  });

  it('un ciclo ACTIVE ya existente sigue bloqueando — nunca dos tarjetas en curso', async () => {
    const prisma = makePrisma({ activeGoal: { id: 'ya-hay-uno' } });
    const service = new RewardGoalEngineService(
      prisma as never,
      makeDecisions() as never,
      makePlans() as never,
    );

    const result = await service.evaluate(context(), {
      dryRun: false,
      trigger: 'cycle_completed',
    });

    expect(result.reasonCode).toBe('ALREADY_HAS_ACTIVE_GOAL');
    expect(prisma.customerRewardGoal.create).not.toHaveBeenCalled();
  });
});
