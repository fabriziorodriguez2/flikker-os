import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomerMissionStatus,
  MissionPeriodPreset,
  MissionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MissionPeriodError,
  resolveMissionWindow,
  MAX_TARGET_VISITS,
  MIN_TARGET_VISITS,
  type MissionWindow,
} from './mission-period';
import { canTransition, periodLabel } from './mission-rules';

export interface CreateMissionInput {
  name: string;
  description?: string | null;
  targetVisits: number;
  periodPreset: MissionPeriodPreset;
  periodDays?: number | null;
  startsAt?: Date;
  endsAt?: Date;
  rewardBenefitId?: string | null;
  rewardHiddenUntilComplete?: boolean;
  /** Crear ya publicada. Por defecto sí: el dueño creó una misión para usarla. */
  activate?: boolean;
}

export interface UpdateMissionInput {
  name?: string;
  description?: string | null;
  rewardHiddenUntilComplete?: boolean;
}

/** Lo que ve el dueño de una misión en Programa. */
export interface MissionAdminView {
  id: string;
  name: string;
  description: string | null;
  targetVisits: number;
  periodLabel: string;
  startsAt: string;
  endsAt: string;
  status: MissionStatus;
  rewardBenefitId: string | null;
  rewardName: string | null;
  rewardHiddenUntilComplete: boolean;
  participantCount: number;
  completedCount: number;
  /** Falso apenas hay una participación — ver `MISSION_LOCKED_FIELDS`. */
  rulesEditable: boolean;
}

/**
 * Administración de misiones (Programa → Misiones).
 *
 * Todo scopeado por `businessId` en el `where`, nunca por un id suelto: un id
 * de otro negocio simplemente no matchea y devuelve 404, igual que el resto
 * del panel.
 */
@Injectable()
export class MissionService {
  constructor(private readonly prisma: PrismaService) {}

  async list(businessId: string): Promise<MissionAdminView[]> {
    const missions = await this.prisma.mission.findMany({
      where: { businessId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        description: true,
        targetVisits: true,
        periodPreset: true,
        periodDays: true,
        startsAt: true,
        endsAt: true,
        status: true,
        rewardBenefitId: true,
        rewardHiddenUntilComplete: true,
        rewardBenefit: { select: { title: true } },
        _count: { select: { participants: true } },
      },
    });

    const completedCounts = await this.prisma.customerMission.groupBy({
      by: ['missionId'],
      where: {
        businessId,
        status: CustomerMissionStatus.COMPLETED,
      },
      _count: { _all: true },
    });
    const completedByMission = new Map(
      completedCounts.map((row) => [row.missionId, row._count._all]),
    );

    return missions.map((mission) => ({
      id: mission.id,
      name: mission.name,
      description: mission.description,
      targetVisits: mission.targetVisits,
      periodLabel: periodLabel(mission.periodPreset, mission.periodDays),
      startsAt: mission.startsAt.toISOString(),
      endsAt: mission.endsAt.toISOString(),
      status: mission.status,
      rewardBenefitId: mission.rewardBenefitId,
      // Para el dueño el premio NUNCA está oculto: el secreto es hacia el
      // cliente, no hacia quien lo configuró.
      rewardName: mission.rewardBenefit?.title ?? null,
      rewardHiddenUntilComplete: mission.rewardHiddenUntilComplete,
      participantCount: mission._count.participants,
      completedCount: completedByMission.get(mission.id) ?? 0,
      rulesEditable: mission._count.participants === 0,
    }));
  }

  async create(
    businessId: string,
    input: CreateMissionInput,
    now: Date = new Date(),
  ): Promise<{ id: string }> {
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('La misión necesita un nombre');
    }
    if (
      !Number.isInteger(input.targetVisits) ||
      input.targetVisits < MIN_TARGET_VISITS ||
      input.targetVisits > MAX_TARGET_VISITS
    ) {
      throw new BadRequestException(
        `El objetivo tiene que ser un número entre ${MIN_TARGET_VISITS} y ${MAX_TARGET_VISITS}`,
      );
    }

    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    if (!business) throw new NotFoundException('Business not found');

    // El premio tiene que ser un beneficio REAL de ESTE negocio, y nunca una
    // fila interna (los carriers que emite el motor de sellos no son
    // beneficios que el dueño pueda ofrecer).
    if (input.rewardBenefitId) {
      const benefit = await this.prisma.benefit.findFirst({
        where: {
          id: input.rewardBenefitId,
          businessId,
          isInternalCarrier: false,
        },
        select: { id: true },
      });
      if (!benefit) {
        throw new BadRequestException('Ese beneficio no existe en tu catálogo');
      }
    }

