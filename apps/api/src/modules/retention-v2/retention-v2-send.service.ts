import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  MessageChannel,
  MessageStatus,
  Prisma,
  RetentionAssignmentStatus,
  RetentionObjective,
  RetentionStrategyType,
  RewardGoalStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { evaluateEligibility } from './eligibility';
import { buildRetentionMessage } from './message-templates';
import { IncentiveIssuerService } from './incentive-issuer.service';
import { RetentionSettingsService } from './retention-settings.service';
import { RetentionExperimentService } from './retention-experiment.service';
import {
  DECISION_CODES,
  decisionCodeForRejection,
  RetentionDecisionLogService,
  type DecisionCode,
} from './retention-decision-log.service';

/**
 * Sends (or deliberately does not send) one assignment.
 *
 * Everything is re-validated here, not just at recruitment: hours can pass
 * between being recruited and being processed, and in that window the customer
 * may have returned, opted out, or the owner may have switched the engine off.
 * Acting on stale eligibility is exactly how an automated system becomes
 * annoying.
 *
 * Sending reuses the existing pipeline — a `Message` row picked up by the
 * WhatsApp worker — so quotas, delivery tracking and opt-out all keep working.
 * There is no second sender.
 */

export type SendOutcome =
  | { status: 'sent'; messageId: string; benefitIssued: boolean }
  | { status: 'control' }
  | { status: 'skipped'; reasonCode: string }
  | { status: 'already_processed' };

@Injectable()
export class RetentionV2SendService {
  private readonly logger = new Logger(RetentionV2SendService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: RetentionSettingsService,
    private readonly experiments: RetentionExperimentService,
    private readonly issuer: IncentiveIssuerService,
    private readonly decisions: RetentionDecisionLogService,
  ) {}

