import {
  Prisma,
  ReturnChallengeCancelReason,
  ReturnChallengeStatus,
  RewardGoalStatus,
} from '@prisma/client';
import { ReturnChallengeService } from './return-challenge.service';

const BIZ = 'biz-1';
const CUST = 'cust-1';
const MVD = 'America/Montevideo';
/** Martes 2026-09-22, 15:00 local. */
const NOW = new Date('2026-09-22T18:00:00Z');

interface Options {
  /** Estado inicial de la fila del desafío. `null` = no existe ninguno. */
  challenge?: {
    status: ReturnChallengeStatus;
    startsAt: Date;
    expiresAt: Date;
  } | null;
  /** `false` = la tarjeta prometida ya no está ACTIVE. */
  goalActive?: boolean;
  /** Simula que `create` del sello explota. */
  stampFails?: boolean;
  /** Objetivo de la tarjeta. Default 6, como en los ejemplos del pedido. */
  targetAdditionalVisits?: number;
  /**
   * Cuántas `Visit` cuenta `tx.visit.count` — YA incluye, como en la
   * realidad, la visita que originó este `completeForVisit`.
   */
  visitsSinceActivation?: number;
  /** Bonus stamps que ya existían para esta tarjeta ANTES de este intento. */
  existingBonusStamps?: number;
}

/**
 * Estado compartido que imita la fila en la base. La transacción se serializa
 * como lo haría el advisory lock, y muta el estado igual que Postgres — así
 * los tests de concurrencia miden algo y no una secuencia fija de mocks.
 */
function buildHarness(options: Options = {}) {
  const row = {
    id: 'rc-1',
    businessId: BIZ,
    status: options.challenge?.status ?? ReturnChallengeStatus.ACTIVE,
    rewardGoalId: 'goal-1',
    startsAt: options.challenge?.startsAt ?? new Date('2026-09-20T00:00:00Z'),
    expiresAt: options.challenge?.expiresAt ?? new Date('2026-09-28T03:00:00Z'),
    cancelReason: null as ReturnChallengeCancelReason | null,
    completedAt: null as Date | null,
    business: { timezone: MVD },
  };
  const exists = options.challenge !== null;

  const stamps: Record<string, unknown>[] = [];

  const findFirst = jest
    .fn()
    .mockImplementation(() =>
      Promise.resolve(
        exists && row.status === ReturnChallengeStatus.ACTIVE
          ? { ...row }
          : null,
      ),
    );
  const findUnique = jest
    .fn()
    .mockImplementation(() => Promise.resolve(exists ? { ...row } : null));
  const update = jest
    .fn()
    .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      Object.assign(row, data);
      return Promise.resolve({});
    });
  const create = jest.fn().mockResolvedValue({ ...row });

  const stampCreate = jest
    .fn()
    .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      if (options.stampFails) {
        return Promise.reject(new Error('base caída'));
      }
      // El UNIQUE de returnChallengeId, simulado.
      if (stamps.some((s) => s.returnChallengeId === data.returnChallengeId)) {
        return Promise.reject(
          new Prisma.PrismaClientKnownRequestError('unique', {
            code: 'P2002',
            clientVersion: 'test',
          }),
        );
      }
      stamps.push(data);
      return Promise.resolve({ id: `stamp-${stamps.length}` });
    });

  const targetAdditionalVisits = options.targetAdditionalVisits ?? 6;
  const goalFindFirst = jest.fn().mockImplementation(() =>
    Promise.resolve(
      (options.goalActive ?? true)
        ? {
            id: 'goal-1',
            activatedAt: new Date('2026-08-01T00:00:00Z'),
            targetAdditionalVisits,
          }
        : null,
    ),
  );
  const bonusStampCount = jest
    .fn()
    .mockResolvedValue(options.existingBonusStamps ?? 0);
  const visitCount = jest
    .fn()
    .mockResolvedValue(options.visitsSinceActivation ?? 0);

  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    returnChallenge: { findFirst, findUnique, update },
    rewardGoalBonusStamp: { create: stampCreate, count: bonusStampCount },
    customerRewardGoal: { findFirst: goalFindFirst },
    visit: { count: visitCount },
  };

  const prisma = {
    returnChallenge: {
      findFirst,
      findUnique,
      update,
      create,
      findMany: jest.fn(),
    },
    customerRewardGoal: { findFirst: goalFindFirst },
    $transaction: jest
      .fn()
      .mockImplementation((fn: (c: unknown) => Promise<unknown>) =>
        serialize(() => fn(tx)),
      ),
  };

  const service = new ReturnChallengeService(prisma as never);
  return { service, prisma, tx, row, stamps, create, goalFindFirst };
}

