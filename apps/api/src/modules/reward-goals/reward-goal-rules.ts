import { CustomerSegment } from '@prisma/client';

/**
 * Centralized, documented heuristics for how many additional visits a Reward
 * Goal should ask for, by segment (Fase E §9). These are explicitly initial
 * defaults, not dogma — the numbers themselves are the thing most likely to
 * change once real completion-rate data exists (Fase E §34/§36), which is
 * exactly why they live in one small table instead of scattered through the
 * engine.
 *
 * `null` means "this segment never gets an automatic long-horizon goal" —
 * AT_RISK/INACTIVE are the Retention Engine's problem to solve (recovery
 * messaging), not a visible visit-counter's.
 */
export const REWARD_GOAL_TARGET_RANGE: Record<
  CustomerSegment,
  { min: number; max: number } | null
> = {
  // The single most important goal Flikker can create: turn a one-time
  // visitor into someone who has come back at least once.
  NEW: { min: 1, max: 1 },
  // Build the habit — a second small ask right after the first success.
  REPEAT: { min: 2, max: 2 },
  // Already a habit; rewards can afford to be less frequent here.
  FREQUENT: { min: 3, max: 5 },
  AT_RISK: null,
  INACTIVE: null,
  // Just came back from a Retention Engine intervention — a short goal
  // reinforces the win without asking for a new long commitment.
  RECOVERED: { min: 1, max: 2 },
};

/** Stable, auditable reason for why a segment got (or didn't get) a goal. */
export function reasonCodeForSegment(segment: CustomerSegment): string {
  switch (segment) {
    case CustomerSegment.NEW:
      return 'NEW_SECOND_VISIT';
    case CustomerSegment.REPEAT:
      return 'REPEAT_HABIT_BUILDING';
    case CustomerSegment.FREQUENT:
      return 'FREQUENT_LOW_FREQUENCY_REWARD';
    case CustomerSegment.RECOVERED:
      return 'RECOVERED_REINFORCEMENT';
    case CustomerSegment.AT_RISK:
      return 'AT_RISK_DEFERRED_TO_RETENTION_ENGINE';
    case CustomerSegment.INACTIVE:
      return 'INACTIVE_DEFERRED_TO_RETENTION_ENGINE';
  }
}

/**
 * Picks a deterministic target: the segment's own low end, then raised or
 * capped by the owner's optional override range (Fase E §31 — "el engine
 * elige dentro del rango" the owner configured). Always starts from the low
 * end of the segment's own range — a smaller, more achievable ask is the
 * safer default for a brand-new mechanic.
 *
 * A self-contradictory override (min > max) is treated as no override at
 * all, falling back to the segment default — the settings API is where that
 * should be validated and rejected at save time; this function just refuses
 * to act on nonsense rather than producing one.
 */
export function pickTargetAdditionalVisits(
  range: { min: number; max: number },
  overrideMinVisits: number | null,
  overrideMaxVisits: number | null,
): number {
  if (
    overrideMinVisits !== null &&
    overrideMaxVisits !== null &&
    overrideMinVisits > overrideMaxVisits
  ) {
    return range.min;
  }

  let target = range.min;
  if (overrideMinVisits !== null) target = Math.max(target, overrideMinVisits);
  if (overrideMaxVisits !== null) target = Math.min(target, overrideMaxVisits);
  return target;
}

export interface RewardGoalDecisionInput {
  segment: CustomerSegment;
  hasActiveGoal: boolean;
  cooldownActive: boolean;
  /** Already filtered by the caller: active, rewardGoalEligible, valid today, within promised-capacity. */
  eligibleIncentiveIds: string[];
  overrideMinVisits: number | null;
  overrideMaxVisits: number | null;
}

export type RewardGoalDecision =
  | { action: 'NO_GOAL'; reasonCode: string }
  | {
      action: 'CREATE_GOAL';
      incentiveDefinitionId: string;
      targetAdditionalVisits: number;
      reasonCode: string;
    };

/**
 * The determinism Fase E §8 asks for: same inputs, same output, every time —
 * no randomness, no model call. `eligibleIncentiveIds` is sorted before
 * picking so the choice never depends on the order a query happened to
 * return rows in (the same stability rule `pickVariant` already uses).
 */
export function decideRewardGoal(
  input: RewardGoalDecisionInput,
): RewardGoalDecision {
  if (input.hasActiveGoal) {
    return { action: 'NO_GOAL', reasonCode: 'ALREADY_HAS_ACTIVE_GOAL' };
  }
  if (input.cooldownActive) {
    return { action: 'NO_GOAL', reasonCode: 'COOLDOWN_ACTIVE' };
  }

  const range = REWARD_GOAL_TARGET_RANGE[input.segment];
  if (!range) {
    return {
      action: 'NO_GOAL',
      reasonCode: reasonCodeForSegment(input.segment),
    };
  }

  if (input.eligibleIncentiveIds.length === 0) {
    return { action: 'NO_GOAL', reasonCode: 'NO_ELIGIBLE_INCENTIVE' };
  }

  const incentiveDefinitionId = [...input.eligibleIncentiveIds].sort()[0];
  const targetAdditionalVisits = pickTargetAdditionalVisits(
    range,
    input.overrideMinVisits,
    input.overrideMaxVisits,
  );

  return {
    action: 'CREATE_GOAL',
    incentiveDefinitionId,
    targetAdditionalVisits,
    reasonCode: reasonCodeForSegment(input.segment),
  };
}
