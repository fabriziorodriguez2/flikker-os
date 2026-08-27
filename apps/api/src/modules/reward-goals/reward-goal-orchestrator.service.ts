import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveCustomerSegment } from './resolve-customer-segment';
import { computeGoalProgress } from './reward-goal-progress';
import { RewardGoalEngineService } from './reward-goal-engine.service';
import {
  RewardGoalUnlockService,
  type UnlockResult,
} from './reward-goal-unlock.service';

export interface RewardGoalPublicView {
  goal: {
    incentiveName: string;
    /** Total combined progress — visits + feedback bonus stamps. */
    progressVisits: number;
    /** Breakdown (§9 pilot ask) — how many of `progressVisits` are real visits. */
    visitProgress: number;
    /** Breakdown — how many of `progressVisits` came from a feedback bonus. */
    bonusStamps: number;
    targetAdditionalVisits: number;
    remainingVisits: number;
  } | null;
  unlockedNow: boolean;
  benefit: {
    name: string;
    code: string;
    expiresAt: string | null;
  } | null;
}

const NOTHING: RewardGoalPublicView = {
  goal: null,
  unlockedNow: false,
  benefit: null,
};

/**
 * Shared `UnlockResult` → `RewardGoalPublicView` mapping — used by both
 * `afterVisit` (below) and `RewardGoalFeedbackService` (§9 pilot ask), so
 * the two never drift into two slightly-different shapes for the same
 * unlocked/in-progress states. Returns `null` for 'no_active_goal' /
 * 'already_processed' — callers decide their own fallback (never a new goal
 * here; only `afterVisit` is allowed to create one).
 */
export function viewFromUnlockResult(
  unlockResult: UnlockResult,
): RewardGoalPublicView | null {
  if (unlockResult.status === 'unlocked') {
    return {
      goal: null,
      unlockedNow: true,
      benefit: {
        name: unlockResult.incentiveName,
        code: unlockResult.code,
        expiresAt: unlockResult.expiresAt?.toISOString() ?? null,
      },
    };
  }

  if (unlockResult.status === 'in_progress') {
    return {
      goal: {
        incentiveName: unlockResult.incentiveName,
        progressVisits: unlockResult.progressVisits,
        visitProgress: unlockResult.visitProgress,
        bonusStamps: unlockResult.bonusStamps,
        targetAdditionalVisits: unlockResult.targetAdditionalVisits,
        remainingVisits: Math.max(
          0,
          unlockResult.targetAdditionalVisits - unlockResult.progressVisits,
        ),
      },
      unlockedNow: false,
      benefit: null,
    };
  }

  return null;
}

/**
 * The single entry point the check-in flow calls after registering a Visit
 * (Fase E §14/§33). Order matters: unlock is evaluated against the goal that
 * ALREADY existed before this visit — a goal is never created and unlocked
 * in the same call, which is exactly what Fase E §27 forbids for
 * PROGRESS_REMINDER and is just as important here, for the same reason (an
 * unlock must be earned by a real prior commitment, not manufactured on the
 * spot).
 */
