import { Injectable } from '@nestjs/common';
import { RewardGoalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DECISION_CODES,
  RetentionDecisionLogService,
} from '../retention-v2/retention-decision-log.service';
import { RewardGoalIssuerService } from './reward-goal-issuer.service';

export type UnlockResult =
  | { status: 'no_active_goal' }
  | {
      status: 'in_progress';
      goalId: string;
      progressVisits: number;
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
 * "Which Visit counts" (§13): reuses `Visit` as the only source of truth,
 * counting every visit strictly after `activatedAt` — never
 * `startingVisitCount` arithmetic, which would need to stay in sync with a
 * second number. No new visit-validity rules are introduced: whatever
 * `VisitsRepository.registerVisit` already accepted (its own dedup, its own
 * verification types) is exactly what counts here too.
 */
@Injectable()
export class RewardGoalUnlockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly decisions: RetentionDecisionLogService,
    private readonly issuer: RewardGoalIssuerService,
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

    const progressVisits = await this.prisma.visit.count({
      where: { businessId, customerId, occurredAt: { gt: goal.activatedAt } },
    });

    if (progressVisits < goal.targetAdditionalVisits) {
      return {
        status: 'in_progress',
        goalId: goal.id,
        progressVisits,
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

    return {
      status: 'unlocked',
      goalId: goal.id,
      incentiveName: goal.incentiveDefinition.name,
      code: issued.code,
      expiresAt: issued.expiresAt,
    };
  }
}
