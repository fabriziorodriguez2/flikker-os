import { Injectable, Logger } from '@nestjs/common';
import { ExperienceVersion } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EXPOSED_STATUSES } from './exposure';
import { resolveOutcome, type OutcomeData } from './outcome-resolution';
import {
  DECISION_CODES,
  RetentionDecisionLogService,
} from './retention-decision-log.service';

/**
 * Closes the experimental loop (Fase D): for every exposed assignment,
 * figures out whether the customer came back within the experiment's
 * attribution window, and records exactly one `RetentionOutcome`.
 *
 * Reuses the existing Visit/attribution machinery rather than re-deriving
 * it: whether a return visit is "post_campaign_checkin" or "organic" was
 * already decided by `VisitsRepository.resolveVisitAttribution` when that
 * visit was created. This service only asks "is there a Visit after
 * exposure, within window?" and copies what that Visit already says.
 */

/**
 * A `returned: true, confirmedByRedemption: false` outcome is re-checked on
 * every pass in case a redemption becomes visible later — but only while its
 * assignment is reasonably recent. Bounding this avoids an ever-growing
 * "recheck everything since the beginning of time" scan; a redemption should
 * realistically show up (if at all) within the incentive's own expiry, which
 * is capped at 90 days (`RetentionIncentiveDefinition.expiresInDays`).
 */
const REPROCESS_WINDOW_DAYS = 120;

@Injectable()
export class RetentionOutcomeService {
  private readonly logger = new Logger(RetentionOutcomeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly decisions: RetentionDecisionLogService,
  ) {}

