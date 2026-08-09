/**
 * Fase F §7 — explicit use cases, never one generic "askAI()". Each one gets
 * its own budget accounting (AiUsageEvent.useCase), its own prompt version
 * constant, and its own request/response shape. A new use case is always a
 * new constant here, never a parameter that changes what an existing one
 * means.
 *
 * Two of these (`INSIGHT_EXPLANATION`, `WEEKLY_REPORT_SUMMARY`) are defined
 * but not wired to a live service in this phase: the deterministic
 * Intelligence Layer / Weekly Report they would explain do not exist yet in
 * this repo (see the Fase F report's "Qué NO se implementó"). Defining the
 * constant now costs nothing and avoids a rename later.
 */
export const AI_USE_CASES = {
  RETENTION_MESSAGE: 'RETENTION_MESSAGE',
  PROGRESS_REMINDER_MESSAGE: 'PROGRESS_REMINDER_MESSAGE',
  REWARD_UNLOCKED_MESSAGE: 'REWARD_UNLOCKED_MESSAGE',
  INSIGHT_EXPLANATION: 'INSIGHT_EXPLANATION',
  RECOMMENDATION_EXPLANATION: 'RECOMMENDATION_EXPLANATION',
  WEEKLY_REPORT_SUMMARY: 'WEEKLY_REPORT_SUMMARY',
} as const;

export type AiUseCase = (typeof AI_USE_CASES)[keyof typeof AI_USE_CASES];

/** Use cases that produce customer-facing message copy (vs. owner-facing explanations). */
export const MESSAGE_USE_CASES: AiUseCase[] = [
  AI_USE_CASES.RETENTION_MESSAGE,
  AI_USE_CASES.PROGRESS_REMINDER_MESSAGE,
  AI_USE_CASES.REWARD_UNLOCKED_MESSAGE,
];
