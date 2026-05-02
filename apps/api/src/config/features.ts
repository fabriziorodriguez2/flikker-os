export const API_FEATURES = {
  MULTI_LOCAL: false,
  MULTI_USER: false,
  MANUAL_RESPONSES: false,
  REVIEW_TAGS: false,
  QR_ADVANCED: false,
} as const;

export type ApiFeatureName = keyof typeof API_FEATURES;
