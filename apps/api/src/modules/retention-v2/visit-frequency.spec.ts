import { computeVisitFrequency } from './visit-frequency';

const NOW = new Date('2026-08-31T12:00:00.000Z');
const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

describe('computeVisitFrequency', () => {
  it('returns an empty profile when there are no visits', () => {
    const f = computeVisitFrequency([], NOW);

    expect(f.visitCount).toBe(0);
    expect(f.typicalIntervalDays).toBeNull();
    expect(f.daysSinceLastVisit).toBeNull();
    expect(f.hasReliableCadence).toBe(false);
  });

  it('handles a single visit: no intervals, no cadence', () => {
    const f = computeVisitFrequency([d('2026-08-21')], NOW);

    expect(f.visitCount).toBe(1);
    expect(f.intervalsDays).toEqual([]);
    expect(f.medianIntervalDays).toBeNull();
    expect(f.typicalIntervalDays).toBeNull();
    expect(f.daysSinceLastVisit).toBe(10);
    expect(f.hasReliableCadence).toBe(false);
  });

  it('computes the weekly cadence from the spec example', () => {
    // Visits 1/8, 7/8, 14/8, 21/8 → intervals 6,7,7 → typical ≈ 7 days.
    const f = computeVisitFrequency(
      [d('2026-08-01'), d('2026-08-07'), d('2026-08-14'), d('2026-08-21')],
      NOW,
    );

    expect(f.visitCount).toBe(4);
    expect(f.intervalsDays).toEqual([6, 7, 7]);
    expect(f.medianIntervalDays).toBe(7);
    expect(f.typicalIntervalDays).toBe(7);
    // On 31/8 the customer is 10 days out — starting to drift from 7.
    expect(f.daysSinceLastVisit).toBe(10);
    expect(f.expectedNextVisitAt).toEqual(d('2026-08-28'));
    expect(f.hasReliableCadence).toBe(true);
  });

  it('sorts unordered input before deriving intervals', () => {
    const f = computeVisitFrequency(
      [d('2026-08-21'), d('2026-08-01'), d('2026-08-14'), d('2026-08-07')],
      NOW,
    );

    expect(f.firstVisitAt).toEqual(d('2026-08-01'));
    expect(f.lastVisitAt).toEqual(d('2026-08-21'));
    expect(f.intervalsDays).toEqual([6, 7, 7]);
  });

  it('uses the median so one outlier gap does not distort the cadence', () => {
    // A 90-day holiday gap among otherwise weekly visits.
    const f = computeVisitFrequency(
      [
        d('2026-01-01'),
        d('2026-04-01'), // 90-day outlier
        d('2026-04-08'),
        d('2026-04-15'),
        d('2026-04-22'),
      ],
      new Date('2026-04-25T12:00:00.000Z'),
    );

    expect(f.medianIntervalDays).toBe(7);
    expect(f.typicalIntervalDays).toBe(7);
    // The mean is dragged far away by the outlier — which is why it is not used.
    expect(f.meanIntervalDays).toBeGreaterThan(20);
  });

  it('needs 3 visits before trusting an individual cadence', () => {
    const two = computeVisitFrequency([d('2026-08-01'), d('2026-08-08')], NOW);
    expect(two.medianIntervalDays).toBe(7);
    // The interval exists, but one observation is not a cadence.
    expect(two.hasReliableCadence).toBe(false);
    expect(two.typicalIntervalDays).toBeNull();

    const three = computeVisitFrequency(
      [d('2026-08-01'), d('2026-08-08'), d('2026-08-15')],
      NOW,
    );
    expect(three.hasReliableCadence).toBe(true);
    expect(three.typicalIntervalDays).toBe(7);
  });

  it('clamps an implausibly short cadence to the lower bound', () => {
    // Three visits on the same day would otherwise imply a 0-day cadence.
    const f = computeVisitFrequency(
      [
        new Date('2026-08-20T10:00:00Z'),
        new Date('2026-08-20T12:00:00Z'),
        new Date('2026-08-20T14:00:00Z'),
      ],
      NOW,
    );

    expect(f.medianIntervalDays).toBe(0);
    expect(f.typicalIntervalDays).toBe(3); // MIN_TYPICAL_INTERVAL_DAYS
  });

  it('clamps an implausibly long cadence to the upper bound', () => {
    const f = computeVisitFrequency(
      [d('2020-01-01'), d('2022-01-01'), d('2024-01-01')],
      NOW,
    );

    expect(f.typicalIntervalDays).toBe(180); // MAX_TYPICAL_INTERVAL_DAYS
  });

  it('reports variability so irregular customers can be told apart', () => {
    const regular = computeVisitFrequency(
      [d('2026-08-01'), d('2026-08-08'), d('2026-08-15'), d('2026-08-22')],
      NOW,
    );
    const irregular = computeVisitFrequency(
      [d('2026-06-01'), d('2026-06-03'), d('2026-08-01'), d('2026-08-22')],
      NOW,
    );

    expect(regular.intervalStdDevDays).toBeLessThan(1);
    expect(irregular.intervalStdDevDays!).toBeGreaterThan(
      regular.intervalStdDevDays!,
    );
  });
});
