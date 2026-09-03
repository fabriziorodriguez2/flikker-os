import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  ReturnChallengeCancelReason,
  ReturnChallengeStatus,
  RewardGoalStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { localDayKey } from '../../common/utils/timezone.util';
import {
  isWithinWindow,
  resolveChallengeWindow,
} from './return-challenge-rules';

/** El desafío vivo de un cliente, tal como lo ve el read-model. */
export interface ReturnChallengeView {
  id: string;
  businessId: string;
  expiresAt: string;
  deadlineDayKey: string;
}

/**
 * Resultado de intentar completar un desafío con una visita.
 *
 * `bonusApplied` en `'completed'` distingue dos cosas que se ven idénticas
 * desde afuera pero no lo son: el desafío SIEMPRE se completa y SIEMPRE se
 * crea el `RewardGoalBonusStamp` (es un hecho real: el cliente volvió a
 * tiempo y el sello se otorgó, punto), pero a veces ese sello es
 * numéricamente inerte — la visita NORMAL, por sí sola, ya alcanzaba el
 * target de la tarjeta, y el bonus solo suma un excedente que se descarta.
 * En ese caso `bonusApplied` es `false`, y la UI no debe decir "ganaste +1
 * sello extra" — sería prometer un progreso que no existió.
 */
export type CompletionResult =
  | { status: 'none' }
  | { status: 'completed'; challengeId: string; bonusApplied: boolean }
  | { status: 'cancelled'; reason: ReturnChallengeCancelReason }
  | { status: 'expired' };

const BONUS_REASON_CODE = 'return_challenge_completed';