  /**
   * One sweep: processes up to `limit` assignments that are exposed and not
   * yet finally resolved. Safe to call repeatedly — every write is either a
   * no-op (nothing changed) or an idempotent upsert keyed on `assignmentId`.
   */
  async runOnce(now: Date = new Date(), limit = 500) {
    const assignments = await this.findDueAssignments(now, limit);
    let returned = 0;
    let confirmed = 0;
    let closedNoReturn = 0;
    let stillOpen = 0;

    for (const assignment of assignments) {
      try {
        const outcome = await this.processAssignment(assignment, now);
        if (outcome === 'pending') {
          stillOpen += 1;
        } else if (outcome.returned && outcome.confirmedByRedemption) {
          confirmed += 1;
        } else if (outcome.returned) {
          returned += 1;
        } else {
          closedNoReturn += 1;
        }
      } catch (error) {
        this.logger.error(
          `Outcome processing failed for assignment ${assignment.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    this.logger.log(
      `Retention V2 outcomes processed=${assignments.length} returned=${returned} confirmed=${confirmed} closedNoReturn=${closedNoReturn} stillOpen=${stillOpen}`,
    );
    return {
      processed: assignments.length,
      returned,
      confirmed,
      closedNoReturn,
      stillOpen,
    };
  }

  private findDueAssignments(now: Date, limit: number) {
    const reprocessCutoff = new Date(
      now.getTime() - REPROCESS_WINDOW_DAYS * 86_400_000,
    );

    return this.prisma.retentionAssignment.findMany({
      where: {
        status: { in: EXPOSED_STATUSES },
        exposedAt: { not: null },
        business: {
          isActive: true,
          experienceVersion: ExperienceVersion.CHECKIN_V2,
          retentionEngineV2Enabled: true,
        },
        OR: [
          { outcome: null },
          {
            outcome: { returned: true, confirmedByRedemption: false },
            exposedAt: { gte: reprocessCutoff },
          },
        ],
      },
      select: {
        id: true,
        businessId: true,
        experimentId: true,
        variantId: true,
        customerId: true,
        exposedAt: true,
        benefitParticipationId: true,
        experiment: { select: { attributionWindowDays: true } },
        benefitParticipation: { select: { redeemedAt: true } },
      },
      orderBy: { exposedAt: 'asc' },
      take: limit,
    });
  }

  private async processAssignment(
    assignment: {
      id: string;
      businessId: string;
      experimentId: string;
      variantId: string;
      customerId: string;
      exposedAt: Date | null;
      benefitParticipationId: string | null;
      experiment: { attributionWindowDays: number };
      benefitParticipation: { redeemedAt: Date | null } | null;
    },
    now: Date,
  ): Promise<OutcomeData | 'pending'> {
    // exposedAt is guaranteed non-null by findDueAssignments' filter.
    const exposedAt = assignment.exposedAt!;

    const firstVisit = await this.prisma.visit.findFirst({
      where: {
        businessId: assignment.businessId,
        customerId: assignment.customerId,
        occurredAt: { gt: exposedAt },
      },
      orderBy: { occurredAt: 'asc' },
      select: { id: true, occurredAt: true, attributionType: true },
    });

    const redeemedByNow =
      assignment.benefitParticipation?.redeemedAt != null &&
      assignment.benefitParticipation.redeemedAt <= now;

    const resolution = resolveOutcome({
      exposedAt,
      attributionWindowDays: assignment.experiment.attributionWindowDays,
      now,
      firstVisit,
      redeemedByNow,
    });

    if (resolution.status === 'pending') return 'pending';

    const previous = await this.prisma.retentionOutcome.findUnique({
      where: { assignmentId: assignment.id },
      select: { confirmedByRedemption: true },
    });

    await this.upsert(assignment, resolution.data);
    await this.logTransition(assignment, resolution.data, previous);

    return resolution.data;
  }

  private upsert(
    assignment: {
      id: string;
      businessId: string;
      experimentId: string;
      variantId: string;
      customerId: string;
      benefitParticipationId: string | null;
    },
    data: OutcomeData,
  ) {
    const shared = {
      returned: data.returned,
      returnVisitId: data.returnVisitId,
      returnedAt: data.returnedAt,
      daysToReturn: data.daysToReturn,
      attributionType: data.attributionType,
      confirmedByRedemption: data.confirmedByRedemption,
      observedWithinWindow: data.observedWithinWindow,
    };

    return this.prisma.retentionOutcome.upsert({
      where: { assignmentId: assignment.id },
      create: {
        businessId: assignment.businessId,
        experimentId: assignment.experimentId,
        variantId: assignment.variantId,
        assignmentId: assignment.id,
        customerId: assignment.customerId,
        benefitParticipationId: assignment.benefitParticipationId,
        ...shared,
      },
      update: shared,
    });
  }

  private async logTransition(
    assignment: {
      id: string;
      businessId: string;
      customerId: string;
      variantId: string;
    },
    data: OutcomeData,
    previous: { confirmedByRedemption: boolean } | null,
  ) {
    if (!data.returned) {
      // Nothing was open before that could have already logged this; a
      // false outcome is only ever written once, at window close.
      await this.decisions.record({
        businessId: assignment.businessId,
        customerId: assignment.customerId,
        assignmentId: assignment.id,
        decisionCode: DECISION_CODES.OUTCOME_WINDOW_CLOSED,
        metadata: { variantId: assignment.variantId },
      });
      return;
    }

    const justConfirmed =
      data.confirmedByRedemption && !previous?.confirmedByRedemption;
    const isNew = previous === null;

    // A returned-but-still-unconfirmed outcome that stays unconfirmed on a
    // later pass carries no new information — logging it again would just
    // drown the audit trail with a no-op every worker run.
    if (!isNew && !justConfirmed) return;

    await this.decisions.record({
      businessId: assignment.businessId,
      customerId: assignment.customerId,
      assignmentId: assignment.id,
      decisionCode: data.confirmedByRedemption
        ? DECISION_CODES.OUTCOME_CONFIRMED
        : DECISION_CODES.OUTCOME_RETURNED,
      metadata: {
        variantId: assignment.variantId,
        returnVisitId: data.returnVisitId,
        daysToReturn: data.daysToReturn,
        attributionType: data.attributionType,
      },
    });
  }
}
