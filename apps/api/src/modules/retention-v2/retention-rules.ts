/**
 * Every threshold the Retention Engine V2 uses, in one place.
 *
 * Nothing in this engine may hardcode a magic number elsewhere: if a rule needs
 * a constant it belongs here, with the reasoning next to it. That is what makes
 * the segmentation auditable and lets a business or vertical override it later
 * without hunting through services.
 */

/** Visit counts at which we trust progressively stronger signals. */
export const VISIT_THRESHOLDS = {
  /** Exactly this many visits → the customer is still a first-timer. */
  FIRST_VISIT_ONLY: 1,
  /**
   * From this many visits on, the customer's own cadence is statistically
   * usable. With 3 visits there are 2 intervals — enough for a median that is
   * not just a single observation.
   */
  MIN_VISITS_FOR_INDIVIDUAL_CADENCE: 3,
  /**
   * From this many visits on we call somebody FREQUENT, provided they are not
   * currently drifting away.
   */
  MIN_VISITS_FOR_FREQUENT: 4,
} as const;

/**
 * Multipliers applied to a customer's own typical interval.
 *
 * Someone who comes every 7 days is late at 10.5 days and gone at 21 — while
 * someone who comes every 60 days is not late until 90. This is the whole point
 * of learning cadence per customer instead of using one global "30 days".
 */
export const CADENCE_MULTIPLIERS = {
  /** typicalInterval × this → drifting from their pattern (AT_RISK). */
  AT_RISK: 1.5,
  /** typicalInterval × this → clearly gone (INACTIVE). */
  INACTIVE: 3,
} as const;

/**
 * Fallback windows in days, used when the customer has too little history for
 * their own cadence to mean anything. Deliberately conservative: it is better
 * to contact somebody a bit late than to pester a customer who was never a
 * regular in the first place.
 */
export const FALLBACK_DAYS = {
  /** One visit only: window in which a second visit would be normal. */
  SECOND_VISIT_EXPECTED: 21,
  /** One visit only: past this, the first-timer is treated as lost. */
  SECOND_VISIT_INACTIVE: 60,
  /** Two visits: weak signal, so wider windows than the individual cadence. */
  WEAK_SIGNAL_AT_RISK: 45,
  WEAK_SIGNAL_INACTIVE: 90,
} as const;

/**
 * Bounds applied to a learned cadence before it is used, so one pathological
 * history cannot produce absurd windows (e.g. two visits an hour apart implying
 * a customer is "at risk" the same afternoon).
 */
export const CADENCE_BOUNDS = {
  MIN_TYPICAL_INTERVAL_DAYS: 3,
  MAX_TYPICAL_INTERVAL_DAYS: 180,
} as const;

/**
 * Window used to decide whether an intervention "recovered" a customer: a
 * return this long after being contacted still counts as recovered.
 */
export const RECOVERY_WINDOW_DAYS = 30;
