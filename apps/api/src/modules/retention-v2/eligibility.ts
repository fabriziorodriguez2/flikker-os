import { CustomerSegment, ExperienceVersion } from '@prisma/client';

/**
 * Whether the engine is allowed to act on a customer right now.
 *
 * A pure decision function: the caller gathers the facts, this decides. That
 * makes every rejection explainable ("why was this customer not contacted?")
 * and lets the same rules run twice — once when recruiting, and again
 * immediately before sending, which is what closes the race where somebody
 * returns between evaluation and delivery.
 */

export interface EligibilityFacts {
  business: {
    isActive: boolean;
    experienceVersion: ExperienceVersion;
    retentionEngineV2Enabled: boolean;
  };
  settings: {
    automaticCampaignsEnabled: boolean;
    minimumDaysBetweenRetentionMessages: number;
    maximumRetentionMessagesPer30Days: number;
  };
  customer: {
    isActive: boolean;
    optedOut: boolean;
    phoneE164: string | null;
  };
  /**
   * `null` means the caller already resolved population eligibility upstream
   * by some other means (Fase pre-piloto: `RetentionV2EvaluateService`'s
   * reward-goal-progress recruitment resolves its population by "has an
   * ACTIVE CustomerRewardGoal", not by segment) — the segment-targetability
   * check below is skipped entirely in that case. Every existing caller
   * keeps passing a real segment and keeps the exact original behavior.
   */
  segment: CustomerSegment | null;
  /** Last Retention V2 message sent to this customer, if any. */
  lastRetentionMessageAt: Date | null;
  /** Retention V2 messages sent to this customer in the last 30 days. */
  retentionMessagesLast30Days: number;
  /** True when the customer already has a live assignment in this experiment. */
  alreadyAssigned: boolean;
  /**
   * True when the customer visited after being recruited. Re-checked right
   * before sending: somebody who already came back must not be chased.
   */
  returnedSinceEvaluation: boolean;
  now: Date;
}

export type EligibilityDecision =
  | { eligible: true }
  | { eligible: false; reasonCode: EligibilityRejection };

export type EligibilityRejection =
  | 'BUSINESS_INACTIVE'
  | 'NOT_CHECKIN_V2'
  | 'ENGINE_DISABLED'
  | 'AUTOMATION_DISABLED'
  | 'CUSTOMER_INACTIVE'
  | 'OPTED_OUT'
  | 'NO_CONTACT_CHANNEL'
  | 'SEGMENT_NOT_TARGETABLE'
  | 'COOLDOWN_ACTIVE'
  | 'MONTHLY_LIMIT_REACHED'
  | 'ALREADY_ASSIGNED'
  | 'ALREADY_RETURNED';

/** Segments the engine may act on. The healthy ones are left alone. */
const TARGETABLE_SEGMENTS: CustomerSegment[] = [
  CustomerSegment.AT_RISK,
  CustomerSegment.INACTIVE,
];

const MS_PER_DAY = 86_400_000;

export function evaluateEligibility(
  facts: EligibilityFacts,
): EligibilityDecision {
  // Kill switch first — cheapest checks, and the ones that must never be
  // bypassed. A legacy business can never reach the engine.
  if (!facts.business.isActive) {
    return { eligible: false, reasonCode: 'BUSINESS_INACTIVE' };
  }
  if (facts.business.experienceVersion !== ExperienceVersion.CHECKIN_V2) {
    return { eligible: false, reasonCode: 'NOT_CHECKIN_V2' };
  }
  if (!facts.business.retentionEngineV2Enabled) {
    return { eligible: false, reasonCode: 'ENGINE_DISABLED' };
  }
  if (!facts.settings.automaticCampaignsEnabled) {
    return { eligible: false, reasonCode: 'AUTOMATION_DISABLED' };
  }

  // Consent and reachability.
  if (!facts.customer.isActive) {
    return { eligible: false, reasonCode: 'CUSTOMER_INACTIVE' };
  }
  if (facts.customer.optedOut) {
    return { eligible: false, reasonCode: 'OPTED_OUT' };
  }
  if (!facts.customer.phoneE164?.trim()) {
    return { eligible: false, reasonCode: 'NO_CONTACT_CHANNEL' };
  }

  if (facts.segment !== null && !TARGETABLE_SEGMENTS.includes(facts.segment)) {
    return { eligible: false, reasonCode: 'SEGMENT_NOT_TARGETABLE' };
  }

  // The customer already came back — chasing them now would be both useless
  // and annoying, and would corrupt the experiment's read.
  if (facts.returnedSinceEvaluation) {
    return { eligible: false, reasonCode: 'ALREADY_RETURNED' };
  }

  if (facts.alreadyAssigned) {
    return { eligible: false, reasonCode: 'ALREADY_ASSIGNED' };
  }

  // Contact pressure limits.
  if (facts.lastRetentionMessageAt) {
    const daysSince =
      (facts.now.getTime() - facts.lastRetentionMessageAt.getTime()) /
      MS_PER_DAY;
    if (daysSince < facts.settings.minimumDaysBetweenRetentionMessages) {
      return { eligible: false, reasonCode: 'COOLDOWN_ACTIVE' };
    }
  }
  if (
    facts.retentionMessagesLast30Days >=
    facts.settings.maximumRetentionMessagesPer30Days
  ) {
    return { eligible: false, reasonCode: 'MONTHLY_LIMIT_REACHED' };
  }

  return { eligible: true };
}