/** Imita `pg_advisory_xact_lock`: dos transacciones no se entrelazan. */
let lockChain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = lockChain.then(fn, fn);
  lockChain = next.catch(() => undefined);
  return next;
}

beforeEach(() => {
  lockChain = Promise.resolve();
});

describe('ensureReturnChallenge — creación', () => {
  it('crea uno cuando hay tarjeta ACTIVE', async () => {
    const h = buildHarness({ challenge: null });

    const view = await h.service.ensureReturnChallenge({
      businessId: BIZ,
      customerId: CUST,
      retentionAssignmentId: 'assign-1',
      timezone: MVD,
      now: NOW,
    });

    expect(h.create).toHaveBeenCalledTimes(1);
    expect(view?.deadlineDayKey).toBe('2026-09-27');
  });

  it('SIN tarjeta de sellos activa no crea nada', async () => {
    // Prometer un sello sin dónde ponerlo sería mentir.
    const h = buildHarness({ challenge: null, goalActive: false });

    const view = await h.service.ensureReturnChallenge({
      businessId: BIZ,
      customerId: CUST,
      retentionAssignmentId: 'assign-1',
      timezone: MVD,
      now: NOW,
    });

    expect(view).toBeNull();
    expect(h.create).not.toHaveBeenCalled();
  });

  it('un segundo run reusa el desafío existente, no crea otro', async () => {
    const h = buildHarness();

    const view = await h.service.ensureReturnChallenge({
      businessId: BIZ,
      customerId: CUST,
      retentionAssignmentId: 'assign-1',
      timezone: MVD,
      now: NOW,
    });

    expect(h.create).not.toHaveBeenCalled();
    expect(view?.id).toBe('rc-1');
  });

  it('si otro proceso gana la carrera, devuelve el suyo', async () => {
    const h = buildHarness({ challenge: null });
    h.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    // Tras el choque, el findFirst ya encuentra el del otro proceso.
    h.prisma.returnChallenge.findFirst.mockResolvedValueOnce(null);
    h.prisma.returnChallenge.findFirst.mockResolvedValue({
      id: 'rc-otro',
      businessId: BIZ,
      expiresAt: new Date('2026-09-28T03:00:00Z'),
      business: { timezone: MVD },
    });

    const view = await h.service.ensureReturnChallenge({
      businessId: BIZ,
      customerId: CUST,
      retentionAssignmentId: 'assign-1',
      timezone: MVD,
      now: NOW,
    });

    expect(view?.id).toBe('rc-otro');
  });
});

