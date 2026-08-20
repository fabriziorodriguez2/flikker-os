/**
 * Fase F §27 — one version constant per use case, stored on every
 * AiUsageEvent row. Bump the constant (not the string it names) whenever the
 * system prompt for that use case changes, so usage/quality can be compared
 * across a prompt change later.
 */
export const RETENTION_MESSAGE_PROMPT_VERSION = 'retention-message-v1';
export const PROGRESS_REMINDER_PROMPT_VERSION = 'progress-reminder-v1';
export const REWARD_UNLOCKED_PROMPT_VERSION = 'reward-unlocked-v1';
export const RECOMMENDATION_EXPLANATION_PROMPT_VERSION =
  'recommendation-explanation-v1';
export const WEEKLY_REPORT_SUMMARY_PROMPT_VERSION = 'weekly-report-summary-v1';
export const INSIGHT_EXPLANATION_PROMPT_VERSION = 'insight-explanation-v1';
export const CHATBOT_CLASSIFY_PROMPT_VERSION = 'chatbot-classify-v1';
export const CHATBOT_DATA_ANSWER_PROMPT_VERSION = 'chatbot-data-answer-v1';
