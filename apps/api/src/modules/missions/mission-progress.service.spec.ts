import {
  BenefitIssuanceSource,
  CustomerMissionStatus,
  MissionStatus,
  Prisma,
} from '@prisma/client';
import { MissionProgressService } from './mission-progress.service';

const BIZ = 'biz-1';
const CUST = 'cust-1';
const NOW = new Date('2026-09-15T15:00:00Z');

function liveMission(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mission-1',
    businessId: BIZ,
    name: 'Vení 3 veces este mes',
    description: null,
    targetVisits: 3,
    startsAt: new Date('2026-09-01T03:00:00Z'),
    endsAt: new Date('2026-10-01T03:00:00Z'),
    status: MissionStatus.ACTIVE,
    rewardBenefitId: 'benefit-1',
    rewardHiddenUntilComplete: false,
    rewardBenefit: { title: '1 café gratis' },
    business: { timezone: 'America/Montevideo' },
    ...overrides,
  };
}

interface HarnessOptions {
  missions?: ReturnType<typeof liveMission>[];
  visits?: number;
  /** Estado de la participación que devuelve `findUnique`. */
  participationStatus?: CustomerMissionStatus;
  /** Cuántas filas afecta el updateMany — 0 simula perder la carrera. */
  claimCount?: number;
  existingCode?: string | null;
  /** FK ya escrito: el premio ya se emitió antes. */
  existingParticipationId?: string | null;
  /** Simula que el `complete()` de otro caller ya movió el estado. */
  statusAfterComplete?: CustomerMissionStatus;
}

/**
 * Estado compartido que simula la fila `customer_missions` en la base. El
 * harness lo muta como lo haría Postgres, para que los tests de concurrencia
 * midan algo real y no una secuencia de mocks fija.
 */
function buildHarness(options: HarnessOptions = {}) {
  const missions = options.missions ?? [liveMission()];
  const mission = missions[0] ?? liveMission();

  const row = {
    id: 'part-1',
    customerId: CUST,
    businessId: BIZ,
    status: options.participationStatus ?? CustomerMissionStatus.ACTIVE,
    rewardParticipationId: options.existingParticipationId ?? null,
    rewardParticipation: options.existingCode
      ? { redemptionCode: options.existingCode }
      : null,
    mission: { id: mission.id, rewardBenefitId: mission.rewardBenefitId },
  };

  const customerMissionUpdateMany = jest.fn().mockImplementation(() => {
    const claimed =
      options.claimCount !== undefined
        ? options.claimCount
        : row.status === CustomerMissionStatus.ACTIVE
          ? 1
          : 0;
    if (claimed === 1) row.status = CustomerMissionStatus.COMPLETED;
    else if (options.statusAfterComplete) {
      row.status = options.statusAfterComplete;
    }
    return Promise.resolve({ count: claimed });
  });

  const customerMissionUpdate = jest
    .fn()
    .mockImplementation(
      ({ data }: { data: { rewardParticipationId: string } }) => {
        row.rewardParticipationId = data.rewardParticipationId;
        row.rewardParticipation = { redemptionCode: 'ABC123' };
        return Promise.resolve({});
      },
    );

  const customerMissionCreate = jest.fn().mockResolvedValue({});

  const customerMissionFindUnique = jest
    .fn()
    .mockImplementation(() => Promise.resolve({ ...row }));

  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    customerMission: {
      findUnique: customerMissionFindUnique,
      update: customerMissionUpdate,
    },
  };

  const prisma = {
    mission: { findMany: jest.fn().mockResolvedValue(missions) },
    visit: { count: jest.fn().mockResolvedValue(options.visits ?? 0) },
    // La transacción del `ensureRewardIssued` — se ejecuta en serie, igual
    // que el lock por advisory hace en la base.
    $transaction: jest
      .fn()
      .mockImplementation((fn: (client: unknown) => Promise<unknown>) =>
        serialize(() => fn(tx)),
      ),
    customerMission: {
      create: customerMissionCreate,
      updateMany: customerMissionUpdateMany,
      update: customerMissionUpdate,
      findUnique: customerMissionFindUnique,
      findMany: jest.fn().mockResolvedValue(
        missions.map((m) => ({
          status: options.participationStatus ?? CustomerMissionStatus.ACTIVE,
          mission: m,
          rewardParticipation: options.existingCode
            ? { redemptionCode: options.existingCode }
            : null,
        })),
      ),
    },
  };

  let issued = 0;
  const benefits = {
    issueBenefit: jest.fn().mockImplementation(() => {
      issued += 1;
      return Promise.resolve({
        id: `part-benefit-${issued}`,
        redemptionCode: 'ABC123',
      });
    }),
  };

  const service = new MissionProgressService(
    prisma as never,
    benefits as never,
  );

  return {
    service,
    prisma,
    benefits,
    row,
    tx,
    customerMissionCreate,
    customerMissionUpdateMany,
    customerMissionUpdate,
  };
}

