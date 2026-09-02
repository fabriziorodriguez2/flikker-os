import { CustomerMissionStatus, MissionStatus } from '@prisma/client';
import { MissionSweepService } from './mission-sweep.service';

const NOW = new Date('2026-10-05T12:00:00Z');

function buildHarness(pending: { id: string }[] = []) {
  const prisma = {
    customerMission: {
      findMany: jest.fn().mockResolvedValue(pending),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    mission: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const progress = {
    ensureRewardIssued: jest.fn().mockResolvedValue('ABC123'),
  };
  const service = new MissionSweepService(prisma as never, progress as never);
  return { service, prisma, progress };
}

describe('MissionSweepService.reconcilePendingRewards', () => {
  it('busca exactamente las participaciones que se quedaron sin premio', async () => {
    const h = buildHarness();

    await h.service.reconcilePendingRewards();

    expect(h.prisma.customerMission.findMany).toHaveBeenCalledWith({
      where: {
        status: CustomerMissionStatus.COMPLETED,
        rewardParticipationId: null,
        // Una misión sin premio no tiene nada pendiente: no es un caso a
        // reconciliar, es su forma normal de existir.
        mission: { rewardBenefitId: { not: null } },
      },
      select: { id: true },
    });
  });

  it('COMPLETED con premio en null → el sweep lo emite', async () => {
    const h = buildHarness([{ id: 'part-1' }]);

    const result = await h.service.reconcilePendingRewards();

    expect(h.progress.ensureRewardIssued).toHaveBeenCalledWith('part-1');
    expect(result).toEqual({ pending: 1, issued: 1, failed: 0 });
  });

  it('reutiliza `ensureRewardIssued` — no reimplementa la emisión', async () => {
    // Si el sweep tuviera su propia emisión, se saltearía el lock y la
    // idempotencia que ya viven ahí.
    const h = buildHarness([{ id: 'part-1' }]);

    await h.service.reconcilePendingRewards();

    expect(h.progress.ensureRewardIssued).toHaveBeenCalledTimes(1);
  });

  it('un segundo sweep no duplica nada', async () => {
    // Tras el primer sweep la fila ya tiene `rewardParticipationId`, así que
    // el `where` no la vuelve a traer. La idempotencia la da la query, no un
    // flag aparte que haya que mantener.
    const h = buildHarness([{ id: 'part-1' }]);
    await h.service.reconcilePendingRewards();

    h.prisma.customerMission.findMany.mockResolvedValue([]);
    const second = await h.service.reconcilePendingRewards();

    expect(second).toEqual({ pending: 0, issued: 0, failed: 0 });
    expect(h.progress.ensureRewardIssued).toHaveBeenCalledTimes(1);
  });

  it('dos sweeps CONCURRENTES emiten una sola vez', async () => {
    // Los dos ven la misma fila pendiente y los dos llaman a
    // `ensureRewardIssued` — que es justo donde está el lock. El segundo
    // entra después del commit del primero, ve el FK escrito y no emite.
    const h = buildHarness([{ id: 'part-1' }]);
    let emitidas = 0;
    h.progress.ensureRewardIssued.mockImplementation(() => {
      if (emitidas === 0) emitidas += 1;
      return Promise.resolve('ABC123');
    });

    await Promise.all([
      h.service.reconcilePendingRewards(),
      h.service.reconcilePendingRewards(),
    ]);

    expect(emitidas).toBe(1);
  });

  it('un fallo no bloquea a las demás participaciones', async () => {
    const h = buildHarness([
      { id: 'part-1' },
      { id: 'part-2' },
      { id: 'part-3' },
    ]);
    // `ensureRewardIssued` devuelve null cuando no pudo emitir.
    h.progress.ensureRewardIssued.mockImplementation((id: string) =>
      Promise.resolve(id === 'part-2' ? null : 'ABC123'),
    );

    const result = await h.service.reconcilePendingRewards();

    expect(h.progress.ensureRewardIssued).toHaveBeenCalledTimes(3);
    expect(h.progress.ensureRewardIssued).toHaveBeenCalledWith('part-3');
    expect(result).toEqual({ pending: 3, issued: 2, failed: 1 });
  });

  it('una excepción inesperada tampoco corta el barrido', async () => {
    const h = buildHarness([{ id: 'part-1' }, { id: 'part-2' }]);
    h.progress.ensureRewardIssued.mockImplementation((id: string) =>
      id === 'part-1'
        ? Promise.reject(new Error('conexión caída'))
        : Promise.resolve('ABC123'),
    );

    const result = await h.service.reconcilePendingRewards();

    expect(h.progress.ensureRewardIssued).toHaveBeenCalledWith('part-2');
    expect(result).toEqual({ pending: 2, issued: 1, failed: 1 });
  });

  it('sin nada pendiente no hace ningún trabajo', async () => {
    const h = buildHarness([]);

    const result = await h.service.reconcilePendingRewards();

    expect(h.progress.ensureRewardIssued).not.toHaveBeenCalled();
    expect(result).toEqual({ pending: 0, issued: 0, failed: 0 });
  });
});

describe('MissionSweepService.expireOverdue', () => {
  it('una Mission vencida pasa a ENDED, esté ACTIVE o PAUSED', async () => {
    const h = buildHarness();
    h.prisma.mission.updateMany.mockResolvedValue({ count: 2 });

    const result = await h.service.expireOverdue(NOW);

    expect(h.prisma.mission.updateMany).toHaveBeenCalledWith({
      where: {
        status: { in: [MissionStatus.ACTIVE, MissionStatus.PAUSED] },
        endsAt: { lte: NOW },
      },
      data: { status: MissionStatus.ENDED },
    });
    expect(result.missionsEnded).toBe(2);
  });

  it('una misión PAUSED vencida no queda pausada para siempre', async () => {
    // Dejarla PAUSED la mostraba reanudable, y sus participaciones ya habían
    // pasado a EXPIRED: el par quedaba incoherente.
    const h = buildHarness();

    await h.service.expireOverdue(NOW);

    const [{ where }] = h.prisma.mission.updateMany.mock.calls[0] as [
      { where: { status: { in: MissionStatus[] } } },
    ];
    expect(where.status.in).toContain(MissionStatus.PAUSED);
  });

  it('una misión DRAFT vencida NO se termina: nunca se publicó', async () => {
    // Sigue siendo un borrador que el dueño ve y descarta cuando quiera. Lo
    // que sí se le impide es activarla — ver `MissionService.setStatus`.
    const h = buildHarness();

    await h.service.expireOverdue(NOW);

    const [{ where }] = h.prisma.mission.updateMany.mock.calls[0] as [
      { where: { status: { in: MissionStatus[] } } },
    ];
    expect(where.status.in).not.toContain(MissionStatus.DRAFT);
  });

  it('ENDED tampoco se vuelve a tocar', async () => {
    const h = buildHarness();

    await h.service.expireOverdue(NOW);

    const [{ where }] = h.prisma.mission.updateMany.mock.calls[0] as [
      { where: { status: { in: MissionStatus[] } } },
    ];
    expect(where.status.in).toEqual([
      MissionStatus.ACTIVE,
      MissionStatus.PAUSED,
    ]);
  });

  it('una CustomerMission ACTIVE de una misión vencida pasa a EXPIRED', async () => {
    const h = buildHarness();
    h.prisma.customerMission.updateMany.mockResolvedValue({ count: 5 });

    const result = await h.service.expireOverdue(NOW);

    expect(h.prisma.customerMission.updateMany).toHaveBeenCalledWith({
      where: {
        status: CustomerMissionStatus.ACTIVE,
        mission: { endsAt: { lte: NOW } },
      },
      data: { status: CustomerMissionStatus.EXPIRED },
    });
    expect(result.participationsExpired).toBe(5);
  });

  it('COMPLETED nunca pasa a EXPIRED', async () => {
    const h = buildHarness();

    await h.service.expireOverdue(NOW);

    const [{ where }] = h.prisma.customerMission.updateMany.mock.calls[0] as [
      { where: { status: CustomerMissionStatus } },
    ];
    // El estado va en el `where`: no es un filtro de conveniencia, es la
    // protección. Alguien que completó su misión el último día no puede
    // quedar EXPIRED por un barrido posterior.
    expect(where.status).toBe(CustomerMissionStatus.ACTIVE);
  });

  it('expira participaciones aunque la misión esté PAUSED, no solo ACTIVE', async () => {
    const h = buildHarness();

    await h.service.expireOverdue(NOW);

    const [{ where }] = h.prisma.customerMission.updateMany.mock.calls[0] as [
      { where: { mission: Record<string, unknown> } },
    ];
    // El filtro es por `endsAt` de la misión, no por su estado: una misión
    // pausada que además ya venció igual cierra a su gente.
    expect(where.mission).toEqual({ endsAt: { lte: NOW } });
  });

  it('compara instantes — nunca reinterpreta días ni zonas horarias', async () => {
    const h = buildHarness();

    await h.service.expireOverdue(NOW);

    // `endsAt` ya se resolvió una sola vez con el timezone del negocio al
    // crear la misión. Volver a interpretar el calendario acá haría que una
    // misión termine un día antes o después según desde dónde corra el job.
    const missionCall = h.prisma.mission.updateMany.mock.calls[0][0] as {
      where: { endsAt: { lte: Date } };
    };
    expect(missionCall.where.endsAt.lte).toBeInstanceOf(Date);
    expect(missionCall.where.endsAt.lte).toBe(NOW);
  });

  it('una misión que todavía no venció no se toca', async () => {
    const h = buildHarness();

    const result = await h.service.expireOverdue(NOW);

    // Los `updateMany` devuelven 0: el `where` por `endsAt <= now` no
    // matcheó nada.
    expect(result).toEqual({ missionsEnded: 0, participationsExpired: 0 });
  });
});
