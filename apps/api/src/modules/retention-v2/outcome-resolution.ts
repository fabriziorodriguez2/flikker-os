import { VisitAttributionType } from '@prisma/client';

/**
 * Pure decision logic for one assignment's outcome (Fase D §2/§3/§6/§7).
 *
 * Deliberately re-derived from current facts every time it runs rather than
 * carrying state forward: the caller re-evaluates any assignment whose
 * outcome is not yet final (see `RetentionOutcomeService`), so re-running
 * this with a newly-visible redemption is what "elevating" an outcome means
 * — there is no separate upgrade code path to keep in sync.
 */

export interface ReturnVisitCandidate {
  id: string;
  occurredAt: Date;
  attributionType: VisitAttributionType;
}

export interface OutcomeFacts {
  /** When the customer was actually exposed to this arm (assignment.exposedAt). */
  exposedAt: Date;
  attributionWindowDays: number;
  now: Date;
  /**
   * The earliest Visit strictly after `exposedAt`, if any — the caller finds
   * this with `orderBy: occurredAt asc, take: 1`, which is exactly "buscar
   * primera Visit elegible posterior". A visit that is not the earliest one
   * never changes whether `returned` is true; there is no other rule to
   * apply, and no day-level dedup to redo here — Visit creation already
   * dedupes (`VisitsRepository.registerVisit`), so any row that exists is a
   * real, distinct visit.
   */
  firstVisit: ReturnVisitCandidate | null;
  /**
   * Whether this assignment's own `benefitParticipationId` was redeemed by
   * `now` — the single source of truth for `confirmedByRedemption`, not a
   * guess from Visit metadata.
   */
  redeemedByNow: boolean;
}

export interface OutcomeData {
  returned: boolean;
  returnVisitId: string | null;
  returnedAt: Date | null;
  daysToReturn: number | null;
  attributionType: VisitAttributionType | null;
  confirmedByRedemption: boolean;
  observedWithinWindow: boolean;
}

export type OutcomeResolution =
  | { status: 'pending' } // window still open, nothing to write yet
  | { status: 'resolved'; data: OutcomeData };

const MS_PER_DAY = 86_400_000;

export function windowEnd(
  exposedAt: Date,
  attributionWindowDays: number,
): Date {
  return new Date(exposedAt.getTime() + attributionWindowDays * MS_PER_DAY);
}

export function resolveOutcome(facts: OutcomeFacts): OutcomeResolution {
  const end = windowEnd(facts.exposedAt, facts.attributionWindowDays);

  const qualifyingVisit =
    facts.firstVisit &&
    facts.firstVisit.occurredAt > facts.exposedAt &&
    facts.firstVisit.occurredAt <= end
      ? facts.firstVisit
      : null;

  if (qualifyingVisit) {
    const daysToReturn = Math.round(
      (qualifyingVisit.occurredAt.getTime() - facts.exposedAt.getTime()) /
        MS_PER_DAY,
    );
    return {
      status: 'resolved',
      data: {
        returned: true,
        returnVisitId: qualifyingVisit.id,
        returnedAt: qualifyingVisit.occurredAt,
        daysToReturn,
        // Redemption is the strongest possible evidence — it overrides
        // whatever the check-in flow attributed the visit to on its own.
        attributionType: facts.redeemedByNow
          ? VisitAttributionType.confirmed_redemption
          : qualifyingVisit.attributionType,
        confirmedByRedemption: facts.redeemedByNow,
        observedWithinWindow: true,
      },
    };
  }

  // No qualifying visit yet. Only final once the window has actually closed —
  // otherwise this assignment is left alone until the next worker pass.
  if (facts.now.getTime() < end.getTime()) {
    return { status: 'pending' };
  }

  return {
    status: 'resolved',
    data: {
      returned: false,
      returnVisitId: null,
      returnedAt: null,
      daysToReturn: null,
      attributionType: null,
      confirmedByRedemption: false,
      observedWithinWindow: false,
    },
  };
}
