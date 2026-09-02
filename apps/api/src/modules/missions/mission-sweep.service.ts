import { Injectable, Logger } from '@nestjs/common';
import { CustomerMissionStatus, MissionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MissionProgressService } from './mission-progress.service';

export interface MissionReconcileResult {
  /** Participaciones que quedaron sin premio y se intentaron. */
  pending: number;
  issued: number;
  /** Siguen sin premio: se reintentan en el próximo barrido. */
  failed: number;
}

export interface MissionExpiryResult {
  missionsEnded: number;
  participationsExpired: number;
}

/**
 * Barrido diario de misiones — la red de seguridad detrás del disparador
 * primario, que es la visita (`MissionProgressService.afterVisit`).
 *
 * Hace dos cosas independientes, y ninguna de las dos duplica lógica que ya
 * exista en otro lado.
 */
@Injectable()
export class MissionSweepService {
  private readonly logger = new Logger(MissionSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly progress: MissionProgressService,
  ) {}

  /**
   * (1) Premios pendientes.
   *
   * Cierra el único agujero que quedaba: alguien completa una misión, la
   * emisión falla en ese momento, y esa persona NUNCA vuelve a visitar el
   * local. Sin este barrido su premio se quedaría esperando una visita que no
   * va a pasar.
   *
   * No reimplementa la emisión: llama al mismo `ensureRewardIssued` que usa
   * el check-in, con su lock y su idempotencia. Por eso es seguro que este
   * barrido corra en paralelo con una visita real.
   */
  async reconcilePendingRewards(): Promise<MissionReconcileResult> {
    const pending = await this.prisma.customerMission.findMany({
      where: {
        status: CustomerMissionStatus.COMPLETED,
        rewardParticipationId: null,
        mission: { rewardBenefitId: { not: null } },
      },
      select: { id: true },
    });

    let issued = 0;
    for (const participation of pending) {
      // `ensureRewardIssued` nunca tira — devuelve null si no pudo. Aun así
      // el try/catch existe: un fallo inesperado en una participación no
      // puede dejar a las demás sin su premio.
      try {
        const code = await this.progress.ensureRewardIssued(participation.id);
        if (code) issued += 1;
      } catch (error) {
        this.logger.error(
          `Reconciliación falló para la participación ${participation.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const failed = pending.length - issued;
    if (pending.length > 0) {
      this.logger.log(
        `Premios de misión pendientes=${pending.length} emitidos=${issued} sin_emitir=${failed}`,
      );
    }
    // Los que fallaron quedan con `rewardParticipationId` en null, así que el
    // barrido de mañana los vuelve a tomar. No hay estado que limpiar.
    return { pending: pending.length, issued, failed };
  }

  /**
   * (2) Expiración semántica.
   *
   * `endsAt` ya es un instante UTC concreto, resuelto una sola vez con el
   * timezone del negocio cuando se creó la misión. Acá se comparan instantes
   * y NUNCA se vuelve a interpretar un día ni una zona horaria: reinterpretar
   * el calendario en cada barrido es exactamente cómo una misión terminaría
   * un día antes o después según desde dónde corra el job.
   */
  async expireOverdue(now: Date = new Date()): Promise<MissionExpiryResult> {
    // Las participaciones primero: una misión que ya pasó su fin cierra a su
    // gente aunque el dueño la haya dejado en PAUSED en vez de ACTIVE.
    //
    // `status` en el `where` es lo que garantiza que COMPLETED nunca se toque:
    // no es un filtro de conveniencia, es la protección. Alguien que completó
    // su misión el último día no puede quedar EXPIRED por un barrido posterior.
    const expired = await this.prisma.customerMission.updateMany({
      where: {
        status: CustomerMissionStatus.ACTIVE,
        mission: { endsAt: { lte: now } },
      },
      data: { status: CustomerMissionStatus.EXPIRED },
    });

    // ACTIVE **y PAUSED**: una misión pausada cuya ventana ya cerró tampoco
    // vuelve. Dejarla PAUSED la mostraba como reanudable — y como
    // `PAUSED → ACTIVE` es una transición legal, el dueño podía "reanudar"
    // algo que `isMissionLive` ya rechaza por fecha: figuraba Activa sin
    // contar una sola visita. Además, sus participaciones sí pasaban a
    // EXPIRED (la query de arriba filtra por `mission.endsAt`, no por el
    // estado de la misión), así que el par quedaba incoherente.
    //
    // DRAFT NO entra acá, a propósito: nunca se publicó, así que no hay nada
    // que "terminar" y su fila sigue siendo un borrador que el dueño ve y
    // puede descartar cuando quiera. Lo que sí se le impide es activarla con
    // la ventana ya cerrada — eso lo corta `MissionService.setStatus`, porque
    // las fechas son inmutables y esa misión no podría contar nada nunca.
    const ended = await this.prisma.mission.updateMany({
      where: {
        status: { in: [MissionStatus.ACTIVE, MissionStatus.PAUSED] },
        endsAt: { lte: now },
      },
      data: { status: MissionStatus.ENDED },
    });

    if (ended.count > 0 || expired.count > 0) {
      this.logger.log(
        `Misiones terminadas=${ended.count} participaciones expiradas=${expired.count}`,
      );
    }
    return {
      missionsEnded: ended.count,
      participationsExpired: expired.count,
    };
  }
}
