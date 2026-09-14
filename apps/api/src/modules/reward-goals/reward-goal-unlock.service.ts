import { Injectable, Logger } from '@nestjs/common';
import { RewardGoalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DECISION_CODES,
  RetentionDecisionLogService,
} from '../retention-v2/retention-decision-log.service';
import { RewardGoalIssuerService } from './reward-goal-issuer.service';
import { RewardGoalUnlockNotificationService } from './reward-goal-unlock-notification.service';
import { RewardGoalEngineService } from './reward-goal-engine.service';
import { resolveCustomerSegment } from './resolve-customer-segment';

export type UnlockResult =
  | { status: 'no_active_goal' }
  | {
      status: 'in_progress';
      goalId: string;
      progressVisits: number;
      visitProgress: number;
      bonusStamps: number;
      targetAdditionalVisits: number;
      incentiveName: string;
    }
  | {
      status: 'unlocked';
      goalId: string;
      incentiveName: string;
      code: string;
      expiresAt: Date | null;
    }
  | { status: 'already_processed' };

/**
 * Fase E §11/§12/§13 — the only place an ACTIVE goal ever becomes UNLOCKED.
 *
 * "Which Visit counts" (§13): reuses `Visit` as the only source of truth for
 * REAL visits, counting every visit strictly after `activatedAt` — never
 * `startingVisitCount` arithmetic, which would need to stay in sync with a
 * second number. No new visit-validity rules are introduced: whatever
 * `VisitsRepository.registerVisit` already accepted (its own dedup, its own
 * verification types) is exactly what counts here too.
 *
 * Feedback bonus stamps (§9 pilot ask): a SEPARATE, additive count from
 * `RewardGoalBonusStamp` — never a fake `Visit`, never merged into the Visit
 * table itself. Total progress is the sum of both; either alone can push a
 * goal to unlock.
 */
@Injectable()
export class RewardGoalUnlockService {
  private readonly logger = new Logger(RewardGoalUnlockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly decisions: RetentionDecisionLogService,
    private readonly issuer: RewardGoalIssuerService,
    private readonly unlockNotification: RewardGoalUnlockNotificationService,
    private readonly engine: RewardGoalEngineService,
  ) {}

