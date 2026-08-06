import { Injectable, Logger } from '@nestjs/common';
import { ExperienceVersion, RewardGoalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveCustomerSegment } from './resolve-customer-segment';
import { RewardGoalEngineService } from './reward-goal-engine.service';

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