  async processAssignment(
    assignmentId: string,
    now: Date = new Date(),
  ): Promise<SendOutcome> {
    const assignment = await this.prisma.retentionAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        business: true,
        customer: true,
        experiment: true,
        variant: { include: { incentiveDefinition: true } },
      },
    });

    if (!assignment) return { status: 'skipped', reasonCode: 'NOT_FOUND' };

    // Terminal states are never reprocessed — this is the first idempotency
    // gate, before any work is done.
    if (assignment.status !== RetentionAssignmentStatus.PENDING) {
      return { status: 'already_processed' };
    }

    const settings = await this.settings.getOrCreate(assignment.businessId);

    // ── Re-validation ────────────────────────────────────────────────────────
    const experimentRunning = await this.experiments.isRunning(
      assignment.experimentId,
    );
    if (!experimentRunning) {
      return this.skip(
        assignment,
        'EXPERIMENT_NOT_RUNNING',
        DECISION_CODES.SKIPPED_EXPERIMENT_NOT_RUNNING,
      );
    }

    const [returnedSince, lastRetentionMessageAt, messagesLast30Days] =
      await Promise.all([
        this.hasReturnedSince(
          assignment.businessId,
          assignment.customerId,
          assignment.assignedAt,
        ),
        this.lastRetentionMessageAt(assignment.customerId, assignment.id),
        this.retentionMessagesLast30Days(assignment.customerId, now),
      ]);

    const eligibility = evaluateEligibility({
      business: assignment.business,
      settings,
      customer: assignment.customer,
      segment: assignment.segmentAtAssignment,
      lastRetentionMessageAt,
      retentionMessagesLast30Days: messagesLast30Days,
      // Already recruited by definition — this check belongs to recruitment.
      alreadyAssigned: false,
      returnedSinceEvaluation: returnedSince,
      now,
    });

    if (!eligibility.eligible) {
      return this.skip(
        assignment,
        eligibility.reasonCode,
        decisionCodeForRejection(eligibility.reasonCode),
      );
    }

    // ── CONTROL: a real participant that receives nothing ────────────────────
    if (assignment.variant.strategyType === RetentionStrategyType.CONTROL) {
      await this.prisma.retentionAssignment.update({
        where: { id: assignment.id },
        data: {
          status: RetentionAssignmentStatus.OBSERVING,
          sentAt: null,
          // The moment this customer was confirmed into CONTROL — the outcome
          // worker measures its observation window from here.
          exposedAt: now,
        },
      });
      await this.decisions.record({
        businessId: assignment.businessId,
        customerId: assignment.customerId,
        assignmentId: assignment.id,
        decisionCode: DECISION_CODES.CONTROL_ACTIVE,
        metadata: { experimentId: assignment.experimentId },
      });
      return { status: 'control' };
    }

    // Outside the owner's sending window: leave it PENDING so the next run can
    // pick it up, rather than burning the assignment.
    if (
      !this.settings.isWithinSendingWindow(
        settings,
        assignment.business.timezone,
        now,
      )
    ) {
      await this.decisions.record({
        businessId: assignment.businessId,
        customerId: assignment.customerId,
        assignmentId: assignment.id,
        decisionCode: DECISION_CODES.SKIPPED_OUTSIDE_WINDOW,
      });
      return { status: 'skipped', reasonCode: 'OUTSIDE_SENDING_WINDOW' };
    }

    // ── PROGRESS_REMINDER: reminds progress that already existed ─────────────
    // Never issues anything and never consumes the incentive budget (Fase E
    // §25) — it is a read of a goal the Reward Goal engine created from an
    // actual Visit, never manufactured here to justify sending (Fase E §27).
    if (
      assignment.variant.strategyType ===
      RetentionStrategyType.PROGRESS_REMINDER
    ) {
      return this.sendProgressReminder(assignment, now);
    }

    // ── Incentive, when the variant carries one ──────────────────────────────
    const carriesIncentive =
      assignment.variant.strategyType === RetentionStrategyType.SOFT_BENEFIT ||
      assignment.variant.strategyType === RetentionStrategyType.STRONG_BENEFIT;

    let incentiveLabel: string | null = null;
    let expiresInDays: number | null = null;
    let benefitIssued = false;

    if (carriesIncentive) {
      const issued = await this.issuer.issueForAssignment(assignment.id, now);
      if (issued.status === 'skipped') {
        // Never promise something that could not be handed over.
        return this.skip(
          assignment,
          `INCENTIVE_${issued.reason}`,
          issued.reason === 'MONTHLY_INCENTIVE_LIMIT'
            ? DECISION_CODES.SKIPPED_MONTHLY_INCENTIVE_LIMIT
            : issued.reason === 'MONTHLY_BUDGET_LIMIT'
              ? DECISION_CODES.SKIPPED_MONTHLY_BUDGET_LIMIT
              : DECISION_CODES.SKIPPED_INCENTIVE_UNAVAILABLE,
        );
      }
      benefitIssued = issued.status === 'issued';
      incentiveLabel = assignment.variant.incentiveDefinition?.name ?? null;
      expiresInDays =
        assignment.variant.incentiveDefinition?.expiresInDays ?? null;

      if (benefitIssued) {
        await this.decisions.record({
          businessId: assignment.businessId,
          customerId: assignment.customerId,
          assignmentId: assignment.id,
          decisionCode: DECISION_CODES.INCENTIVE_ISSUED,
          metadata: {
            incentiveDefinitionId:
              assignment.variant.incentiveDefinitionId ?? null,
          },
        });
      }
    }

    // ── Message ──────────────────────────────────────────────────────────────
    const body = buildRetentionMessage({
      customerName: assignment.customer.name,
      businessName: assignment.business.name,
      objective: assignment.experiment.objective,
      strategyType: assignment.variant.strategyType,
      incentiveLabel,
      expiresInDays,
    });

    return this.sendMessageBody(assignment, body, now, benefitIssued);
  }

  /**
   * The PROGRESS_REMINDER branch: reads the customer's current ACTIVE
   * CustomerRewardGoal — never creating or modifying one — and sends a
   * message about it exactly like any other variant. If no ACTIVE goal
   * exists (it was unlocked, expired or cancelled on its own between
   * recruitment and send), there is nothing left to remind the customer of,
   * so this skips rather than sending a stale "you're 1 away" about a goal
   * that no longer applies.
   */
  private async sendProgressReminder(
    assignment: {
      id: string;
      businessId: string;
      customerId: string;
      variantId: string;
      experimentId: string;
      business: { name: string; timezone: string };
      customer: { name: string | null };
      variant: { strategyType: RetentionStrategyType };
    },
    now: Date,
  ): Promise<SendOutcome> {
    const goal = await this.prisma.customerRewardGoal.findFirst({
      where: {
        businessId: assignment.businessId,
        customerId: assignment.customerId,
        status: RewardGoalStatus.ACTIVE,
      },
      select: {
        activatedAt: true,
        targetAdditionalVisits: true,
        incentiveDefinition: { select: { name: true } },
      },
    });
    if (!goal) {
      return this.skip(
        assignment,
        'NO_ACTIVE_REWARD_GOAL',
        DECISION_CODES.SKIPPED_NO_ACTIVE_REWARD_GOAL,
      );
    }

    const progressVisits = await this.prisma.visit.count({
      where: {
        businessId: assignment.businessId,
        customerId: assignment.customerId,
        occurredAt: { gt: goal.activatedAt },
      },
    });
    // Floored at 1: if progress had already reached target, the goal would
    // no longer be ACTIVE (see RewardGoalUnlockService) — this only guards
    // against a narrow race with a concurrent check-in.
    const remainingVisits = Math.max(
      1,
      goal.targetAdditionalVisits - progressVisits,
    );

    const body = buildRetentionMessage({
      customerName: assignment.customer.name,
      businessName: assignment.business.name,
      objective: RetentionObjective.AT_RISK_RECOVERY, // unused by this branch's copy
      strategyType: RetentionStrategyType.PROGRESS_REMINDER,
      incentiveLabel: null,
      expiresInDays: null,
      progressReminder: {
        remainingVisits,
        rewardName: goal.incentiveDefinition.name,
      },
    });

    return this.sendMessageBody(assignment, body, now, false);
  }

  /**
   * Common tail of every sendable variant (REMINDER, SOFT/STRONG_BENEFIT,
   * PROGRESS_REMINDER): create the Message, log MESSAGE_QUEUED, or log
   * MESSAGE_FAILED and skip without throwing — a delivery failure must never
   * take down the worker.
   */
  private async sendMessageBody(
    assignment: {
      id: string;
      businessId: string;
      customerId: string;
      variantId: string;
      experimentId: string;
      variant: { strategyType: RetentionStrategyType };
    },
    body: string,
    now: Date,
    benefitIssued: boolean,
  ): Promise<SendOutcome> {
    try {
      const messageId = await this.createMessage(assignment.id, {
        businessId: assignment.businessId,
        customerId: assignment.customerId,
        body,
        now,
      });

      await this.decisions.record({
        businessId: assignment.businessId,
        customerId: assignment.customerId,
        assignmentId: assignment.id,
        decisionCode: DECISION_CODES.MESSAGE_QUEUED,
        metadata: {
          experimentId: assignment.experimentId,
          variantId: assignment.variantId,
          strategyType: assignment.variant.strategyType,
        },
      });

      return { status: 'sent', messageId, benefitIssued };
    } catch (error) {
      await this.decisions.record({
        businessId: assignment.businessId,
        customerId: assignment.customerId,
        assignmentId: assignment.id,
        decisionCode: DECISION_CODES.MESSAGE_FAILED,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      this.logger.warn(
        `Retention V2 message failed for assignment ${assignment.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { status: 'skipped', reasonCode: 'MESSAGE_FAILED' };
    }
  }

  /**
   * Creates the queued Message and attaches it to the assignment in one
   * transaction.
   *
   * `assignment.messageId` is unique, so two concurrent runs cannot both
   * attach: the loser's transaction rolls back — including its Message — and it
   * reads the winner's instead. That is what guarantees at most one message.
   */
  private async createMessage(
    assignmentId: string,
    input: {
      businessId: string;
      customerId: string;
      body: string;
      now: Date;
    },
  ): Promise<string> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const message = await tx.message.create({
          data: {
            businessId: input.businessId,
            customerId: input.customerId,
            channel: MessageChannel.whatsapp,
            trackingToken: randomBytes(8).toString('base64url'),
            status: MessageStatus.queued,
          },
          select: { id: true },
        });

        await tx.retentionAssignment.update({
          where: { id: assignmentId },
          data: {
            messageId: message.id,
            status: RetentionAssignmentStatus.SENT,
            sentAt: input.now,
            exposedAt: input.now,
          },
        });

        return message.id;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.retentionAssignment.findUnique({
          where: { id: assignmentId },
          select: { messageId: true },
        });
        if (existing?.messageId) return existing.messageId;
      }
      throw error;
    }
  }

  /** Marks the assignment skipped and records why. */
  private async skip(
    assignment: { id: string; businessId: string; customerId: string },
    reasonCode: string,
    decisionCode: DecisionCode,
  ): Promise<SendOutcome> {
    await this.prisma.retentionAssignment.update({
      where: { id: assignment.id },
      data: {
        status: RetentionAssignmentStatus.SKIPPED,
        skipReason: reasonCode,
      },
    });
    await this.decisions.record({
      businessId: assignment.businessId,
      customerId: assignment.customerId,
      assignmentId: assignment.id,
      decisionCode,
      metadata: { reasonCode },
    });
    return { status: 'skipped', reasonCode };
  }

  /** A visit after recruitment means the customer came back on their own. */
  private async hasReturnedSince(
    businessId: string,
    customerId: string,
    since: Date,
  ): Promise<boolean> {
    const visit = await this.prisma.visit.findFirst({
      where: { businessId, customerId, occurredAt: { gt: since } },
      select: { id: true },
    });
    return visit !== null;
  }

  /**
   * Last Retention V2 message to this customer, excluding the current
   * assignment's own (there is none yet, but a retry must not see itself).
   */
  private async lastRetentionMessageAt(
    customerId: string,
    excludeAssignmentId: string,
  ): Promise<Date | null> {
    const previous = await this.prisma.retentionAssignment.findFirst({
      where: {
        customerId,
        id: { not: excludeAssignmentId },
        sentAt: { not: null },
      },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true },
    });
    return previous?.sentAt ?? null;
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
