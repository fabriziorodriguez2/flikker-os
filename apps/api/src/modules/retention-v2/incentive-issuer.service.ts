import { Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RetentionBudgetService } from './retention-budget.service';
import { estimateIncentiveCost } from './incentive-cost';

/**
 * Turns an authorized RetentionIncentiveDefinition into an individual reward a
 * customer can actually redeem.
 *
 * How it reuses the existing system instead of building a second one:
 *
 *  1. Each variant gets ONE `Benefit` row, created lazily and kept
 *     `active: false`. Inactive means it never competes for the
 *     `benefits_one_active_per_business` slot the QR/check-in flow depends on —
 *     that invariant is untouched.
 *  2. Each customer gets a `BenefitParticipation` with a redemption code minted
 *     by the same `ensureRedemptionCode` the QR flow uses, plus a per-issue
 *     `expiresAt`.
 *  3. Redemption goes through the existing `consumeRedemption` /
 *     `/redemptions/redeem` flow, which already guarantees single use and
 *     raises the visit attribution to `confirmed_redemption`.
 *
 * So there is exactly one redemption path in the product. The only thing added
 * is the per-issue expiry column, which the QR flow leaves null.
 */

export type IssueOutcome =
  | { status: 'issued'; participationId: string; code: string; expiresAt: Date }
  | { status: 'already_issued'; participationId: string }
  | {
      status: 'skipped';
      reason:
        | 'NOT_AUTHORIZED'
        | 'LIMIT_REACHED'
        | 'NOT_VALID_TODAY'
        | 'MONTHLY_INCENTIVE_LIMIT'
        | 'MONTHLY_BUDGET_LIMIT';
    };

/**
 * Whether the incentive may be offered on this local weekday.
 *
 * An empty `validDays` means no restriction. Evaluated in the business
 * timezone, because "Saturdays only" is a local-calendar promise.
 */
export function isValidToday(
  validDays: number[],
  timezone: string,
  now: Date,
): boolean {
  if (validDays.length === 0) return true;

  const weekdayLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(now);
  // ISO weekday: Monday = 1 … Sunday = 7.
  const isoWeekday =
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekdayLabel) + 1;

  return isoWeekday >= 1 && validDays.includes(isoWeekday);
}

@Injectable()
export class IncentiveIssuerService {
  private readonly logger = new Logger(IncentiveIssuerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly budget: RetentionBudgetService,
  ) {}