/**
 * Cola de una sola vía: reproduce lo que hace `pg_advisory_xact_lock` — dos
 * transacciones sobre la misma participación no corren entrelazadas, la
 * segunda espera a que la primera commitee.
 */
let lockChain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = lockChain.then(fn, fn);
  lockChain = next.catch(() => undefined);
  return next;
}

beforeEach(() => {
  lockChain = Promise.resolve();
});

describe('MissionProgressService.afterVisit — progreso', () => {
  it('sin misiones vivas no hace absolutamente nada', async () => {
    const h = buildHarness({ missions: [] });

    const views = await h.service.afterVisit(BIZ, CUST, NOW);

    expect(views).toEqual([]);
    expect(h.customerMissionCreate).not.toHaveBeenCalled();
    expect(h.prisma.visit.count).not.toHaveBeenCalled();
  });

  it('la primera visita inscribe al cliente y muestra 1 de 3', async () => {
    const h = buildHarness({ visits: 1 });

    const [view] = await h.service.afterVisit(BIZ, CUST, NOW);

    expect(h.customerMissionCreate).toHaveBeenCalledWith({
      data: { missionId: 'mission-1', customerId: CUST, businessId: BIZ },
    });
    expect(view.progress).toMatchObject({
      current: 1,
      target: 3,
      remaining: 2,
      complete: false,
    });
    expect(h.benefits.issueBenefit).not.toHaveBeenCalled();
  });

  it('cuenta visitas dentro de la ventana, con el fin EXCLUIDO', async () => {
    const h = buildHarness({ visits: 2 });

    await h.service.afterVisit(BIZ, CUST, NOW);

    expect(h.prisma.visit.count).toHaveBeenCalledWith({
      where: {
        businessId: BIZ,
        customerId: CUST,
        occurredAt: {
          gte: new Date('2026-09-01T03:00:00Z'),
          lt: new Date('2026-10-01T03:00:00Z'),
        },
      },
    });
  });

  it('re-inscribir al mismo cliente no crea una segunda participación', async () => {
    const h = buildHarness({ visits: 1 });
    h.customerMissionCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    // El P2002 del @@unique se traga en silencio: es la señal de "ya estaba".
    await expect(h.service.afterVisit(BIZ, CUST, NOW)).resolves.toHaveLength(1);
  });

  it('un error que NO es el índice único sí explota', async () => {
    const h = buildHarness({ visits: 1 });
    h.customerMissionCreate.mockRejectedValue(new Error('db caída'));

    await expect(h.service.afterVisit(BIZ, CUST, NOW)).rejects.toThrow(
      'db caída',
    );
  });
});