    let window: MissionWindow;
    try {
      window = resolveMissionWindow(
        input.periodPreset,
        business.timezone,
        now,
        {
          periodDays: input.periodDays,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        },
      );
    } catch (error) {
      if (error instanceof MissionPeriodError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const mission = await this.prisma.mission.create({
      data: {
        businessId,
        name,
        description: input.description?.trim() || null,
        targetVisits: input.targetVisits,
        periodPreset: input.periodPreset,
        periodDays:
          input.periodPreset === MissionPeriodPreset.NEXT_N_DAYS
            ? (input.periodDays ?? null)
            : null,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        rewardBenefitId: input.rewardBenefitId ?? null,
        rewardHiddenUntilComplete: Boolean(input.rewardHiddenUntilComplete),
        status:
          input.activate === false ? MissionStatus.DRAFT : MissionStatus.ACTIVE,
      },
      select: { id: true },
    });

    return mission;
  }

  /**
   * Solo nombre, descripción y visibilidad del premio.
   *
   * `targetVisits`, las fechas y el premio NO se pueden editar acá — ni
   * siquiera sin participantes, para que exista un solo camino. Cambiarlos
   * después de que alguien empezó a jugar le movería la meta a mitad del
   * partido; ver `MISSION_LOCKED_FIELDS`.
   */
  async update(
    businessId: string,
    missionId: string,
    input: UpdateMissionInput,
  ): Promise<{ ok: true }> {
    await this.requireMission(businessId, missionId);

    const name = input.name?.trim();
    if (input.name !== undefined && !name) {
      throw new BadRequestException('La misión necesita un nombre');
    }

    await this.prisma.mission.update({
      where: { id: missionId },
      data: {
        ...(name ? { name } : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() || null }
          : {}),
        ...(input.rewardHiddenUntilComplete !== undefined
          ? { rewardHiddenUntilComplete: input.rewardHiddenUntilComplete }
          : {}),
      },
    });
    return { ok: true };
  }

  async setStatus(
    businessId: string,
    missionId: string,
    next: MissionStatus,
    now: Date = new Date(),
  ): Promise<{ ok: true }> {
    const mission = await this.requireMission(businessId, missionId);
    if (mission.status === next) return { ok: true };
    if (!canTransition(mission.status, next)) {
      throw new ConflictException(
        mission.status === MissionStatus.ENDED
          ? 'Esta misión ya terminó. Creá una nueva para volver a ofrecerla.'
          : 'Ese cambio de estado no es válido',
      );
    }

    // Activar una misión cuya ventana ya cerró la dejaría figurando como
    // Activa sin contar una sola visita: las fechas son inmutables, así que
    // no hay forma de que vuelva a servir. El barrido diario ya termina las
    // ACTIVE/PAUSED vencidas, pero entre el vencimiento y el próximo barrido
    // hay horas — y este es el único camino por el que alguien podría entrar
    // ahí. Aplica también a un borrador que se quedó sin ventana.
    if (
      next === MissionStatus.ACTIVE &&
      mission.endsAt.getTime() <= now.getTime()
    ) {
      throw new ConflictException(
        'El período de esta misión ya terminó. Creá una nueva con fechas vigentes.',
      );
    }

    await this.prisma.mission.update({
      where: { id: missionId },
      data: { status: next },
    });
    return { ok: true };
  }

  /**
   * "Eliminar" desde el panel. Mismo principio que Beneficios: si ya hay
   * historial, se archiva en vez de borrarse — borrar arrastraría por cascade
   * las participaciones y, con ellas, la prueba de que alguien completó algo.
   */
  async remove(
    businessId: string,
    missionId: string,
  ): Promise<{ ok: true; ended: boolean }> {
    const mission = await this.requireMission(businessId, missionId);
    const participants = await this.prisma.customerMission.count({
      where: { missionId },
    });

    if (participants > 0) {
      if (mission.status !== MissionStatus.ENDED) {
        await this.prisma.mission.update({
          where: { id: missionId },
          data: { status: MissionStatus.ENDED },
        });
      }
      return { ok: true, ended: true };
    }

    await this.prisma.mission.delete({ where: { id: missionId } });
    return { ok: true, ended: false };
  }

  private async requireMission(businessId: string, missionId: string) {
    const mission = await this.prisma.mission.findFirst({
      where: { id: missionId, businessId },
      select: { id: true, status: true, endsAt: true },
    });
    if (!mission) throw new NotFoundException('Mission not found');
    return mission;
  }
}
