import {
  averageDays,
  buildRecommendations,
  ratePct,
  type FunnelCounts,
} from './checkin-metrics.rules';

const base: FunnelCounts = {
  scanned: 100,
  registered: 60,
  messagesSent: 40,
  messagesOpened: 30,
  returns: 20,
  benefitsRedeemed: 5,
};

describe('ratePct', () => {
  it('returns null when the denominator is 0', () => {
    expect(ratePct(5, 0)).toBeNull();
  });
  it('rounds to one decimal', () => {
    expect(ratePct(1, 3)).toBe(33.3);
  });
});

describe('averageDays', () => {
  it('returns null for an empty set', () => {
    expect(averageDays([])).toBeNull();
  });
  it('averages millisecond deltas as whole days', () => {
    const oneDay = 86_400_000;
    expect(averageDays([oneDay, 3 * oneDay])).toBe(2);
  });
});

describe('buildRecommendations', () => {
  it('suggests inviting scans when there are very few', () => {
    const recs = buildRecommendations({ ...base, scanned: 4 });
    expect(recs.map((r) => r.id)).toContain('few_scans');
  });

  it('suggests reducing the form when scans are high but registrations low', () => {
    const recs = buildRecommendations({
      ...base,
      scanned: 100,
      registered: 10,
    });
    expect(recs.map((r) => r.id)).toContain('reduce_form');
  });

  it('suggests a short-expiry benefit when clicks are high but returns low', () => {
    const recs = buildRecommendations({
      ...base,
      scanned: 100,
      registered: 60,
      messagesOpened: 40,
      returns: 2,
    });
    expect(recs.map((r) => r.id)).toContain('short_benefit');
  });

  it('returns nothing actionable on healthy numbers', () => {
    const recs = buildRecommendations({
      scanned: 100,
      registered: 70,
      messagesSent: 50,
      messagesOpened: 40,
      returns: 30,
      benefitsRedeemed: 12,
    });
    expect(recs).toHaveLength(0);
  });
});
