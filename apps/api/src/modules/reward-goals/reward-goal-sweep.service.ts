import { Injectable, Logger } from '@nestjs/common';
import { ExperienceVersion, RewardGoalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveCustomerSegment } from './resolve-customer-segment';
import { RewardGoalEngineService } from './reward-goal-engine.service';
import {
  DECISION_CODES,
  RetentionDecisionLogService,
} from '../retention-v2/retention-decision-log.service';

/**
 * Periodic reconciliation sweep (Fase E §33) — the safety net behind the
 * primary, per-Visit trigger (`RewardGoalOrchestratorService.afterVisit`).
 * Catches a customer whose segment changed for a reason other than a new
 * visit of their own (e.g. a Retention V2 intervention just made them
 * RECOVERED) without needing them to check in again first.
 *
 * Also the one and only implementation the dry-run report (Fase E §32) reads
 * from — `dryRun: true` runs the exact same sweep and decision logic, just
 * without ever calling `create()` (enforced inside
 * `RewardGoalEngineService.evaluate`, not duplicated here).
 */
@Injectable()
export class RewardGoalSweepService {
  private readonly logger = new Logger(RewardGoalSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: RewardGoalEngineService,
    private readonly decisions: RetentionDecisionLogService,
  ) {}

  async runDaily(now: Date = new Date(), dryRun = false) {
    const businesses = await this.findOwnedBusinesses();
    let evaluated = 0;
    let wouldCreateOrCreated = 0;

    for (const business of businesses) {
      try {
        const result = await this.sweepBusiness(business, now, dryRun);
        evaluated += result.evaluated;
        wouldCreateOrCreated += result.created;
      } catch (error) {
        this.logger.error(
          `Reward goal sweep failed for business ${business.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    this.logger.log(
      `Reward goal sweep businesses=${businesses.length} evaluated=${evaluated} ${
        dryRun ? 'wouldCreate' : 'created'
      }=${wouldCreateOrCreated} dryRun=${dryRun}`,
    );
    return {
      businesses: businesses.length,
      evaluated,
      created: wouldCreateOrCreated,
    };
  }

  /**
   * Reconciliation for the OTHER terminal transition (Fase F §0.1): a
   * `CustomerRewardGoal` whose promise window ran out without the customer
   * finishing it. `expiresAt` is an absolute instant (set once at creation
   * from the incentive's own `expiresInDays`), so this is a plain instant
   * comparison — there is no calendar-day/timezone conversion to get right
   * here, unlike the check-in flow's own day-key logic.
   *
   * Runs globally, not scoped to `rewardGoalsEnabled`: a goal already made is
   * a promise already given, and it must still resolve on schedule even if
   * the business later turns the feature off. Idempotent and retry-safe the
   * same way every other reward-goal transition is — a guarded `updateMany`
   * on `status: ACTIVE`, so re-running this after a crash mid-sweep never
   * double-transitions or double-logs a goal the previous run already closed.
   * Never touches `BenefitParticipation` — an expired goal was never unlocked,
   * so there is nothing to issue or revoke.
   */
  async expireOverdue(now: Date = new Date()) {
    const overdue = await this.prisma.customerRewardGoal.findMany({
      where: {
        status: RewardGoalStatus.ACTIVE,
        expiresAt: { not: null, lt: now },
      },
      select: { id: true, businessId: true, customerId: true },
    });

    let expired = 0;
    for (const goal of overdue) {
      const transitioned = await this.prisma.customerRewardGoal.updateMany({
        where: { id: goal.id, status: RewardGoalStatus.ACTIVE },
        data: { status: RewardGoalStatus.EXPIRED },
      });
      if (transitioned.count === 0) continue; // already closed by a concurrent/previous run

      expired += 1;
      await this.decisions.record({
        businessId: goal.businessId,
        customerId: goal.customerId,
        decisionCode: DECISION_CODES.REWARD_GOAL_EXPIRED,
        metadata: { goalId: goal.id },
      });
    }

    this.logger.log(
      `Reward goal expiry checked=${overdue.length} expired=${expired}`,
    );
    return { checked: overdue.length, expired };
  }

  /** CHECKIN_V2 only — a LEGACY business must never get a Reward Goal (Fase E §42). */
  private findOwnedBusinesses() {
    return this.prisma.business.findMany({
      where: {
        isActive: true,
        experienceVersion: ExperienceVersion.CHECKIN_V2,
        retentionSettings: { rewardGoalsEnabled: true },
      },
      select: { id: true, timezone: true },
    });
  }

  private async sweepBusiness(
    business: { id: string; timezone: string },
    now: Date,
    dryRun: boolean,
  ) {
    const customers = await this.prisma.customer.findMany({
      where: { businessId: business.id, isActive: true, optedOut: false },
      select: { id: true },
    });

    let evaluated = 0;
    let created = 0;

    for (const customer of customers) {
      // Skip the cheap, common case before paying for segmentation: a
      // customer already mid-goal has nothing new for this sweep to decide.
      const hasActiveGoal = await this.prisma.customerRewardGoal.findFirst({
        where: {
          businessId: business.id,
          customerId: customer.id,
          status: RewardGoalStatus.ACTIVE,
        },
        select: { id: true },
      });
      if (hasActiveGoal) continue;

      evaluated += 1;
      const { segment, visitCount } = await resolveCustomerSegment(
        this.prisma,
        business.id,
        customer.id,
        now,
      );

      const decision = await this.engine.evaluate(
        {
          businessId: business.id,
          customerId: customer.id,
          segment,
          visitCount,
          timezone: business.timezone,
          now,
        },
        { dryRun },
      );

      if (decision.action === 'CREATE_GOAL') created += 1;
    }

    return { evaluated, created };
  }
}
