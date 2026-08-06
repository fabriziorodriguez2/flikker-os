import { CustomerSegment } from '@prisma/client';
import { segmentCustomer, resolveThresholds } from './segmentation';
import { computeVisitFrequency } from './visit-frequency';

const NOW = new Date('2026-08-31T12:00:00.000Z');
const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

/** Builds a customer whose visits are `every` days apart, ending `ago` days back. */
function cadence(every: number, count: number, ago: number) {
  const dates: Date[] = [];
  for (let i = count - 1; i >= 0; i--) {
    dates.push(new Date(NOW.getTime() - (ago + i * every) * 86_400_000));
  }
  return computeVisitFrequency(dates, NOW);
}

function segmentOf(frequency: ReturnType<typeof computeVisitFrequency>) {
  return segmentCustomer({ frequency, now: NOW }).segment;
}

describe('segmentCustomer — healthy states', () => {
  it('NEW: a single recent visit, still inside the expected second-visit window', () => {
    const f = computeVisitFrequency([d('2026-08-25')], NOW); // 6 days ago
    expect(segmentOf(f)).toBe(CustomerSegment.NEW);
  });

  it('NEW: no visits at all — nothing is known, so nothing is targeted', () => {
    const f = computeVisitFrequency([], NOW);
    const result = segmentCustomer({ frequency: f, now: NOW });
    expect(result.segment).toBe(CustomerSegment.NEW);
    expect(result.reasonCode).toBe('NO_VISITS');
  });

  it('REPEAT: came back, but not enough history to call it a habit', () => {
    // 2 visits, last one 10 days ago — under the 45-day weak-signal threshold.
    const f = cadence(7, 2, 10);
    expect(segmentOf(f)).toBe(CustomerSegment.REPEAT);
  });

  it('FREQUENT: consistent history and on-pattern', () => {
    // 5 weekly visits, last one 3 days ago (< 7 × 1.5).
    const f = cadence(7, 5, 3);
    expect(segmentOf(f)).toBe(CustomerSegment.FREQUENT);
  });
});

describe('segmentCustomer — risk states use the customer’s own cadence', () => {
  it('AT_RISK: weekly customer 12 days out (> 7 × 1.5)', () => {
    const f = cadence(7, 5, 12);
    const result = segmentCustomer({ frequency: f, now: NOW });
    expect(result.segment).toBe(CustomerSegment.AT_RISK);
    expect(result.reasonCode).toBe('ABSENCE_BEYOND_TYPICAL_INTERVAL');
    expect(result.atRiskThresholdDays).toBe(11); // round(7 × 1.5)
  });

  it('INACTIVE: weekly customer 30 days out (> 7 × 3)', () => {
    const f = cadence(7, 5, 30);
    expect(segmentOf(f)).toBe(CustomerSegment.INACTIVE);
  });

  it('the same absence means different things for different cadences', () => {
    // 25 days out. For a weekly customer that is gone; for a monthly one it is
    // perfectly normal. This is the whole point of per-customer cadence.
    const weekly = cadence(7, 5, 25);
    const monthly = cadence(60, 5, 25);

    expect(segmentOf(weekly)).toBe(CustomerSegment.INACTIVE);
    expect(segmentOf(monthly)).toBe(CustomerSegment.FREQUENT);
  });
});

describe('segmentCustomer — first-timers (the second-visit problem)', () => {
  it('AT_RISK once the second visit is overdue', () => {
    const f = computeVisitFrequency([d('2026-08-05')], NOW); // 26 days ago
    const result = segmentCustomer({ frequency: f, now: NOW });
    expect(result.segment).toBe(CustomerSegment.AT_RISK);
    expect(result.reasonCode).toBe('SECOND_VISIT_OVERDUE');
  });

  it('INACTIVE once a first-timer is long gone', () => {
    const f = computeVisitFrequency([d('2026-06-01')], NOW); // 91 days ago
    const result = segmentCustomer({ frequency: f, now: NOW });
    expect(result.segment).toBe(CustomerSegment.INACTIVE);
    expect(result.reasonCode).toBe('FIRST_TIMER_NEVER_RETURNED');
  });
});

describe('segmentCustomer — RECOVERED', () => {
  it('is RECOVERED when the return happened after an intervention', () => {
    const f = computeVisitFrequency([d('2026-07-01'), d('2026-08-28')], NOW);
    const result = segmentCustomer({
      frequency: f,
      lastInterventionAt: d('2026-08-20'),
      now: NOW,
    });

    expect(result.segment).toBe(CustomerSegment.RECOVERED);
    expect(result.reasonCode).toBe('RETURNED_AFTER_INTERVENTION');
  });

  it('is NOT RECOVERED when the last visit predates the intervention', () => {
    // Contacted, but never came back — must not be counted as a win.
    const f = computeVisitFrequency([d('2026-07-01')], NOW);
    const result = segmentCustomer({
      frequency: f,
      lastInterventionAt: d('2026-08-20'),
      now: NOW,
    });

    expect(result.segment).not.toBe(CustomerSegment.RECOVERED);
  });

  it('stops being RECOVERED once the recovery window has passed', () => {
    const f = computeVisitFrequency([d('2026-06-10'), d('2026-06-20')], NOW);
    const result = segmentCustomer({
      frequency: f,
      lastInterventionAt: d('2026-06-15'), // 77 days ago, window is 30
      now: NOW,
    });

    expect(result.segment).not.toBe(CustomerSegment.RECOVERED);
  });
});

describe('resolveThresholds — fallbacks by amount of history', () => {
  it('uses second-visit windows for a single visit', () => {
    const f = computeVisitFrequency([d('2026-08-25')], NOW);
    expect(resolveThresholds(f)).toEqual({
      atRiskThresholdDays: 21,
      inactiveThresholdDays: 60,
    });
  });

  it('uses wide weak-signal windows for two visits', () => {
    const f = cadence(7, 2, 3);
    expect(resolveThresholds(f)).toEqual({
      atRiskThresholdDays: 45,
      inactiveThresholdDays: 90,
    });
  });

  it('switches to the individual cadence from three visits on', () => {
    const f = cadence(10, 3, 1);
    expect(resolveThresholds(f)).toEqual({
      atRiskThresholdDays: 15, // 10 × 1.5
      inactiveThresholdDays: 30, // 10 × 3
    });
  });

  it('an irregular customer still gets usable thresholds via the median', () => {
    const f = computeVisitFrequency(
      [d('2026-05-01'), d('2026-05-08'), d('2026-07-01'), d('2026-07-08')],
      NOW,
    );
    const thresholds = resolveThresholds(f);
    expect(thresholds.atRiskThresholdDays).toBeGreaterThan(0);
    expect(thresholds.inactiveThresholdDays).toBeGreaterThan(
      thresholds.atRiskThresholdDays,
    );
  });
});
