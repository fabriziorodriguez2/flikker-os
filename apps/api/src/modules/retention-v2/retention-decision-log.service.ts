import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Audit trail for automatic decisions: every "why was this customer contacted /
 * skipped?" must have a stored answer.
 *
 * Structured inputs and stable codes only — never free-form reasoning.
 */
export const DECISION_CODES = {
  ELIGIBLE: 'ELIGIBLE',
  ASSIGNED: 'ASSIGNED',
  CONTROL_ACTIVE: 'CONTROL_ACTIVE',
  SKIPPED_RETURNED: 'SKIPPED_RETURNED',
  SKIPPED_OPT_OUT: 'SKIPPED_OPT_OUT',
  SKIPPED_COOLDOWN: 'SKIPPED_COOLDOWN',
  SKIPPED_LIMIT: 'SKIPPED_LIMIT',
  SKIPPED_ENGINE_DISABLED: 'SKIPPED_ENGINE_DISABLED',
  SKIPPED_EXPERIMENT_NOT_RUNNING: 'SKIPPED_EXPERIMENT_NOT_RUNNING',
  SKIPPED_OUTSIDE_WINDOW: 'SKIPPED_OUTSIDE_WINDOW',
  SKIPPED_NO_EXPERIMENT: 'SKIPPED_NO_EXPERIMENT',
  SKIPPED_INCENTIVE_UNAVAILABLE: 'SKIPPED_INCENTIVE_UNAVAILABLE',
  SKIPPED_MONTHLY_INCENTIVE_LIMIT: 'SKIPPED_MONTHLY_INCENTIVE_LIMIT',
  SKIPPED_MONTHLY_BUDGET_LIMIT: 'SKIPPED_MONTHLY_BUDGET_LIMIT',
  INCENTIVE_ISSUED: 'INCENTIVE_ISSUED',
  MESSAGE_QUEUED: 'MESSAGE_QUEUED',
  MESSAGE_FAILED: 'MESSAGE_FAILED',
  // Dry run: mirrors the live codes above one-to-one, so a pilot's report can
  // be produced with the exact same aggregation query used once sending is on.
  DRY_RUN_WOULD_ASSIGN: 'DRY_RUN_WOULD_ASSIGN',
  DRY_RUN_WOULD_CONTROL: 'DRY_RUN_WOULD_CONTROL',
  DRY_RUN_WOULD_SEND: 'DRY_RUN_WOULD_SEND',
  DRY_RUN_WOULD_OFFER_INCENTIVE: 'DRY_RUN_WOULD_OFFER_INCENTIVE',
  DRY_RUN_WOULD_SKIP: 'DRY_RUN_WOULD_SKIP',
  // Fase D — outcome detection. OUTCOME_RETURNED and OUTCOME_CONFIRMED are the
  // two ways `returned: true` is discovered (unconfirmed vs. redemption-backed).
  // OUTCOME_WINDOW_CLOSED is fired when the window closes with nothing found
  // (`returned: false`). OUTCOME_NO_RETURN is reserved for a future, more
  // granular "closed early for an explicit reason" case — not fired today,
  // where a closed window with no return is exactly OUTCOME_WINDOW_CLOSED.
  OUTCOME_RETURNED: 'OUTCOME_RETURNED',
  OUTCOME_CONFIRMED: 'OUTCOME_CONFIRMED',
  OUTCOME_NO_RETURN: 'OUTCOME_NO_RETURN',
  OUTCOME_WINDOW_CLOSED: 'OUTCOME_WINDOW_CLOSED',
  // Fase E — Reward Goals. REWARD_GOAL_SKIPPED covers every NO_GOAL reason
  // except the steady-state "already has one" (see RewardGoalEngineService,
  // which deliberately does not log that one every day).
  REWARD_GOAL_CREATED: 'REWARD_GOAL_CREATED',
  REWARD_GOAL_SKIPPED: 'REWARD_GOAL_SKIPPED',
  REWARD_GOAL_UNLOCKED: 'REWARD_GOAL_UNLOCKED',
  REWARD_GOAL_REDEEMED: 'REWARD_GOAL_REDEEMED',
  REWARD_GOAL_EXPIRED: 'REWARD_GOAL_EXPIRED',
  // Dry run for the Reward Goal engine (Fase E §32) — mirrors the live codes
  // one-to-one, exactly like Retention V2's own DRY_RUN_* codes.
  DRY_RUN_WOULD_CREATE_REWARD_GOAL: 'DRY_RUN_WOULD_CREATE_REWARD_GOAL',
  // PROGRESS_REMINDER (Fase E §25-27): the one strategy-specific skip reason —
  // the goal that justified the assignment no longer exists as ACTIVE by send
  // time (unlocked/expired/cancelled on its own), so there is nothing left to
  // remind the customer of.
  SKIPPED_NO_ACTIVE_REWARD_GOAL: 'SKIPPED_NO_ACTIVE_REWARD_GOAL',
} as const;

export type DecisionCode = (typeof DECISION_CODES)[keyof typeof DECISION_CODES];

/** Maps an eligibility rejection to the audit code it should be logged under. */
export function decisionCodeForRejection(reasonCode: string): DecisionCode {
  switch (reasonCode) {
    case 'ALREADY_RETURNED':
      return DECISION_CODES.SKIPPED_RETURNED;
    case 'OPTED_OUT':
      return DECISION_CODES.SKIPPED_OPT_OUT;
    case 'COOLDOWN_ACTIVE':
      return DECISION_CODES.SKIPPED_COOLDOWN;
    case 'MONTHLY_LIMIT_REACHED':
      return DECISION_CODES.SKIPPED_LIMIT;
    case 'NOT_CHECKIN_V2':
    case 'ENGINE_DISABLED':
    case 'AUTOMATION_DISABLED':
    case 'BUSINESS_INACTIVE':
      return DECISION_CODES.SKIPPED_ENGINE_DISABLED;
    default:
      // Everything else (inactive customer, no channel, untargetable segment)
      // is still a skip; keeping one bucket avoids inventing codes nobody reads.
      return DECISION_CODES.SKIPPED_ENGINE_DISABLED;
  }
}

export interface DecisionRecord {
  businessId: string;
  customerId?: string | null;
  assignmentId?: string | null;
  decisionCode: DecisionCode;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class RetentionDecisionLogService {
  private readonly logger = new Logger(RetentionDecisionLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appends a decision. Best-effort: the audit trail is observability, so a
   * failure here must never abort a send or leave the engine wedged.
   */
  async record(entry: DecisionRecord): Promise<void> {
    try {
      await this.prisma.retentionDecisionLog.create({
        data: {
          businessId: entry.businessId,
          customerId: entry.customerId ?? null,
          assignmentId: entry.assignmentId ?? null,
          decisionCode: entry.decisionCode,
          metadata: entry.metadata,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Decision log failed (${entry.decisionCode}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
