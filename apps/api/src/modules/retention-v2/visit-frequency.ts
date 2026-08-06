import { CADENCE_BOUNDS, VISIT_THRESHOLDS } from './retention-rules';

/**
 * Per-customer visit cadence, derived from real Visit history.
 *
 * Pure functions on purpose: no Prisma, no dates "now" hidden inside. The
 * caller passes the visit timestamps and the reference instant, which makes
 * every rule reproducible in a test and in a report.
 */

export interface VisitFrequency {
  visitCount: number;
  firstVisitAt: Date | null;
  lastVisitAt: Date | null;
  /** Whole days between consecutive visits, oldest first. */
  intervalsDays: number[];
  meanIntervalDays: number | null;
  medianIntervalDays: number | null;
  /** Population standard deviation of the intervals. Null with <2 intervals. */
  intervalStdDevDays: number | null;
  daysSinceLastVisit: number | null;
  /**
   * The cadence actually used by the risk rules: the median, clamped to sane
   * bounds. Null when the customer has too little history to have one.
   */
  typicalIntervalDays: number | null;
  /** lastVisitAt + typicalInterval. Null when there is no usable cadence. */
  expectedNextVisitAt: Date | null;
  /** True once there are enough visits for the customer's own cadence. */
  hasReliableCadence: boolean;
}

const MS_PER_DAY = 86_400_000;

function wholeDaysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * Median rather than mean: a single unusual gap (a holiday, one trip abroad)
 * would drag a mean far away from how the customer actually behaves.
 */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const avg = mean(values)!;
  const variance =
    values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function clampCadence(value: number): number {
  return Math.min(
    CADENCE_BOUNDS.MAX_TYPICAL_INTERVAL_DAYS,
    Math.max(CADENCE_BOUNDS.MIN_TYPICAL_INTERVAL_DAYS, value),
  );
}

/**
 * Computes a customer's cadence from their visit timestamps.
 *
 * @param visitDates timestamps of the customer's visits, any order
 * @param now reference instant (injected so tests and reports are deterministic)
 */
export function computeVisitFrequency(
  visitDates: Date[],
  now: Date,
): VisitFrequency {
  const sorted = [...visitDates].sort((a, b) => a.getTime() - b.getTime());
  const visitCount = sorted.length;

  if (visitCount === 0) {
    return {
      visitCount: 0,
      firstVisitAt: null,
      lastVisitAt: null,
      intervalsDays: [],
      meanIntervalDays: null,
      medianIntervalDays: null,
      intervalStdDevDays: null,
      daysSinceLastVisit: null,
      typicalIntervalDays: null,
      expectedNextVisitAt: null,
      hasReliableCadence: false,
    };
  }

  const firstVisitAt = sorted[0];
  const lastVisitAt = sorted[visitCount - 1];

  const intervalsDays: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    intervalsDays.push(wholeDaysBetween(sorted[i - 1], sorted[i]));
  }

  const medianIntervalDays = median(intervalsDays);
  const hasReliableCadence =
    visitCount >= VISIT_THRESHOLDS.MIN_VISITS_FOR_INDIVIDUAL_CADENCE &&
    medianIntervalDays !== null;

  const typicalIntervalDays =
    hasReliableCadence && medianIntervalDays !== null
      ? clampCadence(medianIntervalDays)
      : null;

  return {
    visitCount,
    firstVisitAt,
    lastVisitAt,
    intervalsDays,
    meanIntervalDays: mean(intervalsDays),
    medianIntervalDays,
    intervalStdDevDays: stdDev(intervalsDays),
    daysSinceLastVisit: wholeDaysBetween(lastVisitAt, now),
    typicalIntervalDays,
    expectedNextVisitAt:
      typicalIntervalDays !== null
        ? new Date(lastVisitAt.getTime() + typicalIntervalDays * MS_PER_DAY)
        : null,
    hasReliableCadence,
  };
}
