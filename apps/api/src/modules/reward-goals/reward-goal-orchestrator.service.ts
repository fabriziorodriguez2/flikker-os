import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveCustomerSegment } from './resolve-customer-segment';
import { RewardGoalEngineService } from './reward-goal-engine.service';
import { RewardGoalUnlockService } from './reward-goal-unlock.service';

export interface RewardGoalPublicView {
  goal: {
    incentiveName: string;
    progressVisits: number;
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
        activatedAt: true,
        targetAdditionalVisits: true,
        incentiveDefinition: { select: { name: true } },
      },
    });
    if (!goal) return NOTHING;

    const progressVisits = await this.prisma.visit.count({
      where: { businessId, customerId, occurredAt: { gt: goal.activatedAt } },
    });

    return {
      goal: {
        incentiveName: goal.incentiveDefinition.name,
        progressVisits,
        targetAdditionalVisits: goal.targetAdditionalVisits,
        remainingVisits: Math.max(
          0,
          goal.targetAdditionalVisits - progressVisits,
        ),
      },
      unlockedNow: false,
      benefit: null,
    };
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
        targetAdditionalVisits: decision.targetAdditionalVisits,
        remainingVisits: decision.targetAdditionalVisits,
      },
      unlockedNow: false,
      benefit: null,
    };
  }
}
