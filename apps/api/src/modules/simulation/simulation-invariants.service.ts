import { Injectable } from '@nestjs/common';
import { ExperienceVersion, RewardGoalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { localPeriodKey } from '../../common/utils/timezone.util';
import { estimateIncentiveCost } from '../retention-v2/incentive-cost';

export type InvariantStatus = 'PASS' | 'WARN' | 'FAIL';

export interface InvariantCheckResult {
  code: string;
  status: InvariantStatus;
  message: string;
  /** A FAIL here always flips the overall run to FAILED (§20). A WARN never does. */
  critical: boolean;
}

export interface InvariantCheckInput {
  businessId: string;
  experimentId: string;
  now: Date;
  timezone: string;
  /** The database name `SIMULATION_DATABASE_URL` points at — never `DATABASE_URL`'s. */
  expectedSimulationDatabaseName: string;
  maxAiCallsDefault: number;
}

/**
 * Simulation Center §20 — every check the request lists, checked against
 * real rows in whichever database `PrismaService` is bound to (the isolated
 * simulation DB — this service never checks or enforces that itself; see
 * `simulation-context.ts`, which is the actual isolation guarantee).
 *
 * Three items from §20's list are deliberately NOT re-checked here, with the
 * reason each time this is a disclosed decision, not an oversight:
 *   - "no duplicate Message per assignment" / "no duplicate
 *     BenefitParticipation" are enforced by real `@unique` DB constraints
 *     (`RetentionAssignment.messageId`/`benefitParticipationId`,
 *     `CustomerRewardGoal.benefitParticipationId`) — a duplicate literally
 *     cannot be inserted. Checked here anyway, as defense-in-depth: this is
 *     exactly the kind of thing a bug (or a future bulk-write path bypassing
 *     the app) should still be caught trying to violate.
 *   - "no simulation Message went out via a real provider" has no DB trace
 *     to check — the guarantee is structural (the engine never imports
 *     `WhatsAppBspService`, see `simulation-engine.service.ts`), not
 *     runtime-observable from data alone.
 *   - "no AI changed the winner" is a batch-level (with-AI vs. without-AI)
 *     comparison, not a single-run invariant — see the run-comparison report
 *     in a later batch.
 */
@Injectable()
export class SimulationInvariantService {
  constructor(private readonly prisma: PrismaService) {}

  async checkAll(input: InvariantCheckInput): Promise<InvariantCheckResult[]> {
    return Promise.all([
      this.checkDatabaseIsolated(input),
      this.checkNotLegacyBusiness(input),
      this.checkAllocationSumsTo100(input),
      this.checkControlFloor(input),
      this.checkExplorationFloor(input),
      this.checkMonthlyIncentiveCount(input),
      this.checkMonthlyIncentiveCost(input),
      this.checkNoDuplicateMessage(input),
      this.checkNoDuplicateBenefitParticipation(input),
      this.checkMaxOneActiveRewardGoalPerCustomer(input),
      this.checkNoAssignmentMultipleVariant(input),
      this.checkAiUsageWithinMaxCalls(input),
    ]);
  }

  private async checkDatabaseIsolated(
    input: InvariantCheckInput,
  ): Promise<InvariantCheckResult> {
    const [{ current_database: actual }] = await this.prisma.$queryRawUnsafe<
      { current_database: string }[]
    >('SELECT current_database()');
    const isolated = actual === input.expectedSimulationDatabaseName;
    return {
      code: 'SIMULATION_DATABASE_ISOLATED',
      status: isolated ? 'PASS' : 'FAIL',
      message: isolated
        ? `Connected to the isolated simulation database (${actual}).`
        : `Connected to "${actual}", expected the isolated simulation database "${input.expectedSimulationDatabaseName}" — this must never happen.`,
      critical: true,
    };
  }

  private async checkNotLegacyBusiness(
    input: InvariantCheckInput,
  ): Promise<InvariantCheckResult> {
    const business = await this.prisma.business.findUnique({
      where: { id: input.businessId },
      select: { experienceVersion: true, retentionEngineV2Enabled: true },
    });
    const ok =
      !!business &&
      business.experienceVersion === ExperienceVersion.CHECKIN_V2 &&
      business.retentionEngineV2Enabled;
    return {
      code: 'NO_LEGACY_BUSINESS_PROCESSED_BY_V2',
      status: ok ? 'PASS' : 'FAIL',
      message: ok
        ? 'The simulated business is CHECKIN_V2 with Retention V2 enabled.'
        : `Simulated business ${input.businessId} is not a valid CHECKIN_V2/RetentionV2 business (experienceVersion=${business?.experienceVersion ?? 'missing'}).`,
      critical: true,
    };
  }

  private async getVariants(businessId: string, experimentId: string) {
    return this.prisma.retentionVariant.findMany({
      where: { businessId, experimentId, active: true },
      select: { strategyType: true, allocationPercent: true },
    });
  }

  private async checkAllocationSumsTo100(
    input: InvariantCheckInput,
  ): Promise<InvariantCheckResult> {
    const variants = await this.getVariants(
      input.businessId,
      input.experimentId,
    );
    const total = variants.reduce((sum, v) => sum + v.allocationPercent, 0);
    const ok = total === 100;
    return {
      code: 'ALLOCATION_SUMS_TO_100',
      status: ok ? 'PASS' : 'FAIL',
      message: ok
        ? 'Active variant allocation sums to exactly 100%.'
        : `Active variant allocation sums to ${total}%, not 100%.`,
      critical: true,
    };
  }

  private async checkControlFloor(
    input: InvariantCheckInput,
  ): Promise<InvariantCheckResult> {
    const [variants, settings] = await Promise.all([
      this.getVariants(input.businessId, input.experimentId),
      this.prisma.retentionSettings.findUnique({
        where: { businessId: input.businessId },
        select: { minimumControlPercent: true },
      }),
    ]);
    const control = variants.find((v) => v.strategyType === 'CONTROL');
    const minimum = settings?.minimumControlPercent ?? 0;
    const ok = (control?.allocationPercent ?? 0) >= minimum;
    return {
      code: 'CONTROL_FLOOR_RESPECTED',
      status: ok ? 'PASS' : 'FAIL',
      message: ok
        ? `CONTROL holds ${control?.allocationPercent ?? 0}%, at or above the ${minimum}% floor.`
        : `CONTROL holds only ${control?.allocationPercent ?? 0}%, below the configured ${minimum}% floor.`,
      critical: true,
    };
  }

  private async checkExplorationFloor(
    input: InvariantCheckInput,
  ): Promise<InvariantCheckResult> {
    const [variants, settings] = await Promise.all([
      this.getVariants(input.businessId, input.experimentId),
      this.prisma.retentionSettings.findUnique({
        where: { businessId: input.businessId },
        select: { minimumExplorationPercent: true },
      }),
    ]);
    const nonControl = variants.filter((v) => v.strategyType !== 'CONTROL');
    // Pre-piloto fix (§13/§14/§15) — a genuine two-arm experiment (CONTROL +
    // exactly one challenger) has no "other" arm for this floor to protect:
    // the formula below (`sum(nonControl) - largest`) degenerates to 0 by
    // construction, every time, regardless of allocation — that is not a
    // real exploration problem, just this floor's precondition (≥2
    // challengers) not applying. Vacuously PASS rather than a permanent,
    // unfixable FAIL on every two-arm scenario.
    if (nonControl.length <= 1) {
      return {
        code: 'EXPLORATION_FLOOR_RESPECTED',
        status: 'PASS',
        message:
          'Two-arm experiment (CONTROL + one challenger) — nothing else to explore, floor does not apply.',
        critical: true,
      };
    }
    const largest = nonControl.reduce(
      (max, v) => Math.max(max, v.allocationPercent),
      0,
    );
    const exploration =
      nonControl.reduce((sum, v) => sum + v.allocationPercent, 0) - largest;
    const minimum = settings?.minimumExplorationPercent ?? 0;
    const ok = exploration >= minimum;
    return {
      code: 'EXPLORATION_FLOOR_RESPECTED',
      status: ok ? 'PASS' : 'FAIL',
      message: ok
        ? `Combined non-winning exploration is ${exploration} points, at or above the ${minimum}-point floor.`
        : `Combined non-winning exploration is only ${exploration} points, below the configured ${minimum}-point floor.`,
      critical: true,
    };
  }

  /**
   * Mirrors `RetentionBudgetService`'s own real (private) monthly window —
   * only Retention V2-issued participations count against this cap, exactly
   * like the real issuance gate (`retentionAssignment: { isNot: null }`
   * excludes Reward Goal-issued ones, which have their own, separate
   * unlimited-by-cap path today).
   */
  private async issuedThisMonth(input: InvariantCheckInput) {
    const monthKey = localPeriodKey(input.now, input.timezone);
    const windowStart = new Date(input.now.getTime() - 35 * 86_400_000);
    const participations = await this.prisma.benefitParticipation.findMany({
      where: {
        businessId: input.businessId,
        createdAt: { gte: windowStart },
        retentionAssignment: { isNot: null },
      },
      select: {
        createdAt: true,
        retentionAssignment: {
          select: {
            variant: {
              select: {
                incentiveDefinition: {
                  select: {
                    estimatedCost: true,
                    percentageValue: true,
                    fixedValue: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    const thisMonth = participations.filter(
      (p) => localPeriodKey(p.createdAt, input.timezone) === monthKey,
    );
    return thisMonth;
  }

  private async checkMonthlyIncentiveCount(
    input: InvariantCheckInput,
  ): Promise<InvariantCheckResult> {
    const [thisMonth, settings] = await Promise.all([
      this.issuedThisMonth(input),
      this.prisma.retentionSettings.findUnique({
        where: { businessId: input.businessId },
        select: { maxAutomatedIncentivesPerMonth: true },
      }),
    ]);
    const limit = settings?.maxAutomatedIncentivesPerMonth;
    if (limit == null) {
      return {
        code: 'MONTHLY_INCENTIVE_COUNT_WITHIN_LIMIT',
        status: 'PASS',
        message:
          'No monthly incentive count cap configured — nothing to check.',
        critical: false,
      };
    }
    const ok = thisMonth.length <= limit;
    return {
      code: 'MONTHLY_INCENTIVE_COUNT_WITHIN_LIMIT',
      status: ok ? 'PASS' : 'FAIL',
      message: ok
        ? `${thisMonth.length} automated incentives issued this month, within the ${limit} cap.`
        : `${thisMonth.length} automated incentives issued this month, EXCEEDING the ${limit} cap.`,
      // §31 lists "budget exceeded" explicitly as a NOT_READY trigger.
      critical: true,
    };
  }

  private async checkMonthlyIncentiveCost(
    input: InvariantCheckInput,
  ): Promise<InvariantCheckResult> {
    const [thisMonth, settings] = await Promise.all([
      this.issuedThisMonth(input),
      this.prisma.retentionSettings.findUnique({
        where: { businessId: input.businessId },
        select: {
          maxEstimatedIncentiveCostPerMonth: true,
          averageTicketAmount: true,
        },
      }),
    ]);
    const limit = settings?.maxEstimatedIncentiveCostPerMonth;
    if (limit == null) {
      return {
        code: 'MONTHLY_INCENTIVE_COST_WITHIN_LIMIT',
        status: 'PASS',
        message: 'No monthly incentive cost cap configured — nothing to check.',
        critical: false,
      };
    }
    const cost = thisMonth.reduce((sum, p) => {
      const definition = p.retentionAssignment?.variant.incentiveDefinition;
      if (!definition) return sum;
      const estimate = estimateIncentiveCost(
        definition,
        settings?.averageTicketAmount ?? null,
      );
      return sum + (estimate?.cost ?? 0);
    }, 0);
    const limitNumber = Number(limit);
    const ok = cost <= limitNumber;
    return {
      code: 'MONTHLY_INCENTIVE_COST_WITHIN_LIMIT',
      status: ok ? 'PASS' : 'FAIL',
      message: ok
        ? `Estimated ${cost.toFixed(2)} spent this month, within the ${limitNumber} cap.`
        : `Estimated ${cost.toFixed(2)} spent this month, EXCEEDING the ${limitNumber} cap.`,
      // §31 lists "budget exceeded" explicitly as a NOT_READY trigger.
      critical: true,
    };
  }

  private async checkNoDuplicateMessage(
    input: InvariantCheckInput,
  ): Promise<InvariantCheckResult> {
    const groups = await this.prisma.retentionAssignment.groupBy({
      by: ['messageId'],
      where: { businessId: input.businessId, messageId: { not: null } },
      _count: { _all: true },
      having: { messageId: { _count: { gt: 1 } } },
    });
    const ok = groups.length === 0;
    return {
      code: 'NO_DUPLICATE_MESSAGE_PER_ASSIGNMENT',
      status: ok ? 'PASS' : 'FAIL',
      message: ok
        ? 'Every Message is attached to at most one assignment.'
        : `${groups.length} Message row(s) attached to more than one assignment — the unique constraint should make this impossible.`,
      critical: true,
    };
  }

  private async checkNoDuplicateBenefitParticipation(
    input: InvariantCheckInput,
  ): Promise<InvariantCheckResult> {
    const [assignmentGroups, goalGroups] = await Promise.all([
      this.prisma.retentionAssignment.groupBy({
        by: ['benefitParticipationId'],
        where: {
          businessId: input.businessId,
          benefitParticipationId: { not: null },
        },
        _count: { _all: true },
        having: { benefitParticipationId: { _count: { gt: 1 } } },
      }),
      this.prisma.customerRewardGoal.groupBy({
        by: ['benefitParticipationId'],
        where: {
          businessId: input.businessId,
          benefitParticipationId: { not: null },
        },
        _count: { _all: true },
        having: { benefitParticipationId: { _count: { gt: 1 } } },
      }),
    ]);
    const ok = assignmentGroups.length === 0 && goalGroups.length === 0;
    return {
      code: 'NO_DUPLICATE_BENEFIT_PARTICIPATION',
      status: ok ? 'PASS' : 'FAIL',
      message: ok
        ? 'Every BenefitParticipation is owned by at most one assignment/goal.'
        : `${assignmentGroups.length + goalGroups.length} BenefitParticipation row(s) shared by more than one owner — the unique constraint should make this impossible.`,
      critical: true,
    };
  }

  private async checkMaxOneActiveRewardGoalPerCustomer(
    input: InvariantCheckInput,
  ): Promise<InvariantCheckResult> {
    const groups = await this.prisma.customerRewardGoal.groupBy({
      by: ['customerId'],
      where: { businessId: input.businessId, status: RewardGoalStatus.ACTIVE },
      _count: { _all: true },
      having: { customerId: { _count: { gt: 1 } } },
    });
    const ok = groups.length === 0;
    return {
      code: 'MAX_ONE_ACTIVE_REWARD_GOAL_PER_CUSTOMER',
      status: ok ? 'PASS' : 'FAIL',
      message: ok
        ? 'No customer has more than one ACTIVE Reward Goal at a time.'
        : `${groups.length} customer(s) have more than one ACTIVE Reward Goal simultaneously.`,
      critical: false,
    };
  }

  private async checkNoAssignmentMultipleVariant(
    input: InvariantCheckInput,
  ): Promise<InvariantCheckResult> {
    const groups = await this.prisma.retentionAssignment.groupBy({
      by: ['customerId'],
      where: { businessId: input.businessId, experimentId: input.experimentId },
      _count: { _all: true },
      having: { customerId: { _count: { gt: 1 } } },
    });
    const ok = groups.length === 0;
    return {
      code: 'NO_ASSIGNMENT_MULTIPLE_VARIANT',
      status: ok ? 'PASS' : 'FAIL',
      message: ok
        ? 'No customer was assigned more than once to this experiment.'
        : `${groups.length} customer(s) have more than one assignment in this experiment — the unique constraint should make this impossible.`,
      critical: true,
    };
  }

  private async checkAiUsageWithinMaxCalls(
    input: InvariantCheckInput,
  ): Promise<InvariantCheckResult> {
    const count = await this.prisma.aiUsageEvent.count({
      where: { businessId: input.businessId },
    });
    const ok = count <= input.maxAiCallsDefault;
    return {
      code: 'AI_USAGE_WITHIN_MAX_CALLS',
      status: ok ? 'PASS' : 'FAIL',
      message: ok
        ? `${count} AI call(s) recorded, within the ${input.maxAiCallsDefault} cap.`
        : `${count} AI call(s) recorded, EXCEEDING the ${input.maxAiCallsDefault} cap.`,
      critical: true,
    };
  }
}
