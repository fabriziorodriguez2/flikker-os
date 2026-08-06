import { Injectable, Logger } from '@nestjs/common';
import {
  CustomerSegment,
  ExperienceVersion,
  RetentionStrategyType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { computeVisitFrequency } from './visit-frequency';
import { segmentCustomer } from './segmentation';
import { evaluateEligibility } from './eligibility';
import { pickVariant } from './allocation';
import { RetentionAssignmentService } from './retention-assignment.service';
import { RetentionSettingsService } from './retention-settings.service';
import { RetentionExperimentService } from './retention-experiment.service';
import {
  DECISION_CODES,
  decisionCodeForRejection,
  RetentionDecisionLogService,
} from './retention-decision-log.service';

const INCENTIVE_STRATEGIES: RetentionStrategyType[] = [
  RetentionStrategyType.SOFT_BENEFIT,
  RetentionStrategyType.STRONG_BENEFIT,
];

/**
 * Recruitment pass: works out who is drifting away and enrols them into a
 * running experiment. It never sends anything — that is the send worker's job,
 * which re-validates everything first.
 *
 * Splitting the two matters: recruitment is a slow analytical sweep over all
 * customers, while sending is per-customer, retryable and time-sensitive.
 */
@Injectable()
export class RetentionV2EvaluateService {
  private readonly logger = new Logger(RetentionV2EvaluateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: RetentionSettingsService,
    private readonly experiments: RetentionExperimentService,
    private readonly assignments: RetentionAssignmentService,
    private readonly decisions: RetentionDecisionLogService,
  ) {}

  /** Businesses this engine owns. The mirror image of the legacy exclusion. */
  private findOwnedBusinesses() {
    return this.prisma.business.findMany({
      where: {
        isActive: true,
        experienceVersion: ExperienceVersion.CHECKIN_V2,
        retentionEngineV2Enabled: true,
      },
      select: {
        id: true,
        isActive: true,
        experienceVersion: true,
        retentionEngineV2Enabled: true,
      },
    });
  }

  async runDaily(now: Date = new Date()) {
    const startedAt = Date.now();
    const businesses = await this.findOwnedBusinesses();
    let assigned = 0;
    let dryRunCandidates = 0;

    for (const business of businesses) {
      try {
        const result = await this.evaluateBusiness(business, now);
        assigned += result.assigned;
        dryRunCandidates += result.dryRunCandidates;
      } catch (error) {
        // One broken business must not stop the sweep for the others.
        this.logger.error(
          `Retention V2 evaluation failed for business ${business.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const ms = Date.now() - startedAt;
    this.logger.log(
      `Retention V2 evaluate businesses=${businesses.length} assigned=${assigned} dryRunCandidates=${dryRunCandidates} ${ms}ms`,
    );
    return { businesses: businesses.length, assigned, dryRunCandidates, ms };
  }

  private async evaluateBusiness(
    business: {
      id: string;
      isActive: boolean;
      experienceVersion: ExperienceVersion;
      retentionEngineV2Enabled: boolean;
    },
    now: Date,
  ): Promise<{ assigned: number; dryRunCandidates: number }> {
    const settings = await this.settings.getOrCreate(business.id);
    const none = { assigned: 0, dryRunCandidates: 0 };
    if (!settings.automaticCampaignsEnabled) return none;

    const running = await this.experiments.findUsableRunning(business.id);
    if (running.length === 0) return none;

    const customers = await this.prisma.customer.findMany({
      where: { businessId: business.id, isActive: true, optedOut: false },
      select: {
        id: true,
        name: true,
        isActive: true,
        optedOut: true,
        phoneE164: true,
        visits: { select: { occurredAt: true } },
      },
    });

    let assigned = 0;
    let dryRunCandidates = 0;

    for (const customer of customers) {
      const frequency = computeVisitFrequency(
        customer.visits.map((v) => v.occurredAt),
        now,
      );
      const lastInterventionAt = await this.lastInterventionAt(customer.id);
      const { segment } = segmentCustomer({
        frequency,
        lastInterventionAt,
        now,
      });

      const experiment = this.experiments.resolveApplicable(running, segment);
      if (!experiment) continue; // Healthy, or nothing recruiting this segment.

      const [alreadyAssigned, messagesLast30Days] = await Promise.all([
        this.isAssigned(experiment.id, customer.id),
        this.retentionMessagesLast30Days(customer.id, now),
      ]);

      const eligibility = evaluateEligibility({
        business,
        settings,
        customer,
        segment,
        lastRetentionMessageAt: lastInterventionAt,
        retentionMessagesLast30Days: messagesLast30Days,
        alreadyAssigned,
        // Recruitment looks at current state; the send step re-checks whether a
        // return happened in between.
        returnedSinceEvaluation: false,
        now,
      });

      if (!eligibility.eligible) {
        // ALREADY_ASSIGNED is the normal steady state — logging it every day
        // for every enrolled customer would drown the audit trail.
        if (eligibility.reasonCode !== 'ALREADY_ASSIGNED') {
          await this.decisions.record({
            businessId: business.id,
            customerId: customer.id,
            decisionCode: decisionCodeForRejection(eligibility.reasonCode),
            metadata: { segment, reasonCode: eligibility.reasonCode },
          });
        }
        continue;
      }

      // Pilot mode (Fase C.5 §8): simulate the same recruitment decision
      // without ever creating a RetentionAssignment row. This matters beyond
      // "don't send anything" — a real row would permanently consume this
      // customer's unique (experimentId, customerId) slot while the owner is
      // only supposed to be observing, which would make live recruitment
      // impossible once dry run is switched off.
      if (settings.dryRunEnabled) {
        const variant = pickVariant(
          experiment.id,
          customer.id,
          experiment.variants,
        );
        if (!variant) continue; // Nothing to allocate to — same as a real skip.

        dryRunCandidates += 1;
        const isControl =
          variant.strategyType === RetentionStrategyType.CONTROL;
        const carriesIncentive = INCENTIVE_STRATEGIES.includes(
          variant.strategyType,
        );
        await this.decisions.record({
          businessId: business.id,
          customerId: customer.id,
          decisionCode: isControl
            ? DECISION_CODES.DRY_RUN_WOULD_CONTROL
            : carriesIncentive
              ? DECISION_CODES.DRY_RUN_WOULD_OFFER_INCENTIVE
              : DECISION_CODES.DRY_RUN_WOULD_SEND,
          metadata: {
            segment,
            experimentId: experiment.id,
            variantId: variant.id,
            strategyType: variant.strategyType,
          },
        });
        continue;
      }

      const outcome = await this.assignments.assign({
        experimentId: experiment.id,
        businessId: business.id,
        customerId: customer.id,
        segment,
        frequency,
      });

      if (outcome.status === 'assigned') {
        assigned += 1;
        await this.decisions.record({
          businessId: business.id,
          customerId: customer.id,
          assignmentId: outcome.assignmentId,
          decisionCode: DECISION_CODES.ASSIGNED,
          metadata: {
            segment,
            experimentId: experiment.id,
            strategyType: outcome.strategyType,
            daysSinceLastVisit: frequency.daysSinceLastVisit,
            typicalIntervalDays: frequency.typicalIntervalDays,
          },
        });
      }
    }

    return { assigned, dryRunCandidates };
  }

  private async isAssigned(
    experimentId: string,
    customerId: string,
  ): Promise<boolean> {
    const existing = await this.prisma.retentionAssignment.findUnique({
      where: { experimentId_customerId: { experimentId, customerId } },
      select: { id: true },
    });
    return existing !== null;
  }

  /** When the engine last actually contacted this customer. */
  private async lastInterventionAt(customerId: string): Promise<Date | null> {
    const last = await this.prisma.retentionAssignment.findFirst({
      where: { customerId, sentAt: { not: null } },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true },
    });
    return last?.sentAt ?? null;
  }

  private async retentionMessagesLast30Days(
    customerId: string,
    now: Date,
  ): Promise<number> {
    return this.prisma.retentionAssignment.count({
      where: {
        customerId,
        sentAt: { gte: new Date(now.getTime() - 30 * 86_400_000) },
      },
    });
  }
}

/** Segments the engine will consider recruiting. Exported for tests/docs. */
export const RECRUITABLE_SEGMENTS: CustomerSegment[] = [
  CustomerSegment.NEW,
  CustomerSegment.AT_RISK,
  CustomerSegment.INACTIVE,
];