describe('completeForVisit — completar y premiar son UNA transacción', () => {
  const visita = new Date('2026-09-24T18:00:00Z');

  it('vuelve a tiempo → COMPLETED y exactamente un sello', async () => {
    const h = buildHarness();

    const result = await h.service.completeForVisit({
      businessId: BIZ,
      customerId: CUST,
      visitOccurredAt: visita,
    });

    expect(result).toEqual({
      status: 'completed',
      challengeId: 'rc-1',
      bonusApplied: true,
    });
    expect(h.stamps).toHaveLength(1);
    expect(h.stamps[0]).toMatchObject({
      returnChallengeId: 'rc-1',
      rewardGoalId: 'goal-1',
      reasonCode: 'return_challenge_completed',
    });
    expect(h.row.status).toBe(ReturnChallengeStatus.COMPLETED);
    // `completedAt` es el momento de la VISITA, no el del cálculo.
    expect(h.row.completedAt).toEqual(visita);
  });

  it('toma el lock ANTES de releer la fila', async () => {
    const h = buildHarness();

    await h.service.completeForVisit({
      businessId: BIZ,
      customerId: CUST,
      visitOccurredAt: visita,
    });

    const lock = h.tx.$executeRaw.mock.invocationCallOrder[0];
    const read = h.tx.returnChallenge.findUnique.mock.invocationCallOrder[0];
    expect(lock).toBeLessThan(read);
  });

  it('el sello se crea ANTES de marcar COMPLETED', async () => {
    // Es lo que hace imposible un COMPLETED sin sello: si el create falla, el
    // update nunca corre y la transacción se revierte entera.
    const h = buildHarness();

    await h.service.completeForVisit({
      businessId: BIZ,
      customerId: CUST,
      visitOccurredAt: visita,
    });

    const stamp = h.tx.rewardGoalBonusStamp.create.mock.invocationCallOrder[0];
    const update = h.tx.returnChallenge.update.mock.invocationCallOrder[0];
    expect(stamp).toBeLessThan(update);
  });

  it('si falla el sello, el desafío sigue ACTIVE y no hay sello', async () => {
    const h = buildHarness({ stampFails: true });

    const result = await h.service.completeForVisit({
      businessId: BIZ,
      customerId: CUST,
      visitOccurredAt: visita,
    });

    expect(result).toEqual({ status: 'none' });
    expect(h.stamps).toHaveLength(0);
    // Nunca se marcó COMPLETED: el update ni siquiera se alcanzó.
    expect(h.row.status).toBe(ReturnChallengeStatus.ACTIVE);
  });

  it('un retry posterior al fallo sí completa', async () => {
    const h = buildHarness({ stampFails: true });
    await h.service.completeForVisit({
      businessId: BIZ,
      customerId: CUST,
      visitOccurredAt: visita,
    });

    // La base se recupera.
    h.tx.rewardGoalBonusStamp.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => {
        h.stamps.push(data);
        return Promise.resolve({ id: 'stamp-1' });
      },
    );

    const result = await h.service.completeForVisit({
      businessId: BIZ,
      customerId: CUST,
      visitOccurredAt: visita,
    });

    expect(result.status).toBe('completed');
    expect(h.stamps).toHaveLength(1);
  });

  it('dos completions CONCURRENTES otorgan un solo sello', async () => {
    const h = buildHarness();

    const [a, b] = await Promise.all([
      h.service.completeForVisit({
        businessId: BIZ,
        customerId: CUST,
        visitOccurredAt: visita,
      }),
      h.service.completeForVisit({
        businessId: BIZ,
        customerId: CUST,
        visitOccurredAt: visita,
      }),
    ]);

    expect(h.stamps).toHaveLength(1);
    const completados = [a, b].filter((r) => r.status === 'completed');
    expect(completados).toHaveLength(1);
  });

  it('reprocesar la misma visita no otorga un segundo sello', async () => {
    const h = buildHarness();

    await h.service.completeForVisit({
      businessId: BIZ,
      customerId: CUST,
      visitOccurredAt: visita,
    });
    const segundo = await h.service.completeForVisit({
      businessId: BIZ,
      customerId: CUST,
      visitOccurredAt: visita,
    });

    expect(segundo).toEqual({ status: 'none' });
    expect(h.stamps).toHaveLength(1);
  });

  it('sin desafío vivo no hace nada', async () => {
    const h = buildHarness({ challenge: null });

    expect(
      await h.service.completeForVisit({
        businessId: BIZ,
        customerId: CUST,
        visitOccurredAt: visita,
      }),
    ).toEqual({ status: 'none' });
    expect(h.stamps).toHaveLength(0);
  });
});