@Injectable()
export class RewardGoalOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: RewardGoalEngineService,
    private readonly unlock: RewardGoalUnlockService,
  ) {}

  async afterVisit(
    businessId: string,
    customerId: string,
    timezone: string,
    now: Date = new Date(),
  ): Promise<RewardGoalPublicView> {
    const unlockResult = await this.unlock.evaluateUnlock(
      businessId,
      customerId,
      now,
    );

    const view = viewFromUnlockResult(unlockResult);
    if (view) return view;

    // No ACTIVE goal existed (or one just resolved elsewhere) — see whether
    // the engine wants to start a new one now that a fresh Visit exists.
    return this.maybeCreateGoal(businessId, customerId, timezone, now);
  }

  /**
   * Read-only progress, with no side effect — never unlocks, never creates a
   * goal. Used by `GET /me`, which must stay a pure read: an unlock or a new
   * goal must only ever be triggered by an actual Visit (Fase E §27's "never
   * manufacture a goal on the spot" applies just as much to a page refresh).
   */
  async currentView(
    businessId: string,
    customerId: string,
  ): Promise<RewardGoalPublicView> {
    const goal = await this.prisma.customerRewardGoal.findFirst({
      where: { businessId, customerId, status: 'ACTIVE' },
      select: {
        id: true,
        activatedAt: true,
        targetAdditionalVisits: true,
        incentiveDefinition: { select: { name: true } },
      },
    });
    if (!goal) return NOTHING;

    const progress = await this.computeProgress(businessId, customerId, goal);
    return {
      goal: { incentiveName: goal.incentiveDefinition.name, ...progress },
      unlockedNow: false,
      benefit: null,
    };
  }

  /**
   * Único lugar que cuenta progreso real de una tarjeta — `currentView` y
   * `maybeCreateGoal` (recién creada) piden acá, nunca cada uno por su
   * cuenta, para que nunca puedan mostrar números distintos del mismo goal.
   */
  private async computeProgress(
    businessId: string,
    customerId: string,
    goal: { id: string; activatedAt: Date; targetAdditionalVisits: number },
  ) {
    const [visitProgress, bonusStamps] = await Promise.all([
      this.prisma.visit.count({
        where: { businessId, customerId, occurredAt: { gt: goal.activatedAt } },
      }),
      this.prisma.rewardGoalBonusStamp.count({
        where: { rewardGoalId: goal.id },
      }),
    ]);
    return computeGoalProgress({
      visitProgress,
      bonusStamps,
      targetAdditionalVisits: goal.targetAdditionalVisits,
    });
  }

  private async maybeCreateGoal(
    businessId: string,
    customerId: string,
    timezone: string,
    now: Date,
  ): Promise<RewardGoalPublicView> {
    const { segment, visitCount } = await resolveCustomerSegment(
      this.prisma,
      businessId,
      customerId,
      now,
    );

    const decision = await this.engine.evaluate({
      businessId,
      customerId,
      segment,
      visitCount,
      timezone,
      now,
    });

    if (decision.action !== 'CREATE_GOAL') return NOTHING;

    // Bug real corregido acá: antes esto devolvía SIEMPRE progreso 0,
    // aunque la visita que disparó esta creación (la fundadora) ya
    // calificaba como el primer sello. Se busca el goal recién creado (por
    // `engine.evaluate`, más arriba) y se cuenta su progreso REAL con la
    // misma aritmética que `currentView` — nunca un número inventado.
    //
    // En modo dry-run (`RetentionSettings.dryRunEnabled`) el engine decide
    // `CREATE_GOAL` pero NUNCA escribe la fila — acá no hay forma de
    // distinguir eso de una carrera real sin tocar el contrato del
    // engine, así que si no se encuentra el goal se cae a la vista previa
    // determinística de siempre (0 de progreso, que es honesto: en dry-run
    // no se otorgó nada todavía).
    const goal = await this.prisma.customerRewardGoal.findFirst({
      where: { businessId, customerId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        activatedAt: true,
        targetAdditionalVisits: true,
        incentiveDefinition: { select: { name: true } },
      },
    });

    if (goal) {
      const progress = await this.computeProgress(businessId, customerId, goal);
      return {
        goal: { incentiveName: goal.incentiveDefinition.name, ...progress },
        unlockedNow: false,
        benefit: null,
      };
    }

    const incentive = await this.prisma.retentionIncentiveDefinition.findUnique(
      {
        where: { id: decision.incentiveDefinitionId },
        select: { name: true },
      },
    );

    return {
      goal: {
        incentiveName: incentive?.name ?? 'tu recompensa',
        progressVisits: 0,
        visitProgress: 0,
        bonusStamps: 0,
        targetAdditionalVisits: decision.targetAdditionalVisits,
        remainingVisits: decision.targetAdditionalVisits,
      },
      unlockedNow: false,
      benefit: null,
    };
  }
}