  /**
   * Issues the reward for one assignment. Idempotent: the assignment's unique
   * `benefitParticipationId` means a retried job can never mint a second
   * reward, and an existing issue is returned instead of duplicated.
   */
  async issueForAssignment(
    assignmentId: string,
    now: Date = new Date(),
  ): Promise<IssueOutcome> {
    const assignment = await this.prisma.retentionAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        id: true,
        businessId: true,
        customerId: true,
        benefitParticipationId: true,
        business: {
          select: {
            timezone: true,
            retentionSettings: {
              select: {
                maxAutomatedIncentivesPerMonth: true,
                maxEstimatedIncentiveCostPerMonth: true,
                averageTicketAmount: true,
              },
            },
          },
        },
        variant: {
          select: {
            id: true,
            issuedBenefitId: true,
            incentiveDefinition: {
              select: {
                id: true,
                name: true,
                description: true,
                conditions: true,
                type: true,
                expiresInDays: true,
                active: true,
                automationEligible: true,
                maxRedemptionsPerCustomer: true,
                maxTotalRedemptions: true,
                validDays: true,
                estimatedCost: true,
                percentageValue: true,
                fixedValue: true,
              },
            },
          },
        },
      },
    });

    if (!assignment) return { status: 'skipped', reason: 'NOT_AUTHORIZED' };

    // Already issued — return it rather than minting another.
    if (assignment.benefitParticipationId) {
      return {
        status: 'already_issued',
        participationId: assignment.benefitParticipationId,
      };
    }

    const definition = assignment.variant.incentiveDefinition;
    // Re-checked at issue time, not just at experiment start: the owner may
    // have deactivated or de-authorized the incentive in the meantime.
    if (!definition || !definition.active || !definition.automationEligible) {
      return { status: 'skipped', reason: 'NOT_AUTHORIZED' };
    }

    // Day restriction, in the business's local calendar. Checked before issuing
    // so the message never promises something that cannot be handed over.
    if (
      !isValidToday(
        definition.validDays,
        assignment.business?.timezone ?? 'America/Montevideo',
        now,
      )
    ) {
      return { status: 'skipped', reason: 'NOT_VALID_TODAY' };
    }

    if (!(await this.withinLimits(assignment, definition))) {
      return { status: 'skipped', reason: 'LIMIT_REACHED' };
    }

    const benefitId = await this.ensureVariantBenefit(
      assignment.variant.id,
      assignment.variant.issuedBenefitId,
      assignment.businessId,
      definition,
    );

    const expiresAt = new Date(
      now.getTime() + definition.expiresInDays * 86_400_000,
    );
    const timezone = assignment.business?.timezone ?? 'America/Montevideo';
    const lockKey = this.budget.lockKey(assignment.businessId, timezone, now);
    const averageTicketAmount =
      assignment.business?.retentionSettings?.averageTicketAmount ?? null;
    // Fase D §19: a percentage or fixed incentive with no explicit
    // `estimatedCost` is no longer silently treated as free — see
    // `incentive-cost.ts` for the exact priority order.
    const estimatedCostOfThisIssue =
      estimateIncentiveCost(definition, averageTicketAmount)?.cost ?? 0;

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Serialize concurrent issuances for the same business+month so two
        // workers cannot both read "under the cap" and both write. Released on
        // commit — see RetentionBudgetService for why this must happen here,
        // inside the same transaction as the check and the write.
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`,
        );

        const budgetCheck = await this.budget.checkWithinCaps(tx, {
          businessId: assignment.businessId,
          timezone,
          now,
          caps: {
            maxAutomatedIncentivesPerMonth:
              assignment.business?.retentionSettings
                ?.maxAutomatedIncentivesPerMonth ?? null,
            maxEstimatedIncentiveCostPerMonth:
              assignment.business?.retentionSettings
                ?.maxEstimatedIncentiveCostPerMonth ?? null,
          },
          estimatedCostOfThisIssue,
          averageTicketAmount,
        });

        if (!budgetCheck.allowed) {
          return { status: 'skipped' as const, reason: budgetCheck.reasonCode };
        }

        const participation = await tx.benefitParticipation.upsert({
          where: {
            benefitId_customerId: {
              benefitId,
              customerId: assignment.customerId,
            },
          },
          create: {
            benefitId,
            businessId: assignment.businessId,
            customerId: assignment.customerId,
            redemptionCode: generateRedemptionCode(),
            expiresAt,
          },
          update: {},
          select: { id: true, redemptionCode: true, expiresAt: true },
        });

        // The unique constraint on benefitParticipationId is what makes a
        // concurrent second issue fail instead of duplicating.
        await tx.retentionAssignment.update({
          where: { id: assignment.id },
          data: { benefitParticipationId: participation.id },
        });

        return {
          status: 'issued' as const,
          participationId: participation.id,
          code: participation.redemptionCode!,
          expiresAt: participation.expiresAt ?? expiresAt,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.retentionAssignment.findUnique({
          where: { id: assignment.id },
          select: { benefitParticipationId: true },
        });
        if (existing?.benefitParticipationId) {
          return {
            status: 'already_issued',
            participationId: existing.benefitParticipationId,
          };
        }
      }
      throw error;
    }
  }

  /**
   * The variant's carrier Benefit, created on first use.
   *
   * Deliberately `active: false` — see the class comment. It exists to give the
   * existing BenefitParticipation/redemption machinery something to hang off.
   */
  private async ensureVariantBenefit(
    variantId: string,
    existingBenefitId: string | null,
    businessId: string,
    definition: {
      name: string;
      description: string | null;
      conditions: string | null;
      type: Prisma.BenefitCreateInput['type'];
    },
  ): Promise<string> {
    if (existingBenefitId) return existingBenefitId;

    const benefit = await this.prisma.benefit.create({
      data: {
        businessId,
        type: definition.type,
        title: definition.name,
        description: definition.description,
        terms: definition.conditions,
        // Never active: the QR flow's single-active-benefit slot stays free.
        active: false,
      },
      select: { id: true },
    });

    await this.prisma.retentionVariant.update({
      where: { id: variantId },
      data: { issuedBenefitId: benefit.id },
    });

    return benefit.id;
  }

  /** Enforces the owner's configured usage caps. */
  private async withinLimits(
    assignment: { businessId: string; customerId: string },
    definition: {
      id: string;
      maxRedemptionsPerCustomer: number | null;
      maxTotalRedemptions: number | null;
    },
  ): Promise<boolean> {
    if (
      definition.maxRedemptionsPerCustomer === null &&
      definition.maxTotalRedemptions === null
    ) {
      return true;
    }

    // Redemptions are counted through the variants that carry this definition,
    // so the cap follows the incentive rather than one experiment.
    const where: Prisma.BenefitParticipationWhereInput = {
      businessId: assignment.businessId,
      redeemedAt: { not: null },
      benefit: { retentionVariant: { incentiveDefinitionId: definition.id } },
    };

    if (definition.maxTotalRedemptions !== null) {
      const total = await this.prisma.benefitParticipation.count({ where });
      if (total >= definition.maxTotalRedemptions) return false;
    }

    if (definition.maxRedemptionsPerCustomer !== null) {
      const perCustomer = await this.prisma.benefitParticipation.count({
        where: { ...where, customerId: assignment.customerId },
      });
      if (perCustomer >= definition.maxRedemptionsPerCustomer) return false;
    }

    return true;
  }
}

/** Same unambiguous alphabet the QR redemption codes use. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateRedemptionCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return code;
}
