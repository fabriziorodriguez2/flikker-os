import {
  computeChange,
  dayKeysBetween,
  parsePeriodDays,
  resolvePeriod,
} from './dashboard-period';

describe('parsePeriodDays', () => {
  it.each([
    ['7', 7],
    ['30', 30],
    ['90', 90],
  ])('accepts %s as %i', (raw, expected) => {
    expect(parsePeriodDays(raw)).toBe(expected);
  });

  it.each([undefined, '', '15', 'abc', '0', '-30'])(
    'falls back to 30 for invalid input %p',
    (raw) => {
      expect(parsePeriodDays(raw)).toBe(30);
    },
  );
});

describe('resolvePeriod', () => {
  it('computes a previous period of the same length, immediately before the current one', () => {
    const now = new Date('2026-08-10T12:00:00.000Z');
    const period = resolvePeriod(30, now);

    expect(period.to.toISOString()).toBe(now.toISOString());
    expect(period.from.toISOString()).toBe('2026-07-11T12:00:00.000Z');
    // Anterior: mismos 30 días, inmediatamente antes del actual.
    expect(period.previousTo.toISOString()).toBe(period.from.toISOString());
    expect(period.previousFrom.toISOString()).toBe('2026-06-11T12:00:00.000Z');
  });

  it('scales the previous period window with the chosen period length', () => {
    const now = new Date('2026-08-10T12:00:00.000Z');
    const period7 = resolvePeriod(7, now);
    const daysBetween =
      (period7.from.getTime() - period7.previousFrom.getTime()) / 86_400_000;
    expect(daysBetween).toBe(7);
  });
});

describe('computeChange', () => {
  it('computes percent change normally when previous > 0', () => {
    expect(computeChange(12, 10)).toEqual({ absolute: 2, percent: 20 });
    expect(computeChange(8, 10)).toEqual({ absolute: -2, percent: -20 });
  });

  it('never returns "+∞%" — percent is null when previous is 0', () => {
    expect(computeChange(5, 0)).toEqual({ absolute: 5, percent: null });
    expect(computeChange(0, 0)).toEqual({ absolute: 0, percent: null });
  });
});

describe('dayKeysBetween', () => {
  it('returns one key per day, inclusive on both ends', () => {
    const from = new Date('2026-08-01T15:00:00.000Z');
    const to = new Date('2026-08-04T03:00:00.000Z');
    expect(dayKeysBetween(from, to)).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
    ]);
  });
});