describe('completeForVisit — deadline y tarjeta cerrada', () => {
  it('volver DESPUÉS del plazo no otorga sello', async () => {
    const h = buildHarness();
    // Lunes 00:01 local — un minuto tarde.
    const tarde = new Date('2026-09-28T03:01:00Z');

    const result = await h.service.completeForVisit({
      businessId: BIZ,
      customerId: CUST,
      visitOccurredAt: tarde,
    });

    expect(result).toEqual({ status: 'expired' });
    expect(h.stamps).toHaveLength(0);
    expect(h.row.status).toBe(ReturnChallengeStatus.ACTIVE);
  });

  it('el deadline se revalida en runtime, sin esperar al sweep', async () => {
    // La fila sigue ACTIVE en la base (el barrido no corrió todavía) y aun
    // así no se otorga nada.
    const h = buildHarness({
      challenge: {
        status: ReturnChallengeStatus.ACTIVE,
        startsAt: new Date('2026-09-01T00:00:00Z'),
        expiresAt: new Date('2026-09-07T03:00:00Z'),
      },
    });

    const result = await h.service.completeForVisit({
      businessId: BIZ,
      customerId: CUST,
      visitOccurredAt: new Date('2026-09-24T18:00:00Z'),
    });

    expect(result.status).toBe('expired');
    expect(h.stamps).toHaveLength(0);
  });

  it('si la tarjeta prometida ya no está ACTIVE → CANCELLED, sin sello', async () => {
    const h = buildHarness({ goalActive: false });

    const result = await h.service.completeForVisit({
      businessId: BIZ,
      customerId: CUST,
      visitOccurredAt: new Date('2026-09-24T18:00:00Z'),
    });

    expect(result).toEqual({
      status: 'cancelled',
      reason: ReturnChallengeCancelReason.REWARD_GOAL_CLOSED,
    });
    expect(h.stamps).toHaveLength(0);
    expect(h.row.status).toBe(ReturnChallengeStatus.CANCELLED);
    expect(h.row.cancelReason).toBe(
      ReturnChallengeCancelReason.REWARD_GOAL_CLOSED,
    );
  });

  it('NUNCA reapunta el sello a una tarjeta distinta', async () => {
    const h = buildHarness({ goalActive: false });

    await h.service.completeForVisit({
      businessId: BIZ,
      customerId: CUST,
      visitOccurredAt: new Date('2026-09-24T18:00:00Z'),
    });

    // El goal se busca por el id SNAPSHOTEADO y por status ACTIVE — nunca
    // "la tarjeta activa que haya ahora".
    expect(h.goalFindFirst).toHaveBeenCalledWith({
      where: { id: 'goal-1', status: RewardGoalStatus.ACTIVE },
      select: { id: true, activatedAt: true, targetAdditionalVisits: true },
    });
    expect(h.stamps).toHaveLength(0);
  });
});

/**
 * `bonusApplied` — la visita de retorno y el bonus cruzando el target juntos.
 *
 * Escenario del pedido: tarjeta ACTIVE con target=6. Antes de esta visita el
 * progreso era N/6 (contando solo Visits — sin este bonus). La visita normal
 * ya está persistida (`visitsSinceActivation` la incluye), y el bonus del
 * desafío se agrega encima. La pregunta es: ¿la visita SOLA ya alcanzaba el
 * target, o hacía falta el bonus para completar (o acercarse a completar) el
 * progreso?
 */
