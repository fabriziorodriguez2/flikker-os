import { VisitAttributionType } from '@prisma/client';
import { resolveOutcome, windowEnd } from './outcome-resolution';

const EXPOSED_AT = new Date('2026-09-01T12:00:00.000Z');
const WINDOW_DAYS = 7;

function facts(overrides: Partial<Parameters<typeof resolveOutcome>[0]> = {}) {
  return {
    exposedAt: EXPOSED_AT,
    attributionWindowDays: WINDOW_DAYS,
    now: EXPOSED_AT,
    firstVisit: null,
    redeemedByNow: false,
    ...overrides,
  };
}

describe('windowEnd', () => {
  it('adds attributionWindowDays to exposedAt', () => {
    expect(windowEnd(EXPOSED_AT, 7)).toEqual(
      new Date('2026-09-08T12:00:00.000Z'),
    );
  });
});

describe('resolveOutcome — CONTROL and variants alike (Fase D §2/§7)', () => {
  it('stays pending while the window is open and nothing has happened', () => {
    const result = resolveOutcome(
      facts({ now: new Date('2026-09-03T12:00:00.000Z') }),
    );
    expect(result).toEqual({ status: 'pending' });
  });

  it('resolves returned=true as soon as a qualifying visit appears, before the window closes', () => {
    const visitAt = new Date('2026-09-03T09:00:00.000Z'); // day 2, window still open
    const result = resolveOutcome(
      facts({
        now: visitAt,
        firstVisit: {
          id: 'visit-1',
          occurredAt: visitAt,
          attributionType: VisitAttributionType.organic,
        },
      }),
    );
    expect(result).toEqual({
      status: 'resolved',
      data: {
        returned: true,
        returnVisitId: 'visit-1',
        returnedAt: visitAt,
        daysToReturn: 2,
        attributionType: VisitAttributionType.organic,
        confirmedByRedemption: false,
        observedWithinWindow: true,
      },
    });
  });

  it('closes as returned=false once the window passes with no visit', () => {
    const afterWindow = new Date('2026-09-09T00:00:00.000Z');
    const result = resolveOutcome(facts({ now: afterWindow }));
    expect(result).toEqual({
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
    });
  });

  it('a visit that only shows up after the window closes does not count', () => {
    const afterWindow = new Date('2026-09-10T00:00:00.000Z');
    const lateVisit = new Date('2026-09-09T12:00:00.000Z'); // 1 day after window end
    const result = resolveOutcome(
      facts({
        now: afterWindow,
        firstVisit: {
          id: 'visit-late',
          occurredAt: lateVisit,
          attributionType: VisitAttributionType.organic,
        },
      }),
    );
    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') throw new Error('expected resolved');
    expect(result.data.returned).toBe(false);
  });

  it('a visit at or before exposedAt itself never counts (the visit that triggered eligibility)', () => {
    const result = resolveOutcome(
      facts({
        now: new Date('2026-09-09T00:00:00.000Z'),
        firstVisit: {
          id: 'origin-visit',
          occurredAt: EXPOSED_AT, // exactly at exposure — not "posterior"
          attributionType: VisitAttributionType.organic,
        },
      }),
    );
    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') throw new Error('expected resolved');
    expect(result.data.returned).toBe(false);
  });

  it('a visit exactly at window end still counts (inclusive boundary)', () => {
    const boundary = windowEnd(EXPOSED_AT, WINDOW_DAYS);
    const result = resolveOutcome(
      facts({
        now: boundary,
        firstVisit: {
          id: 'visit-1',
          occurredAt: boundary,
          attributionType: VisitAttributionType.organic,
        },
      }),
    );
    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') throw new Error('expected resolved');
    expect(result.data.returned).toBe(true);
  });

  it('redemption confirms the outcome and overrides the visit’s own attribution', () => {
    const visitAt = new Date('2026-09-03T09:00:00.000Z');
    const result = resolveOutcome(
      facts({
        now: visitAt,
        firstVisit: {
          id: 'visit-1',
          occurredAt: visitAt,
          attributionType: VisitAttributionType.post_campaign_checkin,
        },
        redeemedByNow: true,
      }),
    );
    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') throw new Error('expected resolved');
    expect(result.data.confirmedByRedemption).toBe(true);
    expect(result.data.attributionType).toBe(
      VisitAttributionType.confirmed_redemption,
    );
  });

  it('CONTROL (no message) returns exactly like any other exposed arm', () => {
    // CONTROL has no message, so the only difference from a variant is that
    // there is nothing to attribute — the visit itself is still "organic".
    const visitAt = new Date('2026-09-02T12:00:00.000Z');
    const result = resolveOutcome(
      facts({
        now: visitAt,
        firstVisit: {
          id: 'visit-1',
          occurredAt: visitAt,
          attributionType: VisitAttributionType.organic,
        },
      }),
    );
    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') throw new Error('expected resolved');
    expect(result.data.returned).toBe(true);
    expect(result.data.attributionType).toBe(VisitAttributionType.organic);
  });
});