  async evaluateUnlock(
    businessId: string,
    customerId: string,
    now: Date = new Date(),
  ): Promise<UnlockResult> {
    const goal = await this.prisma.customerRewardGoal.findFirst({
      where: { businessId, customerId, status: RewardGoalStatus.ACTIVE },
      select: {
        id: true,
        activatedAt: true,
        targetAdditionalVisits: true,
        incentiveDefinition: { select: { name: true } },
      },
    });
    if (!goal) return { status: 'no_active_goal' };

    const [visitProgress, bonusStamps] = await Promise.all([
      this.prisma.visit.count({
        where: { businessId, customerId, occurredAt: { gt: goal.activatedAt } },
      }),
      this.prisma.rewardGoalBonusStamp.count({
        where: { rewardGoalId: goal.id },
      }),
    ]);
    const progressVisits = visitProgress + bonusStamps;

    if (progressVisits < goal.targetAdditionalVisits) {
      return {
        status: 'in_progress',
        goalId: goal.id,
        progressVisits,
        visitProgress,
        bonusStamps,
        targetAdditionalVisits: goal.targetAdditionalVisits,
        incentiveName: goal.incentiveDefinition.name,
      };
    }

    // Guarded transition: only the caller that actually flips ACTIVE→UNLOCKED
    // goes on to issue a reward. A concurrent retry sees `count: 0` and stops
    // here — this, not a check-then-act read, is what makes two simultaneous
    // check-ins unable to unlock (or issue) twice (Fase E §12).
    const transitioned = await this.prisma.customerRewardGoal.updateMany({
      where: { id: goal.id, status: RewardGoalStatus.ACTIVE },
      data: { status: RewardGoalStatus.UNLOCKED, unlockedAt: now },
    });
    if (transitioned.count === 0) {
      return { status: 'already_processed' };
    }

    await this.decisions.record({
      businessId,
      customerId,
      decisionCode: DECISION_CODES.REWARD_GOAL_UNLOCKED,
      metadata: { goalId: goal.id, progressVisits },
    });

    const issued = await this.issuer.issueForGoal(goal.id, now);
    if (!issued) {
      // Should not happen (the goal was just found and transitioned), but
      // never crash the check-in flow over it.
      return { status: 'already_processed' };
    }

    /**
     * El ciclo siguiente arranca ACÁ, no en la próxima visita.
     *
     * Antes no existía: `RewardGoalOrchestratorService.afterVisit` devuelve
     * temprano cuando el resultado es `unlocked`, así que nunca llegaba a
     * `maybeCreateGoal`, y la tarjeta nueva recién nacía cuando el cliente
     * volvía a visitar. Entre medio el cliente quedaba SIN tarjeta: abría
     * Mi Flikker y no veía ninguna, aunque acabara de completar una.
     *
     * Vive dentro del bloque guardado por el `updateMany` de arriba, así que
     * solo el caller que REALMENTE transicionó A llega hasta acá: dos
     * unlocks concurrentes no pueden crear dos ciclos nuevos. Y por si
     * acaso, abajo hay dos redes más: el `hasActiveGoal` del engine y el
     * índice único parcial `customer_reward_goals_one_active_per_customer`.
     *
     * `await` y no fire-and-forget: la respuesta del check-in y la lectura
     * inmediata de Mi Flikker tienen que ver el ciclo nuevo ya creado. Los
     * errores se tragan igual — si esto falla, el unlock y el premio que el
     * cliente acaba de ganar siguen siendo válidos, y el barrido diario lo
     * recupera.
     */
    await this.ensureNextGoal(businessId, customerId, now);

    // Fire-and-forget: el aviso de "completaste tu tarjeta" nunca debe
    // bloquear ni arriesgar la respuesta del check-in. Vive DENTRO de este
    // bloque (solo alcanzable una vez por goal, gracias al `updateMany`
    // guardado arriba) — nunca se llama desde una lectura (`currentView`,
    // `buildPersonalSpace`) ni desde el canje, así que abrir Mi Flikker o
    // redimir el premio nunca vuelve a dispararlo.
    void this.unlockNotification
      .notify({
        businessId,
        customerId,
        goalId: goal.id,
        rewardName: goal.incentiveDefinition.name,
        participationId: issued.participationId,
        now,
      })
      .catch((error) => {
        this.logger.warn(
          `reward_goal_unlocked notification failed for goal ${goal.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });

    return {
      status: 'unlocked',
      goalId: goal.id,
      incentiveName: goal.incentiveDefinition.name,
      code: issued.code,
      expiresAt: issued.expiresAt,
    };
  }

  /**
   * Crea el ciclo siguiente inmediatamente después de un unlock.
   *
   * Delega en `RewardGoalEngineService.evaluate` en vez de insertar la fila
   * a mano, y eso es deliberado: el engine es el único lugar que sabe si el
   * negocio todavía tiene los sellos prendidos (`rewardGoalsEnabled`), si
   * queda algún incentivo elegible hoy, si el negocio está en dry-run y si
   * hay cupo de participantes. Duplicar esas reglas acá sería inventar un
   * segundo motor que se desincroniza. Con `trigger: 'cycle_completed'` el
   * engine además sabe que esta visita ya dejó su sello en el ciclo
   * anterior y no debe contarla de nuevo (ver `GoalCreationTrigger`).
   *
   * Nunca tira: el premio que el cliente acaba de ganar ya está emitido y
   * nada de lo que pase acá puede ponerlo en riesgo.
   */
  private async ensureNextGoal(
    businessId: string,
    customerId: string,
    now: Date,
  ): Promise<void> {
    try {
      const business = await this.prisma.business.findUnique({
        where: { id: businessId },
        select: { timezone: true },
      });
      if (!business) return;

      const { segment, visitCount } = await resolveCustomerSegment(
        this.prisma,
        businessId,
        customerId,
        now,
      );

      const decision = await this.engine.evaluate(
        {
          businessId,
          customerId,
          segment,
          visitCount,
          timezone: business.timezone,
          now,
        },
        { dryRun: false, trigger: 'cycle_completed' },
      );

      this.logger.log(
        `Ciclo siguiente tras unlock (customer ${customerId}): ${decision.action} ${decision.reasonCode}`,
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo crear el ciclo siguiente tras el unlock del cliente ${customerId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
