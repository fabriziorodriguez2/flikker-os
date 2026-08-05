import {
  countUniquePeople,
  flikkerContactsWhere,
  resolveFlikkerStartAt,
  reviewsSinceFlikkerWhere,
} from './flikker-metrics';

describe('countUniquePeople', () => {
  it('counts a customer who scanned several times as one person', () => {
    // Same phone across several rows (the table has no unique constraint on it).
    expect(
      countUniquePeople([
        { phoneE164: '+59891111111' },
        { phoneE164: '+59891111111' },
        { phoneE164: '+59891111111' },
      ]),
    ).toBe(1);
  });

  it('counts two different people as two', () => {
    expect(
      countUniquePeople([
        { phoneE164: '+59891111111' },
        { phoneE164: '+59892222222' },
      ]),
    ).toBe(2);
  });

  it('ignores casing and surrounding whitespace when comparing', () => {
    expect(
      countUniquePeople([
        { phoneE164: ' +59891111111 ' },
        { phoneE164: '+59891111111' },
      ]),
    ).toBe(1);
  });

  it('does not collapse unrelated rows that have no phone', () => {
    // Without a phone there is no way to tell people apart, so each row counts
    // on its own instead of merging into a single phantom person.
    expect(
      countUniquePeople([
        { phoneE164: null },
        { phoneE164: '' },
        { phoneE164: '+59891111111' },
      ]),
    ).toBe(3);
  });

  it('returns 0 for no contacts', () => {
    expect(countUniquePeople([])).toBe(0);
  });
});

describe('resolveFlikkerStartAt', () => {
  const businessCreatedAt = new Date('2026-08-01T00:00:00Z');

  it('falls back to the business creation date when there is no plan', () => {
    expect(
      resolveFlikkerStartAt({ businessCreatedAt, firstPlan: null }),
    ).toEqual(businessCreatedAt);
  });

  it('uses the trial start when it is later than the business creation', () => {
    const trialStart = new Date('2026-08-17T00:00:00Z');
    expect(
      resolveFlikkerStartAt({
        businessCreatedAt,
        firstPlan: { trialStart, startDate: null },
      }),
    ).toEqual(trialStart);
  });

  it('never widens the window past the business creation date', () => {
    // A plan backdated before the business existed must not pull history in.
    expect(
      resolveFlikkerStartAt({
        businessCreatedAt,
        firstPlan: { trialStart: new Date('2026-07-01T00:00:00Z'), startDate: null },
      }),
    ).toEqual(businessCreatedAt);
  });

  it('uses startDate when there is no trialStart', () => {
    const startDate = new Date('2026-08-17T00:00:00Z');
    expect(
      resolveFlikkerStartAt({
        businessCreatedAt,
        firstPlan: { trialStart: null, startDate },
      }),
    ).toEqual(startDate);
  });
});

describe('flikkerContactsWhere', () => {
  const start = new Date('2026-08-17T00:00:00Z');

  it('scopes to the tenant, to QR origin, to active rows and to the Flikker era', () => {
    expect(flikkerContactsWhere('biz-1', start)).toEqual({
      businessId: 'biz-1',
      origin: 'qr',
      // A soft-deleted contact (isActive:false) must stop counting.
      isActive: true,
      createdAt: { gte: start },
    });
  });
});

describe('reviewsSinceFlikkerWhere', () => {
  it('scopes to the tenant and excludes reviews older than the Flikker start', () => {
    const start = new Date('2026-08-17T00:00:00Z');
    expect(reviewsSinceFlikkerWhere('biz-1', start)).toEqual({
      businessId: 'biz-1',
      postedAt: { gte: start },
    });
  });
});
