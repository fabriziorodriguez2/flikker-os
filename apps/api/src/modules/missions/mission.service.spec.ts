import { ConflictException } from '@nestjs/common';
import { MissionStatus } from '@prisma/client';
import { MissionService } from './mission.service';

const BIZ = 'biz-1';
const NOW = new Date('2026-10-05T12:00:00Z');

function buildHarness(
  mission: { status: MissionStatus; endsAt: Date } = {
    status: MissionStatus.PAUSED,
    endsAt: new Date('2026-12-01T03:00:00Z'),
  },
) {
  const prisma = {
    mission: {
      findFirst: jest.fn().mockResolvedValue({ id: 'mission-1', ...mission }),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    customerMission: { count: jest.fn().mockResolvedValue(0) },
  };
  const service = new MissionService(prisma as never);
  return { service, prisma };
}

describe('MissionService.setStatus — no se puede activar una misión vencida', () => {
  it('rechaza reanudar una PAUSED cuya ventana ya cerró', async () => {
    // El barrido diario ya las termina, pero entre el vencimiento y el
    // próximo barrido hay horas — y este es el único camino para entrar ahí.
    const h = buildHarness({
      status: MissionStatus.PAUSED,
      endsAt: new Date('2026-10-01T03:00:00Z'),
    });

    await expect(
      h.service.setStatus(BIZ, 'mission-1', MissionStatus.ACTIVE, NOW),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.prisma.mission.update).not.toHaveBeenCalled();
  });

  it('rechaza publicar un DRAFT que se quedó sin ventana', async () => {
    // Las fechas son inmutables: ese borrador no podría contar nada nunca.
    const h = buildHarness({
      status: MissionStatus.DRAFT,
      endsAt: new Date('2026-10-01T03:00:00Z'),
    });

    await expect(
      h.service.setStatus(BIZ, 'mission-1', MissionStatus.ACTIVE, NOW),
    ).rejects.toThrow(/período de esta misión ya terminó/i);
  });

  it('permite reanudar una PAUSED con la ventana todavía abierta', async () => {
    const h = buildHarness();

    await expect(
      h.service.setStatus(BIZ, 'mission-1', MissionStatus.ACTIVE, NOW),
    ).resolves.toEqual({ ok: true });
    expect(h.prisma.mission.update).toHaveBeenCalledWith({
      where: { id: 'mission-1' },
      data: { status: MissionStatus.ACTIVE },
    });
  });

  it('pausar o terminar una vencida sigue permitido', async () => {
    // El guard es solo contra ACTIVAR: cerrar algo vencido es correcto.
    const h = buildHarness({
      status: MissionStatus.ACTIVE,
      endsAt: new Date('2026-10-01T03:00:00Z'),
    });

    await expect(
      h.service.setStatus(BIZ, 'mission-1', MissionStatus.ENDED, NOW),
    ).resolves.toEqual({ ok: true });
  });

  it('una misión ENDED sigue siendo terminal', async () => {
    const h = buildHarness({
      status: MissionStatus.ENDED,
      endsAt: new Date('2026-12-01T03:00:00Z'),
    });

    await expect(
      h.service.setStatus(BIZ, 'mission-1', MissionStatus.ACTIVE, NOW),
    ).rejects.toThrow(/ya terminó/i);
  });
});

describe('MissionService.remove — nunca destruye historial', () => {
  it('con participantes se archiva en vez de borrarse', async () => {
    const h = buildHarness({
      status: MissionStatus.ACTIVE,
      endsAt: new Date('2026-12-01T03:00:00Z'),
    });
    h.prisma.customerMission.count.mockResolvedValue(4);

    const result = await h.service.remove(BIZ, 'mission-1');

    expect(result).toEqual({ ok: true, ended: true });
    expect(h.prisma.mission.delete).not.toHaveBeenCalled();
    expect(h.prisma.mission.update).toHaveBeenCalledWith({
      where: { id: 'mission-1' },
      data: { status: MissionStatus.ENDED },
    });
  });

  it('sin participantes sí se borra', async () => {
    const h = buildHarness();

    const result = await h.service.remove(BIZ, 'mission-1');

    expect(result).toEqual({ ok: true, ended: false });
    expect(h.prisma.mission.delete).toHaveBeenCalledWith({
      where: { id: 'mission-1' },
    });
  });
});