describe('MissionProgressService.afterVisit — completar y premiar', () => {
  it('al alcanzar el objetivo hace la transición guardada, y solo eso', async () => {
    const h = buildHarness({ visits: 3 });

    const [view] = await h.service.afterVisit(BIZ, CUST, NOW);

    expect(h.customerMissionUpdateMany).toHaveBeenCalledWith({
      where: { id: 'part-1', status: CustomerMissionStatus.ACTIVE },
      data: {
        status: CustomerMissionStatus.COMPLETED,
        completedAt: NOW,
      },
    });
    expect(view.status).toBe(CustomerMissionStatus.COMPLETED);
  });

  it('la emisión queda atada a la participación', async () => {
    const h = buildHarness({ visits: 3 });

    await h.service.afterVisit(BIZ, CUST, NOW);

    expect(h.customerMissionUpdate).toHaveBeenCalledWith({
      where: { id: 'part-1' },
      data: { rewardParticipationId: 'part-benefit-1' },
    });
  });

  it('una participación YA completada y premiada no vuelve a emitir', async () => {
    const h = buildHarness({
      visits: 5,
      participationStatus: CustomerMissionStatus.COMPLETED,
      existingParticipationId: 'part-benefit-1',
      existingCode: 'ABC123',
    });

    const [view] = await h.service.afterVisit(BIZ, CUST, NOW);

    expect(h.benefits.issueBenefit).not.toHaveBeenCalled();
    expect(view.rewardCode).toBe('ABC123');
  });

  it('si otro caller gana la transición, este NO emite un segundo premio', async () => {
    const h = buildHarness({
      visits: 3,
      claimCount: 0,
      participationStatus: CustomerMissionStatus.COMPLETED,
      existingParticipationId: 'part-benefit-1',
      existingCode: 'YA-EMITIDO',
    });

    const [view] = await h.service.afterVisit(BIZ, CUST, NOW);

    expect(h.benefits.issueBenefit).not.toHaveBeenCalled();
    expect(view.rewardCode).toBe('YA-EMITIDO');
  });

  it('reprocesar la misma visita no suma ni emite de nuevo', async () => {
    // El progreso se DERIVA: correr afterVisit dos veces con las mismas
    // visitas da el mismo número. No hay contador que incrementar.
    const h = buildHarness({ visits: 2 });

    const [primera] = await h.service.afterVisit(BIZ, CUST, NOW);
    const [segunda] = await h.service.afterVisit(BIZ, CUST, NOW);

    expect(primera.progress).toEqual(segunda.progress);
    expect(h.benefits.issueBenefit).not.toHaveBeenCalled();
  });
});

/**
 * Recuperación del premio — el bug que motivó separar (A) completar de (B)
 * emitir. Antes la emisión vivía DENTRO de la transición guardada, así que
 * una falla ahí dejaba la participación COMPLETED con premio en null y
 * ningún camino podía volver a intentarlo: `evaluate` cortaba antes de
 * llegar, y `currentView` nunca emite.
 */
