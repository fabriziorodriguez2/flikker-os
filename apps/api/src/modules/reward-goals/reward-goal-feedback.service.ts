import { Injectable } from '@nestjs/common';
import { Prisma, RewardGoalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RewardGoalUnlockService } from './reward-goal-unlock.service';
import {
  RewardGoalOrchestratorService,
  viewFromUnlockResult,
  type RewardGoalPublicView,
} from './reward-goal-orchestrator.service';

const NOTHING: RewardGoalPublicView = {
  goal: null,
  unlockedNow: false,
  benefit: null,
};

export interface SubmitFeedbackResult {
  /** True when this visit already had feedback — no second bonus, no crash. */
  alreadySubmitted: boolean;
  /** True only the one time a stamp was actually created for this feedback. */
  bonusGranted: boolean;
  /** Pure score>=4 business rule — the caller pairs this with its own googleUrl. */
  offerGoogle: boolean;
  rewardGoal: RewardGoalPublicView;
}

/**
 * Fase E §9 (pilot ask) — "¿Cómo fue tu experiencia?" right after a check-in.
 * Deliberately separate from `RewardGoalOrchestratorService.afterVisit`: this
 * NEVER creates a new goal (only a real Visit does that) and its only write
 * beyond the feedback row itself is a `RewardGoalBonusStamp` — an additive
 * progress source, counted alongside `Visit` but never merged into it (see
 * `RewardGoalUnlockService`'s doc comment). The bonus is unconditional on
 * score, on whether Google is opened afterward, and on ever re-running this
 * for the same visit — see the two unique constraints doing the actual
 * idempotency work (`checkin_feedback.visit_id`, `reward_goal_bonus_stamps.feedback_id`).
 */
@Injectable()
export class RewardGoalFeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly unlock: RewardGoalUnlockService,
    private readonly orchestrator: RewardGoalOrchestratorService,
  ) {}

  async submit(
    businessId: string,
    customerId: string,
    visitId: string,
    score: number,
    comment: string | undefined,
    now: Date = new Date(),
  ): Promise<SubmitFeedbackResult> {
    const existing = await this.prisma.checkinFeedback.findUnique({
      where: { visitId },
      select: { score: true },
    });

    if (existing) {
      // Re-opening/retrying the same feedback — never a second bonus. Still
      // returns a consistent, current view instead of an error, so a page
      // refresh never looks broken.
      const rewardGoal = await this.orchestrator.currentView(
        businessId,
        customerId,
      );
      return {
        alreadySubmitted: true,
        bonusGranted: false,
        offerGoogle: existing.score >= 4,
        rewardGoal,
      };
    }

    const feedback = await this.prisma.checkinFeedback.create({
      data: {
        businessId,
        customerId,
        visitId,
        score,
        comment: comment?.trim() || undefined,
      },
      select: { id: true },
    });

    // Only an ACTIVE goal can receive a bonus stamp — there is nothing to
    // add progress toward otherwise, and this must never manufacture one.
    const [activeGoal, settings] = await Promise.all([
      this.prisma.customerRewardGoal.findFirst({
        where: { businessId, customerId, status: RewardGoalStatus.ACTIVE },
        select: { id: true },
      }),
      this.prisma.retentionSettings.findUnique({
        where: { businessId },
        select: { rewardGoalFeedbackBonusEnabled: true },
      }),
    ]);
    // Opt-in, off by default (never deployed yet — no live "on" behaviour to
    // preserve). No settings row at all is exactly the common case for a
    // business that has never opened Retención V2's settings — it must
    // resolve to OFF, same as the schema default, not silently to ON.
    const bonusEnabled = settings?.rewardGoalFeedbackBonusEnabled ?? false;

    let bonusGranted = false;
    if (activeGoal && bonusEnabled) {
      bonusGranted = await this.grantBonusStamp(
        businessId,
        customerId,
        activeGoal.id,
        feedback.id,
      );
    }

    let rewardGoal: RewardGoalPublicView = NOTHING;
    if (activeGoal) {
      const unlockResult = await this.unlock.evaluateUnlock(
        businessId,
        customerId,
        now,
      );
      rewardGoal = viewFromUnlockResult(unlockResult) ?? NOTHING;
    }

    return {
      alreadySubmitted: false,
      bonusGranted,
      offerGoogle: score >= 4,
      rewardGoal,
    };
  }

  /**
   * The unique index on `feedback_id` is the actual guarantee — this just
   * recovers gracefully from the rare concurrent-retry race instead of
   * throwing, same pattern `RewardGoalEngineService.createGoal` already
   * uses for its own unique-constraint race.
   */
  private async grantBonusStamp(
    businessId: string,
    customerId: string,
    rewardGoalId: string,
    feedbackId: string,
  ): Promise<boolean> {
    try {
      await this.prisma.rewardGoalBonusStamp.create({
        data: { businessId, customerId, rewardGoalId, feedbackId },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return false;
      }
      throw error;
    }
  }
}
