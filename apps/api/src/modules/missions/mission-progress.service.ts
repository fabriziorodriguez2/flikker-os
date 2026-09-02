import { Injectable, Logger } from '@nestjs/common';
import {
  BenefitIssuanceSource,
  CustomerMissionStatus,
  MissionStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { localDayKey } from '../../common/utils/timezone.util';
import { BenefitsRepository } from '../benefits/benefits.repository';
import {
  computeMissionProgress,
  isMissionLive,
  visibleRewardName,
  type MissionProgress,
} from './mission-rules';

/** Lo que ve el cliente de UNA misión suya. */
export interface CustomerMissionView {
  missionId: string;
  name: string;
  description: string | null;
  status: CustomerMissionStatus;
  progress: MissionProgress;
  endsAt: string;
  /** Timezone del negocio — con qué reloj se lee `endsAt`. */
  timezone: string;
  /**
   * El último día en que todavía se puede venir, ya resuelto en el timezone
   * del negocio ("2026-09-30"). Se calcula en el backend a propósito: el
   * cliente no tiene por qué saber que `endsAt` es exclusivo, ni volver a
   * hacer aritmética de zonas horarias para restarle un día.
   */
  lastDayKey: string;
  /** `null` cuando no hay premio, o cuando está oculto y todavía no completó. */
  rewardName: string | null;
  /** True mientras el premio existe pero se mantiene en secreto. */
  rewardHidden: boolean;
  /** Código de canje, solo una vez emitido. */
  rewardCode: string | null;
}

const MISSION_SELECT = {
  id: true,
  businessId: true,
  name: true,
  description: true,
  targetVisits: true,
  startsAt: true,
  endsAt: true,
  status: true,
  rewardBenefitId: true,
  rewardHiddenUntilComplete: true,
  rewardBenefit: { select: { title: true } },
  // La fecha límite se muestra en el timezone del NEGOCIO, no en el del
  // dispositivo: "termina el 30 de setiembre" tiene que querer decir el 30
  // según el local, aunque el cliente esté de viaje del otro lado del mundo.
  business: { select: { timezone: true } },
} satisfies Prisma.MissionSelect;

type MissionRow = Prisma.MissionGetPayload<{ select: typeof MISSION_SELECT }>;

/**
 * El motor de misiones — y deliberadamente el más chico posible.
 *
 * Dos garantías, las dos apoyadas en la base de datos y no en el orden de las
 * llamadas:
 *
 *  1. **El progreso no se puede contar dos veces**, porque no se cuenta: se
 *     deriva de `Visit` en cada lectura. Una visita reprocesada no tiene
 *     ningún contador que incrementar. Es la misma decisión que ya toma
 *     `RewardGoalUnlockService` con los sellos.
 *
 *  2. **El premio no se puede emitir dos veces**, y tampoco puede perderse.
 *     Completar y premiar son dos pasos separados a propósito:
 *
 *       (A) `complete()` — la transición guardada ACTIVE→COMPLETED, que
 *           ocurre exactamente una vez.
 *       (B) `ensureRewardIssued()` — garantiza la emisión, y se puede llamar
 *           tantas veces como haga falta.
 *
 *     Estuvieron juntos y era un bug: si la emisión fallaba justo en el
 *     momento de completar, la fila quedaba COMPLETED con el premio en null y
 *     nada podía volver a intentarlo, porque la transición ya no se podía
 *     volver a ganar. Separados, (B) es reintentable desde la próxima visita
 *     o desde un job, y su lock por advisory —no el `@unique`, que no sirve
 *     cuando el valor es NULL— es lo que impide dos emisiones concurrentes.
 *
 * No emite sellos, no crea beneficios internos, no manda mensajes y no toca
 * Retention V2. El premio es un `Benefit` real del catálogo del dueño,
 * entregado por el mismo `issueBenefit` que usan Promociones y el check-in.
 */
@Injectable()
export class MissionProgressService {
  private readonly logger = new Logger(MissionProgressService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly benefits: BenefitsRepository,
  ) {}

  /**
   * Se llama después de registrar una Visit real. Inscribe al cliente en toda
   * misión viva en la que todavía no esté, y evalúa si alguna se completó.
   *
   * Nunca crea visitas ni progreso: solo mira lo que ya pasó.
   */
  async afterVisit(
    businessId: string,
    customerId: string,
    now: Date = new Date(),
  ): Promise<CustomerMissionView[]> {
    const missions = await this.findLiveMissions(businessId, now);
    if (missions.length === 0) return [];

    await Promise.all(
      missions.map((mission) => this.enroll(mission, customerId)),
    );

    const views: CustomerMissionView[] = [];
    for (const mission of missions) {
      views.push(await this.evaluate(mission, customerId, now));
    }
    return views;
  }

  /**
   * Lectura pura: nunca inscribe, nunca completa, nunca emite. Es lo que usan
   * Mi Flikker y la pantalla de check-in — abrir una página no puede otorgar
   * un premio, del mismo modo que `currentView` nunca desbloquea una tarjeta.
   */
  async currentView(
    businessId: string,
    customerId: string,
    now: Date = new Date(),
  ): Promise<CustomerMissionView[]> {
    const participations = await this.prisma.customerMission.findMany({
      where: { businessId, customerId },
      select: {
        status: true,
        mission: { select: MISSION_SELECT },
        rewardParticipation: { select: { redemptionCode: true } },
      },
      orderBy: { enrolledAt: 'desc' },
    });

    const visible = participations.filter((p) =>
      this.isWorthShowing(p.status, p.mission, now),
    );

    return Promise.all(
      visible.map(async (p) => {
        const visits = await this.countVisits(p.mission, customerId);
        return this.toView(
          p.mission,
          p.status,
          computeMissionProgress(visits, p.mission.targetVisits),
          p.rewardParticipation?.redemptionCode ?? null,
        );
      }),
    );
  }

  /** Misiones ACTIVE cuya ventana está abierta ahora. */
  private findLiveMissions(businessId: string, now: Date) {
    return this.prisma.mission.findMany({
      where: {
        businessId,
        status: MissionStatus.ACTIVE,
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      select: MISSION_SELECT,
    });
  }

  /**
   * Idempotente por el `@@unique([missionId, customerId])`: un segundo intento
   * choca contra el índice y se ignora, en vez de crear una segunda
   * participación. Mismo patrón que `RewardGoalEngineService.createGoal`.
   */
  private async enroll(mission: MissionRow, customerId: string) {
    try {
      await this.prisma.customerMission.create({
        data: {
          missionId: mission.id,
          customerId,
          businessId: mission.businessId,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }
      throw error;
    }
  }

  /**
   * Cuenta las visitas válidas dentro de la ventana. Ventana medio-abierta:
   * `occurredAt >= startsAt` y `occurredAt < endsAt`.
   *
   * No se define acá qué es una visita válida: lo que `registerVisit` aceptó
   * (su dedupe por horas mínimas, su tope diario, su anti-replay de presencia)
   * es exactamente lo que cuenta. Una visita rechazada por dedupe nunca llegó
   * a la tabla, así que no puede sumar.
   */
  private countVisits(mission: MissionRow, customerId: string) {
    return this.prisma.visit.count({
      where: {
        businessId: mission.businessId,
        customerId,
        occurredAt: { gte: mission.startsAt, lt: mission.endsAt },
      },
    });
  }

  private countedProgress(mission: MissionRow, visits: number) {
    return computeMissionProgress(visits, mission.targetVisits);
  }

  /**
   * Evalúa UNA misión para UN cliente y, si corresponde, la completa y emite
   * el premio. Es el único camino por el que una `CustomerMission` pasa a
   * COMPLETED.
   */
  private async evaluate(
    mission: MissionRow,
    customerId: string,
    now: Date,
  ): Promise<CustomerMissionView> {
    const visits = await this.countVisits(mission, customerId);
    const progress = this.countedProgress(mission, visits);

    const participation = await this.prisma.customerMission.findUnique({
      where: {
        missionId_customerId: { missionId: mission.id, customerId },
      },
      select: {
        id: true,
        status: true,
        rewardParticipation: { select: { redemptionCode: true } },
      },
    });

    if (!participation) {
      // Solo si `enroll` falló por algo que no fue el índice único.
      return this.toView(mission, CustomerMissionStatus.ACTIVE, progress, null);
    }

    if (
      participation.status !== CustomerMissionStatus.ACTIVE ||
      !progress.complete ||
      !isMissionLive(mission, now)
    ) {
      // Esta rama es TAMBIÉN el camino de recuperación: una participación que
      // quedó COMPLETED sin premio (porque la emisión falló en su momento)
      // vuelve a intentarlo acá, en la próxima visita del cliente. Antes esta
      // rama solo leía y devolvía, y por eso ese premio no se emitía nunca.
      const code = await this.ensureRewardIssued(participation.id);
      return this.toView(mission, participation.status, progress, code);
    }

    await this.complete(participation.id, now);
    const code = await this.ensureRewardIssued(participation.id);
    return this.toView(
      mission,
      CustomerMissionStatus.COMPLETED,
      progress,
      code,
    );
  }

  /**
   * (A) COMPLETION — la transición guardada, y NADA más.
   *
   * El `status` va en el `where`, no en una lectura previa: de dos check-ins
   * simultáneos del mismo cliente, solo uno afecta una fila. Ocurre exactamente
   * una vez en la vida de una participación.
   *
   * Deliberadamente NO emite el premio. Antes lo hacía, y eso ataba la
   * entrega a la única oportunidad de ganar esta carrera: si la emisión
   * fallaba justo ahí, la fila quedaba COMPLETED con premio en null y ningún
   * intento posterior podía volver a pasar por acá. Emitir es (B), abajo.
   */
  private async complete(participationId: string, now: Date): Promise<void> {
    await this.prisma.customerMission.updateMany({
      where: { id: participationId, status: CustomerMissionStatus.ACTIVE },
      data: { status: CustomerMissionStatus.COMPLETED, completedAt: now },
    });
  }

  /**
   * (B) EMISIÓN — garantiza que una participación COMPLETED tenga su premio.
   *
   * Idempotente y segura de llamar cuantas veces haga falta: justo después de
   * completar, en la próxima visita del cliente si la primera vez falló, o
   * desde un job de reconciliación futuro. Devuelve el código de canje, o
   * `null` si no hay nada que emitir.
   *
   * **Por qué un lock y no solo el `@unique` de `rewardParticipationId`:** ese
   * índice protege contra dos escrituras del FK, pero `NULL` no colisiona con
   * `NULL` en Postgres. Dos intentos concurrentes leerían los dos
   * `rewardParticipationId: null`, los dos llamarían a `issueBenefit` y
   * crearían DOS `BenefitParticipation`; recién al escribir el FK fallaría uno
   * — con el beneficio duplicado ya emitido y huérfano. El lock por advisory
   * (el mismo mecanismo que `VisitsRepository.registerVisit`) serializa el
   * par leer-emitir-escribir, así que el segundo entra cuando el primero ya
   * commiteó, ve el FK escrito y no emite nada.
   *
   * Todo corre en una transacción: si `issueBenefit` falla, no queda ninguna
   * emisión a medio crear, y el próximo intento arranca de cero.
   */
  async ensureRewardIssued(customerMissionId: string): Promise<string | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Se libera solo al commitear/abortar la transacción.
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`mission-reward:${customerMissionId}`}))`,
        );

        // Releído DENTRO del lock: lo que se haya visto antes de entrar acá
        // ya puede estar viejo.
        const participation = await tx.customerMission.findUnique({
          where: { id: customerMissionId },
          select: {
            id: true,
            customerId: true,
            businessId: true,
            status: true,
            rewardParticipationId: true,
            rewardParticipation: { select: { redemptionCode: true } },
            mission: { select: { id: true, rewardBenefitId: true } },
          },
        });

        if (!participation) return null;

        // Ya emitido: no-op. Es el caso normal de un segundo intento.
        if (participation.rewardParticipationId) {
          return participation.rewardParticipation?.redemptionCode ?? null;
        }

        // Todavía no se lo ganó, o la misión no promete ningún premio. Las
        // dos cosas son estados válidos, no errores.
        if (participation.status !== CustomerMissionStatus.COMPLETED) {
          return null;
        }
        if (!participation.mission.rewardBenefitId) return null;

        const issued = await this.benefits.issueBenefit(
          {
            businessId: participation.businessId,
            benefitId: participation.mission.rewardBenefitId,
            customerId: participation.customerId,
            source: BenefitIssuanceSource.MISSION,
          },
          tx,
        );
        await tx.customerMission.update({
          where: { id: participation.id },
          data: { rewardParticipationId: issued.id },
        });
        return issued.redemptionCode;
      });
    } catch (error) {
      // La misión sigue COMPLETED — el cliente hizo las visitas y eso no se
      // revierte. Lo único que falta es la emisión, y como
      // `rewardParticipationId` sigue en null, el próximo llamado a este
      // mismo método la reintenta. Nunca se propaga: que falle la entrega de
      // un premio no puede romper el check-in.
      this.logger.error(
        `No se pudo emitir el premio de la participación ${customerMissionId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /**
   * No mostrar estados vacíos falsos: una misión cuya ventana ya cerró y que
   * el cliente no completó no tiene por qué seguir ocupando lugar.
   */
  private isWorthShowing(
    status: CustomerMissionStatus,
    mission: MissionRow,
    now: Date,
  ): boolean {
    if (status === CustomerMissionStatus.COMPLETED) return true;
    if (status === CustomerMissionStatus.EXPIRED) return false;
    return (
      mission.status === MissionStatus.ACTIVE &&
      now.getTime() < mission.endsAt.getTime()
    );
  }

  private toView(
    mission: MissionRow,
    status: CustomerMissionStatus,
    progress: MissionProgress,
    rewardCode: string | null,
  ): CustomerMissionView {
    const complete =
      progress.complete || status === CustomerMissionStatus.COMPLETED;
    return {
      missionId: mission.id,
      name: mission.name,
      description: mission.description,
      status,
      progress,
      endsAt: mission.endsAt.toISOString(),
      timezone: mission.business.timezone,
      // `endsAt` es exclusivo (medianoche del día siguiente), así que el
      // último día real para venir es el anterior. Se resta un milisegundo y
      // se lee ese instante con el reloj del negocio.
      lastDayKey: localDayKey(
        new Date(mission.endsAt.getTime() - 1),
        mission.business.timezone,
      ),
      rewardName: visibleRewardName(mission, complete),
      rewardHidden:
        Boolean(mission.rewardBenefitId) &&
        mission.rewardHiddenUntilComplete &&
        !complete,
      rewardCode,
    };
  }
}