describe('MissionProgressService.ensureRewardIssued', () => {
  it('completion exitoso emite exactamente un premio', async () => {
    const h = buildHarness({ visits: 3 });

    const [view] = await h.service.afterVisit(BIZ, CUST, NOW);

    expect(h.benefits.issueBenefit).toHaveBeenCalledTimes(1);
    expect(h.benefits.issueBenefit).toHaveBeenCalledWith(
      {
        businessId: BIZ,
        benefitId: 'benefit-1',
        customerId: CUST,
        source: BenefitIssuanceSource.MISSION,
      },
      // Dentro de la transacción, para que una falla no deje una emisión a
      // medio crear.
      h.tx,
    );
    expect(view.rewardCode).toBe('ABC123');
    expect(h.row.rewardParticipationId).toBe('part-benefit-1');
  });

  it('si la emisión falla, la misión queda COMPLETED y el premio en null', async () => {
    const h = buildHarness({ visits: 3 });
    h.benefits.issueBenefit.mockRejectedValue(new Error('proveedor caído'));

    const [view] = await h.service.afterVisit(BIZ, CUST, NOW);

    // El cliente hizo las visitas: eso no se revierte.
    expect(h.row.status).toBe(CustomerMissionStatus.COMPLETED);
    expect(view.status).toBe(CustomerMissionStatus.COMPLETED);
    expect(h.row.rewardParticipationId).toBeNull();
    expect(view.rewardCode).toBeNull();
  });

  it('un retry POSTERIOR sí emite el premio que había quedado pendiente', async () => {
    const h = buildHarness({ visits: 3 });
    h.benefits.issueBenefit.mockRejectedValueOnce(new Error('proveedor caído'));

    // Primera visita: completa pero la emisión falla.
    const [fallida] = await h.service.afterVisit(BIZ, CUST, NOW);
    expect(fallida.rewardCode).toBeNull();
    expect(h.row.rewardParticipationId).toBeNull();

    // El cliente vuelve. La participación ya está COMPLETED, así que la
    // transición no se toca — pero la emisión se reintenta.
    const [recuperada] = await h.service.afterVisit(BIZ, CUST, NOW);

    expect(recuperada.rewardCode).toBe('ABC123');
    expect(h.row.rewardParticipationId).toBe('part-benefit-1');
    // Una sola emisión efectiva, pese a los dos intentos.
    expect(h.benefits.issueBenefit).toHaveBeenCalledTimes(2);
  });

  it('se puede llamar directamente, como haría un job de reconciliación', async () => {
    const h = buildHarness({
      participationStatus: CustomerMissionStatus.COMPLETED,
    });

    const code = await h.service.ensureRewardIssued('part-1');

    expect(code).toBe('ABC123');
    expect(h.row.rewardParticipationId).toBe('part-benefit-1');
  });

  it('dos retries CONCURRENTES crean exactamente una BenefitParticipation', async () => {
    const h = buildHarness({
      participationStatus: CustomerMissionStatus.COMPLETED,
    });

    const [a, b] = await Promise.all([
      h.service.ensureRewardIssued('part-1'),
      h.service.ensureRewardIssued('part-1'),
    ]);

    // El segundo entra cuando el primero ya escribió el FK, lo lee y no
    // emite. Ojo con lo que este test prueba y lo que no: la serialización la
    // aporta el harness (imitando a `pg_advisory_xact_lock`), así que lo que
    // se verifica acá es que el CÓDIGO se comporta bien cuando la base
    // serializa — no que la base serialice. Eso último lo garantizan los dos
    // tests de abajo, que sí miran el lock real.
    expect(h.benefits.issueBenefit).toHaveBeenCalledTimes(1);
    expect(a).toBe('ABC123');
    expect(b).toBe('ABC123');
  });

  it('toma el lock ANTES de leer la fila', async () => {
    const h = buildHarness({
      participationStatus: CustomerMissionStatus.COMPLETED,
    });

    await h.service.ensureRewardIssued('part-1');

    // El orden es la garantía entera: leer antes de tomar el lock reabriría
    // exactamente la ventana de carrera que el lock existe para cerrar.
    expect(h.tx.$executeRaw).toHaveBeenCalled();
    const lockOrder = h.tx.$executeRaw.mock.invocationCallOrder[0];
    const readOrder =
      h.tx.customerMission.findUnique.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(readOrder);
  });

  it('el lock se toma por participación, no global', async () => {
    // Un lock global serializaría la emisión de todo el sistema; uno mal
    // scopeado (por negocio, por cliente) dejaría escapar el caso que
    // importa. La clave tiene que incluir el id de ESTA participación.
    const h = buildHarness({
      participationStatus: CustomerMissionStatus.COMPLETED,
    });

    await h.service.ensureRewardIssued('part-1');

    const [sql] = h.tx.$executeRaw.mock.calls[0] as [
      { strings: string[]; values: unknown[] },
    ];
    expect(sql.strings.join('')).toContain('pg_advisory_xact_lock');
    expect(sql.values).toContain('mission-reward:part-1');
  });

  it('la emisión corre dentro de la MISMA transacción que el lock', async () => {
    // Emitir fuera de la transacción dejaría la BenefitParticipation viva
    // aunque el resto se revierta: un premio huérfano que nadie reclama.
    const h = buildHarness({
      participationStatus: CustomerMissionStatus.COMPLETED,
    });

    await h.service.ensureRewardIssued('part-1');

    expect(h.benefits.issueBenefit.mock.calls[0][1]).toBe(h.tx);
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('un retry sobre un premio YA emitido es un no-op', async () => {
    const h = buildHarness({
      participationStatus: CustomerMissionStatus.COMPLETED,
      existingParticipationId: 'part-benefit-1',
      existingCode: 'ABC123',
    });

    const code = await h.service.ensureRewardIssued('part-1');

    expect(code).toBe('ABC123');
    expect(h.benefits.issueBenefit).not.toHaveBeenCalled();
    expect(h.customerMissionUpdate).not.toHaveBeenCalled();
  });

  it('no emite nada si la participación todavía está ACTIVE', async () => {
    const h = buildHarness({
      participationStatus: CustomerMissionStatus.ACTIVE,
    });

    expect(await h.service.ensureRewardIssued('part-1')).toBeNull();
    expect(h.benefits.issueBenefit).not.toHaveBeenCalled();
  });

  it('una misión SIN premio se completa normal y no emite nada', async () => {
    const h = buildHarness({
      visits: 3,
      missions: [liveMission({ rewardBenefitId: null, rewardBenefit: null })],
    });

    const [view] = await h.service.afterVisit(BIZ, CUST, NOW);

    expect(h.row.status).toBe(CustomerMissionStatus.COMPLETED);
    expect(view.status).toBe(CustomerMissionStatus.COMPLETED);
    expect(view.rewardCode).toBeNull();
    expect(view.rewardName).toBeNull();
    expect(h.benefits.issueBenefit).not.toHaveBeenCalled();
  });

  it('una participación inexistente no rompe nada', async () => {
    const h = buildHarness();
    h.tx.customerMission.findUnique.mockResolvedValue(null);

    expect(await h.service.ensureRewardIssued('no-existe')).toBeNull();
    expect(h.benefits.issueBenefit).not.toHaveBeenCalled();
  });
});

describe('MissionProgressService — misiones que no cuentan', () => {
  it('solo busca misiones ACTIVE con la ventana abierta', async () => {
    const h = buildHarness();

    await h.service.afterVisit(BIZ, CUST, NOW);

    expect(h.prisma.mission.findMany).toHaveBeenCalledWith({
      where: {
        businessId: BIZ,
        status: MissionStatus.ACTIVE,
        startsAt: { lte: NOW },
        endsAt: { gt: NOW },
      },
      select: expect.any(Object),
    });
  });

  it('una misión vencida no completa aunque sobren visitas', async () => {
    // La query ya la excluiría, pero `evaluate` lo revalida: entre el
    // findMany y el evaluate puede haber pasado el corte.
    const vencida = liveMission({
      endsAt: new Date('2026-09-10T03:00:00Z'),
    });
    const h = buildHarness({ visits: 9, missions: [vencida] });

    const [view] = await h.service.afterVisit(BIZ, CUST, NOW);

    expect(h.customerMissionUpdateMany).not.toHaveBeenCalled();
    expect(h.benefits.issueBenefit).not.toHaveBeenCalled();
    expect(view.status).toBe(CustomerMissionStatus.ACTIVE);
  });
});

describe('MissionProgressService.currentView — lectura pura', () => {
  it('NUNCA completa ni emite, aunque el progreso alcance', async () => {
    const h = buildHarness({ visits: 3 });

    const [view] = await h.service.currentView(BIZ, CUST, NOW);

    expect(view.progress.complete).toBe(true);
    // Abrir Mi Flikker no es un check-in.
    expect(h.customerMissionUpdateMany).not.toHaveBeenCalled();
    expect(h.benefits.issueBenefit).not.toHaveBeenCalled();
    expect(h.customerMissionCreate).not.toHaveBeenCalled();
  });

  it('esconde el premio secreto mientras no esté completa', async () => {
    const h = buildHarness({
      visits: 1,
      missions: [liveMission({ rewardHiddenUntilComplete: true })],
    });

    const [view] = await h.service.currentView(BIZ, CUST, NOW);

    expect(view.rewardName).toBeNull();
    expect(view.rewardHidden).toBe(true);
    expect(view.progress.remaining).toBe(2);
  });

  it('revela el premio una vez completada', async () => {
    const h = buildHarness({
      visits: 3,
      missions: [liveMission({ rewardHiddenUntilComplete: true })],
      participationStatus: CustomerMissionStatus.COMPLETED,
    });

    const [view] = await h.service.currentView(BIZ, CUST, NOW);

    expect(view.rewardName).toBe('1 café gratis');
    expect(view.rewardHidden).toBe(false);
  });

  it('no muestra misiones vencidas sin completar — nada de tarjetas muertas', async () => {
    const h = buildHarness({
      visits: 1,
      missions: [liveMission({ endsAt: new Date('2026-09-10T03:00:00Z') })],
    });

    const views = await h.service.currentView(BIZ, CUST, NOW);

    expect(views).toEqual([]);
  });

  it('sí muestra una completada aunque la ventana haya cerrado — el premio sigue vivo', async () => {
    const h = buildHarness({
      visits: 3,
      missions: [liveMission({ endsAt: new Date('2026-09-10T03:00:00Z') })],
      participationStatus: CustomerMissionStatus.COMPLETED,
      existingCode: 'ABC123',
    });

    const views = await h.service.currentView(BIZ, CUST, NOW);

    expect(views).toHaveLength(1);
    expect(views[0].rewardCode).toBe('ABC123');
  });

  it('resuelve la fecha límite con el reloj del NEGOCIO, no en UTC', async () => {
    // `endsAt` = 1 de octubre 00:00 en Montevideo (03:00 UTC). El último día
    // para venir es el 30 de setiembre. Leído en UTC daría el 1 de octubre:
    // un día de más, justo el error que este campo existe para evitar.
    const h = buildHarness({ visits: 1 });

    const [view] = await h.service.currentView(BIZ, CUST, NOW);

    expect(view.timezone).toBe('America/Montevideo');
    expect(view.lastDayKey).toBe('2026-09-30');
    expect(view.endsAt).toBe('2026-10-01T03:00:00.000Z');
  });

  it.each([
    ['America/Montevideo', '2026-10-01T03:00:00.000Z'],
    ['Asia/Tokyo', '2026-09-30T15:00:00.000Z'],
    ['Pacific/Kiritimati', '2026-09-30T10:00:00.000Z'],
  ])(
    'una misión de septiembre en %s termina el 30/09 de SU calendario',
    async (timezone, endsAtIso) => {
      // Cada negocio tiene su propio `endsAt` — el instante en que termina su
      // 30 de septiembre local. Los tres son instantes UTC distintos y los
      // tres tienen que mostrar el mismo día.
      const h = buildHarness({
        visits: 1,
        missions: [
          liveMission({
            endsAt: new Date(endsAtIso),
            business: { timezone },
          }),
        ],
      });

      const [view] = await h.service.currentView(BIZ, CUST, NOW);

      expect(view.lastDayKey).toBe('2026-09-30');
      expect(view.timezone).toBe(timezone);
    },
  );

  it('no muestra misiones EXPIRED', async () => {
    const h = buildHarness({
      visits: 1,
      participationStatus: CustomerMissionStatus.EXPIRED,
    });

    expect(await h.service.currentView(BIZ, CUST, NOW)).toEqual([]);
  });

  it('una misión PAUSED deja de mostrarse, sin borrar la participación', async () => {
    const h = buildHarness({
      visits: 1,
      missions: [liveMission({ status: MissionStatus.PAUSED })],
    });

    expect(await h.service.currentView(BIZ, CUST, NOW)).toEqual([]);
  });
});