@Injectable()
export class ReturnChallengeService {
  private readonly logger = new Logger(ReturnChallengeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crea el desafío que acompaña a una decisión de reactivación.
   *
   * Idempotente por partida doble: el `@unique` en `retentionAssignmentId` y
   * el índice parcial `(business_id, customer_id) WHERE status = 'ACTIVE'`. Si
   * el job de Retention corre otra vez mañana, choca contra uno de los dos y
   * reusa el desafío que ya existe — nunca crea un segundo con otro deadline.
   *
   * Devuelve `null` cuando no corresponde crear ninguno: sin tarjeta de sellos
   * activa no hay dónde poner el premio, y prometerlo sería mentir.
   */
  async ensureReturnChallenge(params: {
    businessId: string;
    customerId: string;
    retentionAssignmentId: string;
    timezone: string;
    now?: Date;
  }): Promise<ReturnChallengeView | null> {
    const now = params.now ?? new Date();

    const existing = await this.findActive(
      params.businessId,
      params.customerId,
    );
    if (existing) return this.toView(existing);

    // El premio es un sello sobre una tarjeta concreta. Sin tarjeta ACTIVE no
    // hay desafío — es la regla de elegibilidad, no un detalle técnico.
    const goal = await this.prisma.customerRewardGoal.findFirst({
      where: {
        businessId: params.businessId,
        customerId: params.customerId,
        status: RewardGoalStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!goal) return null;

    const window = resolveChallengeWindow(params.timezone, now);

    try {
      const created = await this.prisma.returnChallenge.create({
        data: {
          businessId: params.businessId,
          customerId: params.customerId,
          retentionAssignmentId: params.retentionAssignmentId,
          rewardGoalId: goal.id,
          startsAt: window.startsAt,
          expiresAt: window.expiresAt,
        },
        select: CHALLENGE_SELECT,
      });
      return this.toView(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Otro run ganó la carrera. Se devuelve el suyo, no se crea otro.
        const raced = await this.findActive(
          params.businessId,
          params.customerId,
        );
        return raced ? this.toView(raced) : null;
      }
      throw error;
    }
  }

  /**
   * Intenta completar el desafío vivo del cliente con la visita que acaba de
   * ocurrir. **Se llama ANTES de `RewardGoalOrchestratorService.afterVisit`**
   * — ver el comentario de orden en `CheckinService.buildPersonalSpace`.
   *
   * Completar y premiar son UNA transacción, no dos pasos. COMPLETED
   * significa "volvió a tiempo Y el sello está otorgado": si la creación del
   * sello falla, la transacción entera se revierte, el desafío sigue ACTIVE y
   * el próximo intento lo vuelve a tomar. Nunca existe un COMPLETED sin sello.
   *
   * El lock por advisory serializa dos check-ins simultáneos del mismo
   * cliente: el segundo entra cuando el primero ya commiteó, ve el estado
   * COMPLETED y no hace nada. El `@unique` en
   * `RewardGoalBonusStamp.returnChallengeId` es la garantía de fondo.
   */
  async completeForVisit(params: {
    businessId: string;
    customerId: string;
    visitOccurredAt: Date;
  }): Promise<CompletionResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const challenge = await tx.returnChallenge.findFirst({
          where: {
            businessId: params.businessId,
            customerId: params.customerId,
            status: ReturnChallengeStatus.ACTIVE,
          },
          select: {
            id: true,
            rewardGoalId: true,
            startsAt: true,
            expiresAt: true,
          },
        });
        if (!challenge) return { status: 'none' } as const;

        // Se libera al commitear/abortar.
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`return-challenge:${challenge.id}`}))`,
        );

        // Releído DENTRO del lock: entre el findFirst y el lock, otro proceso
        // pudo haberlo completado.
        const fresh = await tx.returnChallenge.findUnique({
          where: { id: challenge.id },
          select: {
            id: true,
            status: true,
            rewardGoalId: true,
            startsAt: true,
            expiresAt: true,
          },
        });
        if (!fresh || fresh.status !== ReturnChallengeStatus.ACTIVE) {
          return { status: 'none' } as const;
        }

        // El deadline se revalida en runtime — no se depende de que el sweep
        // diario ya haya corrido.
        if (!isWithinWindow(fresh, params.visitOccurredAt)) {
          return { status: 'expired' } as const;
        }

        // La tarjeta prometida tiene que seguir viva. Si se desbloqueó,
        // canjeó, venció o se canceló, el sello NO se transfiere a otra: se
        // cancela el desafío con su motivo.
        const goal = await tx.customerRewardGoal.findFirst({
          where: {
            id: fresh.rewardGoalId,
            status: RewardGoalStatus.ACTIVE,
          },
          select: {
            id: true,
            activatedAt: true,
            targetAdditionalVisits: true,
          },
        });
        if (!goal) {
          await tx.returnChallenge.update({
            where: { id: fresh.id },
            data: {
              status: ReturnChallengeStatus.CANCELLED,
              cancelReason: ReturnChallengeCancelReason.REWARD_GOAL_CLOSED,
            },
          });
          return {
            status: 'cancelled',
            reason: ReturnChallengeCancelReason.REWARD_GOAL_CLOSED,
          } as const;
        }

        /**
         * ¿Este sello va a importar?
         *
         * `evaluateUnlock` corre DESPUÉS de esto y suma visitas + bonus stamps
         * en una sola lectura, así que acá no se puede saber si la tarjeta
         * queda UNLOCKED — pero sí se puede saber si la visita NORMAL, sola,
         * ya alcanza el target sin necesitar este bonus.
         *
         * `visitsSinceActivation` ya incluye la visita actual: `registerVisit`
         * la persistió antes de que `completeForVisit` corriera. Y como la
         * tarjeta sigue ACTIVE en este mismo instante, ese progreso previo
         * (sin el bonus) es necesariamente `< target` — si ya lo hubiera
         * alcanzado, `evaluateUnlock` la habría cerrado en una visita
         * anterior. Por eso alcanza con comparar una vez, acá.
         */
        const [existingBonusStamps, visitsSinceActivation] = await Promise.all([
          tx.rewardGoalBonusStamp.count({
            where: { rewardGoalId: goal.id },
          }),
          tx.visit.count({
            where: {
              businessId: params.businessId,
              customerId: params.customerId,
              occurredAt: { gt: goal.activatedAt },
            },
          }),
        ]);
        const progressWithoutThisBonus =
          existingBonusStamps + visitsSinceActivation;
        const bonusApplied =
          progressWithoutThisBonus < goal.targetAdditionalVisits;

        // El sello SIEMPRE se otorga — el cliente volvió a tiempo, eso pasó
        // de verdad — pero si `bonusApplied` es false, este punto queda
        // como excedente: la visita normal ya alcanzaba el target sin él. Se
        // crea igual (nunca se pierde el hecho de que el bonus se otorgó),
        // y es la transición de abajo, no esta fila, la que decide si la
        // tarjeta se desbloquea.
        //
        // El sello PRIMERO: si esto falla, el `update` de abajo nunca corre y
        // la transacción se revierte entera.
        await tx.rewardGoalBonusStamp.create({
          data: {
            businessId: params.businessId,
            customerId: params.customerId,
            rewardGoalId: goal.id,
            returnChallengeId: fresh.id,
            reasonCode: BONUS_REASON_CODE,
          },
        });

        await tx.returnChallenge.update({
          where: { id: fresh.id },
          data: {
            status: ReturnChallengeStatus.COMPLETED,
            // El momento de la VISITA, no el de este cálculo: es cuando el
            // cliente efectivamente volvió.
            completedAt: params.visitOccurredAt,
          },
        });

        return {
          status: 'completed',
          challengeId: fresh.id,
          bonusApplied,
        } as const;
      });
    } catch (error) {
      // Nunca se propaga: que falle el bonus no puede romper un check-in. El
      // desafío quedó ACTIVE (rollback), así que la próxima visita reintenta.
      this.logger.error(
        `No se pudo completar el desafío de ${params.customerId} en ${params.businessId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { status: 'none' };
    }
  }

  /** Lectura pura para Mi Flikker. Nunca completa ni otorga nada. */
  async currentView(
    businessId: string,
    customerId: string,
    now: Date = new Date(),
  ): Promise<ReturnChallengeView | null> {
    const challenge = await this.findActive(businessId, customerId);
    if (!challenge) return null;
    // Vencido pero todavía no barrido: no se muestra como si siguiera vivo.
    if (challenge.expiresAt.getTime() <= now.getTime()) return null;
    return this.toView(challenge);
  }

  /** Las de varios clientes, en una query — evita el N+1 de Mi Flikker. */
  async currentViewForCustomers(
    customerIds: string[],
    now: Date = new Date(),
  ): Promise<Map<string, ReturnChallengeView>> {
    const result = new Map<string, ReturnChallengeView>();
    if (customerIds.length === 0) return result;

    const rows = await this.prisma.returnChallenge.findMany({
      where: {
        customerId: { in: customerIds },
        status: ReturnChallengeStatus.ACTIVE,
        expiresAt: { gt: now },
      },
      select: { ...CHALLENGE_SELECT, customerId: true },
    });
    for (const row of rows) result.set(row.customerId, this.toView(row));
    return result;
  }

  private findActive(businessId: string, customerId: string) {
    return this.prisma.returnChallenge.findFirst({
      where: {
        businessId,
        customerId,
        status: ReturnChallengeStatus.ACTIVE,
      },
      select: CHALLENGE_SELECT,
    });
  }

  private toView(challenge: {
    id: string;
    businessId: string;
    expiresAt: Date;
    business: { timezone: string };
  }): ReturnChallengeView {
    return {
      id: challenge.id,
      businessId: challenge.businessId,
      expiresAt: challenge.expiresAt.toISOString(),
      // El domingo, no el lunes: `expiresAt` es exclusivo. Y se lee con el
      // reloj del NEGOCIO — restarle un milisegundo en UTC puede seguir
      // cayendo en lunes (Montevideo: lunes 00:00 local = lunes 03:00 UTC).
      deadlineDayKey: localDayKey(
        new Date(challenge.expiresAt.getTime() - 1),
        challenge.business.timezone,
      ),
    };
  }
}

const CHALLENGE_SELECT = {
  id: true,
  businessId: true,
  expiresAt: true,
  business: { select: { timezone: true } },
} satisfies Prisma.ReturnChallengeSelect;
