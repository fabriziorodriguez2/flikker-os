import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { localPeriodKey } from '../../common/utils/timezone.util';
import { estimateIncentiveCost } from './incentive-cost';

/**
 * The owner's protection against a misconfigured experiment issuing unlimited
 * benefits. Two independent, optional caps — a count and an estimated cost —
 * evaluated over the business's local calendar month.
 *
 * Deliberately deny-by-default: if the owner has authorized incentive-bearing
 * variants for automation but configured NEITHER cap, this treats that as "no
 * incentive may be issued automatically" rather than "unlimited". Setting at
 * least one cap is what turns the budget on; REMINDER/CONTROL never reach this
 * check at all, since they carry no incentive.
 */

export type BudgetCheck =
  | { allowed: true }
  | {
      allowed: false;
      reasonCode: 'MONTHLY_INCENTIVE_LIMIT' | 'MONTHLY_BUDGET_LIMIT';
      metadata: Record<string, unknown>;
    };

export interface BudgetCaps {
  maxAutomatedIncentivesPerMonth: number | null;
  maxEstimatedIncentiveCostPerMonth: Prisma.Decimal | number | null;
}

@Injectable()
export class RetentionBudgetService {
  /**
   * The advisory-lock key for one business's monthly budget. Callers must take
   * this lock, inside the same transaction that will write the new
   * BenefitParticipation, before calling `checkWithinCaps` — otherwise two
   * concurrent issuances can both read "under the cap" and both proceed. See
   * `IncentiveIssuerService.issueForAssignment`, which is the only caller.
   */
  lockKey(businessId: string, timezone: string, now: Date): string {
    return `retention-budget:${businessId}:${localPeriodKey(now, timezone)}`;
  }

  /**
   * Whether one more automated incentive, estimated at `estimatedCost`, may be
   * issued this local month without breaching either configured cap.
   *
   * Must run inside the transaction that already holds `lockKey`'s advisory
   * lock, using that same transaction client, so the count it reads cannot
   * change under it before the write commits.
   */
  async checkWithinCaps(
    tx: Prisma.TransactionClient,
    params: {
      businessId: string;
      timezone: string;
      now: Date;
      caps: BudgetCaps;
      estimatedCostOfThisIssue: number;
      /** Needed to estimate a percentage incentive's cost — see `incentive-cost.ts`. */
      averageTicketAmount: Prisma.Decimal | number | null;
    },
  ): Promise<BudgetCheck> {
    const { caps } = params;
    if (
      caps.maxAutomatedIncentivesPerMonth === null &&
      caps.maxEstimatedIncentiveCostPerMonth === null
    ) {
      return {
        allowed: false,
        reasonCode: 'MONTHLY_INCENTIVE_LIMIT',
        metadata: { limitType: 'NOT_CONFIGURED' },
      };
    }

    const { count, cost } = await this.issuedThisMonth(
      tx,
      params.businessId,
      params.timezone,
      params.now,
      params.averageTicketAmount,
    );

    if (
      caps.maxAutomatedIncentivesPerMonth !== null &&
      count + 1 > caps.maxAutomatedIncentivesPerMonth
    ) {
      return {
        allowed: false,
        reasonCode: 'MONTHLY_INCENTIVE_LIMIT',
        metadata: {
          limitType: 'COUNT',
          issuedThisMonth: count,
          cap: caps.maxAutomatedIncentivesPerMonth,
        },
      };
    }

    const costCap =
      caps.maxEstimatedIncentiveCostPerMonth === null
        ? null
        : Number(caps.maxEstimatedIncentiveCostPerMonth);

    if (costCap !== null && cost + params.estimatedCostOfThisIssue > costCap) {
      return {
        allowed: false,
        reasonCode: 'MONTHLY_BUDGET_LIMIT',
        metadata: {
          limitType: 'COST',
          spentThisMonth: cost,
          cap: costCap,
          estimatedCostOfThisIssue: params.estimatedCostOfThisIssue,
        },
      };
    }

    return { allowed: true };
  }

  /**
   * Automated incentives issued this local month, and their combined estimated
   * cost, using each variant's incentive definition as it stands today.
   *
   * Uses the current definition rather than a historical snapshot — this is a
   * budget estimate for the owner, not accounting, and definitions rarely
   * change cost after being used. Bounded to a 35-day DB window (a superset of
   * any calendar month) and refined in memory against the exact local month,
   * which avoids reimplementing timezone-aware month-boundary arithmetic.
   *
   * Cost estimation (Fase D §19 — the C.5 risk this closes): a percentage or
   * fixed-value incentive with no explicit `estimatedCost` used to contribute
   * nothing to the cost cap at all, silently letting `maxEstimatedIncentiveCostPerMonth`
   * under-count real exposure. `estimateIncentiveCost` now derives a real
   * number whenever it can (percentage × the business's own average ticket,
   * or the fixed value itself) and only gives up — contributing 0 — when
   * neither a declared cost nor an average ticket exists to estimate from.
   */
  private async issuedThisMonth(
    tx: Prisma.TransactionClient,
    businessId: string,
    timezone: string,
    now: Date,
    averageTicketAmount: Prisma.Decimal | number | null,
  ): Promise<{ count: number; cost: number }> {
    const monthKey = localPeriodKey(now, timezone);
    const windowStart = new Date(now.getTime() - 35 * 86_400_000);

    const participations = await tx.benefitParticipation.findMany({
      where: {
        businessId,
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
      (p) => localPeriodKey(p.createdAt, timezone) === monthKey,
    );

    const cost = thisMonth.reduce((sum, p) => {
      const definition = p.retentionAssignment?.variant.incentiveDefinition;
      if (!definition) return sum;
      const estimate = estimateIncentiveCost(definition, averageTicketAmount);
      // Unknown cost (no declared cost, no average ticket to derive one
      // from): still counts toward the count cap via `thisMonth.length`, just
      // contributes nothing here — never fabricate a number.
      return estimate ? sum + estimate.cost : sum;
    }, 0);

    return { count: thisMonth.length, cost };
  }
}
