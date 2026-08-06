import { CustomerSegment } from '@prisma/client';
import {
  CADENCE_MULTIPLIERS,
  FALLBACK_DAYS,
  RECOVERY_WINDOW_DAYS,
  VISIT_THRESHOLDS,
} from './retention-rules';
import type { VisitFrequency } from './visit-frequency';

/**
 * Behavioural segmentation, computed from visit history — never stored as the
 * source of truth, so it can't silently go stale. Callers may snapshot the
 * result onto an assignment when a report has to stay reproducible.
 */

export interface SegmentationInput {
  frequency: VisitFrequency;
  /**
   * When the customer was last contacted by a Retention V2 intervention, if
   * ever. Used only to tell RECOVERED apart from an ordinary return.
   */
  lastInterventionAt?: Date | null;
  now: Date;
}

export interface SegmentationResult {
  segment: CustomerSegment;
  /**
   * Stable machine-readable reason for the decision. Logged for auditability —
   * "why was this customer contacted?" must always have an answer.
   */
  reasonCode: string;
  /** Days of absence beyond which this customer would be considered at risk. */
  atRiskThresholdDays: number;
  /** Days of absence beyond which this customer would be considered inactive. */
  inactiveThresholdDays: number;
}

const MS_PER_DAY = 86_400_000;

/**
 * Resolves the absence thresholds for a customer.
 *
 * Three regimes, by how much history exists:
 *  - 3+ visits  → the customer's own median interval, scaled.
 *  - 2 visits   → weak signal: fixed, wider fallback windows.
 *  - 1 visit    → the "second visit" problem, which is its own thing.
 */
export function resolveThresholds(frequency: VisitFrequency): {
  atRiskThresholdDays: number;
  inactiveThresholdDays: number;
} {
  if (frequency.hasReliableCadence && frequency.typicalIntervalDays !== null) {
    return {
      atRiskThresholdDays: Math.round(
        frequency.typicalIntervalDays * CADENCE_MULTIPLIERS.AT_RISK,
      ),
      inactiveThresholdDays: Math.round(
        frequency.typicalIntervalDays * CADENCE_MULTIPLIERS.INACTIVE,
      ),
    };
  }

  if (frequency.visitCount === VISIT_THRESHOLDS.FIRST_VISIT_ONLY) {
    return {
      atRiskThresholdDays: FALLBACK_DAYS.SECOND_VISIT_EXPECTED,
      inactiveThresholdDays: FALLBACK_DAYS.SECOND_VISIT_INACTIVE,
    };
  }

  return {
    atRiskThresholdDays: FALLBACK_DAYS.WEAK_SIGNAL_AT_RISK,
    inactiveThresholdDays: FALLBACK_DAYS.WEAK_SIGNAL_INACTIVE,
  };
}

/**
 * Classifies a customer into exactly one segment.
 *
 * Order matters: RECOVERED is checked first (it describes how the customer got
 * here), then absence-based states, then the healthy states.
 */
export function segmentCustomer(input: SegmentationInput): SegmentationResult {
  const { frequency, now } = input;
  const thresholds = resolveThresholds(frequency);

  // No visits at all: nothing to retain yet. Treated as NEW so the engine never
  // recruits a customer it knows nothing about.
  if (frequency.visitCount === 0 || frequency.daysSinceLastVisit === null) {
    return {
      segment: CustomerSegment.NEW,
      reasonCode: 'NO_VISITS',
      ...thresholds,
    };
  }

  const days = frequency.daysSinceLastVisit;

  // RECOVERED: was contacted by the engine and came back afterwards, within the
  // recovery window. Checked before the healthy states so the win stays visible.
  if (input.lastInterventionAt && frequency.lastVisitAt) {
    const returnedAfterIntervention =
      frequency.lastVisitAt.getTime() > input.lastInterventionAt.getTime();
    const withinWindow =
      (now.getTime() - input.lastInterventionAt.getTime()) / MS_PER_DAY <=
      RECOVERY_WINDOW_DAYS;
    if (returnedAfterIntervention && withinWindow) {
      return {
        segment: CustomerSegment.RECOVERED,
        reasonCode: 'RETURNED_AFTER_INTERVENTION',
        ...thresholds,
      };
    }
  }

  if (days >= thresholds.inactiveThresholdDays) {
    return {
      segment: CustomerSegment.INACTIVE,
      reasonCode:
        frequency.visitCount === VISIT_THRESHOLDS.FIRST_VISIT_ONLY
          ? 'FIRST_TIMER_NEVER_RETURNED'
          : 'ABSENCE_BEYOND_INACTIVE_THRESHOLD',
      ...thresholds,
    };
  }

  if (days >= thresholds.atRiskThresholdDays) {
    return {
      segment: CustomerSegment.AT_RISK,
      reasonCode:
        frequency.visitCount === VISIT_THRESHOLDS.FIRST_VISIT_ONLY
          ? 'SECOND_VISIT_OVERDUE'
          : 'ABSENCE_BEYOND_TYPICAL_INTERVAL',
      ...thresholds,
    };
  }

  // Healthy states, by how much of a habit this is.
  if (frequency.visitCount >= VISIT_THRESHOLDS.MIN_VISITS_FOR_FREQUENT) {
    return {
      segment: CustomerSegment.FREQUENT,
      reasonCode: 'CONSISTENT_VISIT_HISTORY',
      ...thresholds,
    };
  }

  if (frequency.visitCount > VISIT_THRESHOLDS.FIRST_VISIT_ONLY) {
    return {
      segment: CustomerSegment.REPEAT,
      reasonCode: 'RETURNED_AT_LEAST_ONCE',
      ...thresholds,
    };
  }

  return {
    segment: CustomerSegment.NEW,
    reasonCode: 'SINGLE_VISIT_WITHIN_EXPECTED_WINDOW',
    ...thresholds,
  };
}
