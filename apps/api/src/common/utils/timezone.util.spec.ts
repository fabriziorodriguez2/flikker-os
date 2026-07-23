import {
  getLocalDateTimeParts,
  isLastDayOfMonthInTz,
  localPeriodKey,
} from './timezone.util';

const TZ = 'America/Montevideo'; // UTC-3, no DST

describe('getLocalDateTimeParts', () => {
  it('reads year/month/day/hour/minute in the given timezone', () => {
    // 2026-07-31T23:50:00-03:00 == 2026-08-01T02:50:00Z
    const parts = getLocalDateTimeParts(new Date('2026-08-01T02:50:00Z'), TZ);
    expect(parts).toEqual({
      year: 2026,
      month: 7,
      day: 31,
      hour: 23,
      minute: 50,
    });
  });
});

describe('isLastDayOfMonthInTz', () => {
  it('returns true on the last day of a 31-day month', () => {
    expect(isLastDayOfMonthInTz(new Date('2026-08-01T02:50:00Z'), TZ)).toBe(
      true,
    );
  });

  it('returns false the day before month end', () => {
    // 2026-07-30T23:50:00-03:00
    expect(isLastDayOfMonthInTz(new Date('2026-07-31T02:50:00Z'), TZ)).toBe(
      false,
    );
  });

  it('returns true on Feb 28 of a non-leap year', () => {
    // 2026-02-28T23:50:00-03:00
    expect(isLastDayOfMonthInTz(new Date('2026-03-01T02:50:00Z'), TZ)).toBe(
      true,
    );
  });

  it('returns true on Feb 29 of a leap year, not Feb 28', () => {
    // 2028 is a leap year
    expect(isLastDayOfMonthInTz(new Date('2028-02-29T15:00:00Z'), TZ)).toBe(
      true,
    );
    expect(isLastDayOfMonthInTz(new Date('2028-02-28T15:00:00Z'), TZ)).toBe(
      false,
    );
  });
});

describe('localPeriodKey', () => {
  it('formats the local calendar month as YYYY-MM', () => {
    expect(localPeriodKey(new Date('2026-08-01T02:50:00Z'), TZ)).toBe(
      '2026-07',
    );
  });

  it('pads single-digit months', () => {
    // 2026-01-15T12:00:00-03:00
    expect(localPeriodKey(new Date('2026-01-15T15:00:00Z'), TZ)).toBe(
      '2026-01',
    );
  });
});