describe('completeForVisit — bonusApplied cuando la visita y el bonus cruzan el target juntos', () => {
  const visita = new Date('2026-09-24T18:00:00Z');

  it('3/6: la visita sola llega a 4/6 — el bonus SÍ suma progreso real', async () => {
    // Antes de esta visita: 3. La visita normal ya está en la cuenta → 4.
    // 4 < 6, así que el bonus (→5) hace falta para seguir acercándose.
    const h = buildHarness({
      targetAdditionalVisits: 6,
      visitsSinceActivation: 4,
      existingBonusStamps: 0,
    });

    const result = await h.service.completeForVisit({
      businessId: BIZ,
      customerId: CUST,
      visitOccurredAt: visita,
    });

    expect(result).toEqual({
      status: 'completed',
      challengeId: 'rc-1',
      bonusApplied: true,
    });
    expect(h.stamps).toHaveLength(1);
    // La tarjeta queda en 5/6 — ni completa ni con recompensa: eso lo decide
    // `evaluateUnlock`, que corre después y suma visita+bonus en una lectura.
  });

  it('4/6: visita+bonus llegan a EXACTAMENTE 6/6 — una sola recompensa', async () => {
    // Antes: 4. Visita normal → 5. Bonus → 6 = target exacto.
    const h = buildHarness({
      targetAdditionalVisits: 6,
      visitsSinceActivation: 5,
      existingBonusStamps: 0,
    });

    const result = await h.service.completeForVisit({
      businessId: BIZ,
      customerId: CUST,
      visitOccurredAt: visita,
    });

    expect(result).toEqual({
      status: 'completed',
      challengeId: 'rc-1',
      bonusApplied: true,
    });
    expect(h.stamps).toHaveLength(1);
    // `completeForVisit` nunca desbloquea la tarjeta ni emite el premio —
    // eso es exclusivamente trabajo de `evaluateUnlock`, que se llama
    // DESPUÉS. Acá solo se verifica que el bonus se registra una única vez.
  });

  it('5/6: la visita SOLA ya llega a 6/6 — el bonus queda como excedente', async () => {
    // Antes: 5. La visita normal, sola, YA alcanza el target (→6). El bonus
    // es el punto de más: 5/6 → normal alcanza 6/6 → bonus lo lleva a 7/6.
    const h = buildHarness({
      targetAdditionalVisits: 6,
      visitsSinceActivation: 6,
      existingBonusStamps: 0,
    });

    const result = await h.service.completeForVisit({
      businessId: BIZ,
      customerId: CUST,
      visitOccurredAt: visita,
    });

    expect(result).toEqual({
      status: 'completed',
      challengeId: 'rc-1',
      bonusApplied: false,
    });
  });

  it('5/6 con excedente: el sello IGUAL se otorga — nunca se pierde el hecho', async () => {
    // `bonusApplied: false` es una señal para la UI, no una decisión de NO
    // crear el sello: el desafío se cumplió y el sello se registra siempre.
    const h = buildHarness({
      targetAdditionalVisits: 6,
      visitsSinceActivation: 6,
      existingBonusStamps: 0,
    });

    await h.service.completeForVisit({
      businessId: BIZ,
      customerId: CUST,
      visitOccurredAt: visita,
    });

    expect(h.stamps).toHaveLength(1);
    expect(h.stamps[0]).toMatchObject({
      returnChallengeId: 'rc-1',
      rewardGoalId: 'goal-1',
    });
  });

  it('5/6 con excedente: no crea una segunda recompensa ni una tarjeta nueva', async () => {
    // `completeForVisit` en sí mismo no emite nada — solo crea el sello y
    // marca el desafío COMPLETED. Emitir el premio y decidir si abrir una
    // tarjeta nueva es trabajo exclusivo de `evaluateUnlock`/`afterVisit`,
    // que ya está probado (en `checkin.service.spec.ts`) para NO llamar a
    // `maybeCreateGoal` cuando hay un unlock en la misma visita. Acá se
    // verifica el límite de responsabilidad: exactamente un sello, una vez.
    const h = buildHarness({
      targetAdditionalVisits: 6,
      visitsSinceActivation: 6,
      existingBonusStamps: 0,
    });

    await h.service.completeForVisit({
      businessId: BIZ,
      customerId: CUST,
      visitOccurredAt: visita,
    });
    // Un reintento (replay) sobre la misma visita no debe agregar un segundo.
    const segundo = await h.service.completeForVisit({
      businessId: BIZ,
      customerId: CUST,
      visitOccurredAt: visita,
    });

    expect(h.stamps).toHaveLength(1);
    expect(segundo).toEqual({ status: 'none' });
  });

  it('un excedente mayor (visita ya supera el target por varios puntos) sigue siendo bonusApplied: false', async () => {
    const h = buildHarness({
      targetAdditionalVisits: 6,
      visitsSinceActivation: 9,
      existingBonusStamps: 0,
    });

    const result = await h.service.completeForVisit({
      businessId: BIZ,
      customerId: CUST,
      visitOccurredAt: visita,
    });

    expect(result).toMatchObject({ bonusApplied: false });
  });

  it('cuenta bonus stamps previos, no solo visitas, al decidir si hizo falta', async () => {
    // 3 visitas + 3 bonus stamps de OTRO origen (p.ej. feedback) ya suman 6.
    // La visita de retorno normal no agrega nada nuevo a esa cuenta: el
    // bonus del challenge vuelve a ser excedente.
    const h = buildHarness({
      targetAdditionalVisits: 6,
      visitsSinceActivation: 3,
      existingBonusStamps: 3,
    });

    const result = await h.service.completeForVisit({
      businessId: BIZ,
      customerId: CUST,
      visitOccurredAt: visita,
    });

    expect(result).toMatchObject({ bonusApplied: false });
  });
});
