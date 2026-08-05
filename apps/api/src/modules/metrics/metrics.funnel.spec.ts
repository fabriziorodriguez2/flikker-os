import { MetricsService } from './metrics.service';

const FLIKKER_START = new Date('2026-08-17T00:00:00Z');

/**
 * Fake Prisma backed by in-memory rows, so the funnel exercises the real
 * filtering logic (tenant, isActive, dates, uniqueness) instead of mocked
 * counts. Only the handful of models the funnel touches are implemented.
 */
function makePrisma(data: {
  customers?: Array<{
    businessId: string;
    origin: string;
    isActive: boolean;
    phoneE164: string | null;
    createdAt: Date;
  }>;
  reviews?: Array<{ businessId: string; postedAt: Date }>;
  scans?: Array<{ businessId: string; campaignId: string; scannedAt: Date }>;
}) {
  const customers = data.customers ?? [];
  const reviews = data.reviews ?? [];
  const scans = data.scans ?? [];

  const matchesDate = (
    value: Date,
    filter?: { gte?: Date; lt?: Date },
  ): boolean => {
    if (!filter) return true;
    if (filter.gte && value < filter.gte) return false;
    if (filter.lt && value >= filter.lt) return false;
    return true;
  };

  return {
    business: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ createdAt: new Date('2026-08-01T00:00:00Z') }),
    },
    businessPlan: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ trialStart: FLIKKER_START, startDate: null }),
    },
    campaign: { findFirst: jest.fn().mockResolvedValue({ id: 'camp-1' }) },
    scanEvent: {
      count: jest.fn(({ where }: { where: Record<string, never> }) => {
        const w = where as unknown as {
          businessId: string;
          campaignId: string;
          scannedAt?: { gte?: Date };
        };
        return Promise.resolve(
          scans.filter(
            (s) =>
              s.businessId === w.businessId &&
              s.campaignId === w.campaignId &&
              matchesDate(s.scannedAt, w.scannedAt),
          ).length,
        );
      }),
    },
    customer: {
      findMany: jest.fn(({ where }: { where: Record<string, never> }) => {
        const w = where as unknown as {
          businessId: string;
          origin: string;
          isActive: boolean;
          createdAt?: { gte?: Date; lt?: Date };
        };
        return Promise.resolve(
          customers
            .filter(
              (c) =>
                c.businessId === w.businessId &&
                c.origin === w.origin &&
                c.isActive === w.isActive &&
                matchesDate(c.createdAt, w.createdAt),
            )
            .map((c) => ({ phoneE164: c.phoneE164 })),
        );
      }),
    },
    googleReview: {
      count: jest.fn(({ where }: { where: Record<string, never> }) => {
        const w = where as unknown as {
          businessId: string;
          postedAt?: { gte?: Date };
        };
        return Promise.resolve(
          reviews.filter(
            (r) =>
              r.businessId === w.businessId && matchesDate(r.postedAt, w.postedAt),
          ).length,
        );
      }),
    },
    message: { count: jest.fn().mockResolvedValue(0) },
  };
}

function stepCount(
  steps: Array<{ key: string; count: number }>,
  key: string,
): number {
  return steps.find((s) => s.key === key)?.count ?? 0;
}

function customer(overrides: Partial<Parameters<typeof makePrisma>[0]> = {}) {
  return overrides;
}
void customer;

describe('getConversionFunnel — Contactos (personas únicas)', () => {
  it('counts one person who scanned several times as a single contact', async () => {
    const prisma = makePrisma({
      customers: [
        {
          businessId: 'biz-1',
          origin: 'qr',
          isActive: true,
          phoneE164: '+59891111111',
          createdAt: new Date('2026-08-18T10:00:00Z'),
        },
        {
          businessId: 'biz-1',
          origin: 'qr',
          isActive: true,
          phoneE164: '+59891111111',
          createdAt: new Date('2026-08-19T10:00:00Z'),
        },
      ],
    });
    const service = new MetricsService(prisma as never);

    const funnel = await service.getConversionFunnel('biz-1', 7, 'qr');

    expect(stepCount(funnel.steps, 'captured')).toBe(1);
  });

  it('counts two different people as two contacts', async () => {
    const prisma = makePrisma({
      customers: [
        {
          businessId: 'biz-1',
          origin: 'qr',
          isActive: true,
          phoneE164: '+59891111111',
          createdAt: new Date('2026-08-18T10:00:00Z'),
        },
        {
          businessId: 'biz-1',
          origin: 'qr',
          isActive: true,
          phoneE164: '+59892222222',
          createdAt: new Date('2026-08-18T11:00:00Z'),
        },
      ],
    });
    const service = new MetricsService(prisma as never);

    const funnel = await service.getConversionFunnel('biz-1', 7, 'qr');

    expect(stepCount(funnel.steps, 'captured')).toBe(2);
  });

  it('excludes contacts that were deleted (soft delete) and pre-Flikker ones', async () => {
    const prisma = makePrisma({
      customers: [
        {
          businessId: 'biz-1',
          origin: 'qr',
          isActive: true,
          phoneE164: '+59891111111',
          createdAt: new Date('2026-08-18T10:00:00Z'),
        },
        // Deleted from the panel — must stop counting.
        {
          businessId: 'biz-1',
          origin: 'qr',
          isActive: false,
          phoneE164: '+59892222222',
          createdAt: new Date('2026-08-18T10:00:00Z'),
        },
        // Captured before Flikker started — pre-existing history.
        {
          businessId: 'biz-1',
          origin: 'qr',
          isActive: true,
          phoneE164: '+59893333333',
          createdAt: new Date('2026-08-10T10:00:00Z'),
        },
        // Loaded by hand, not captured by the QR.
        {
          businessId: 'biz-1',
          origin: 'manual',
          isActive: true,
          phoneE164: '+59894444444',
          createdAt: new Date('2026-08-18T10:00:00Z'),
        },
      ],
    });
    const service = new MetricsService(prisma as never);

    const funnel = await service.getConversionFunnel('biz-1', 7, 'qr');

    expect(stepCount(funnel.steps, 'captured')).toBe(1);
  });

  it('never counts contacts belonging to another business', async () => {
    const prisma = makePrisma({
      customers: [
        {
          businessId: 'biz-1',
          origin: 'qr',
          isActive: true,
          phoneE164: '+59891111111',
          createdAt: new Date('2026-08-18T10:00:00Z'),
        },
        {
          businessId: 'biz-2',
          origin: 'qr',
          isActive: true,
          phoneE164: '+59892222222',
          createdAt: new Date('2026-08-18T10:00:00Z'),
        },
      ],
    });
    const service = new MetricsService(prisma as never);

    const funnel = await service.getConversionFunnel('biz-1', 7, 'qr');

    expect(stepCount(funnel.steps, 'captured')).toBe(1);
  });
});

describe('getConversionFunnel — Reseñas desde Flikker', () => {
  it('excludes reviews posted before the business started using Flikker', async () => {
    const prisma = makePrisma({
      reviews: [
        // Imported Google history — must never be credited to Flikker.
        { businessId: 'biz-1', postedAt: new Date('2026-07-01T00:00:00Z') },
        { businessId: 'biz-1', postedAt: new Date('2026-08-16T23:59:00Z') },
        // On/after the start date.
        { businessId: 'biz-1', postedAt: new Date('2026-08-17T00:00:00Z') },
        { businessId: 'biz-1', postedAt: new Date('2026-08-20T00:00:00Z') },
      ],
    });
    const service = new MetricsService(prisma as never);

    const funnel = await service.getConversionFunnel('biz-1', 7, 'qr');

    expect(stepCount(funnel.steps, 'reviews_since_flikker')).toBe(2);
  });

  it('does not count reviews from another business', async () => {
    const prisma = makePrisma({
      reviews: [
        { businessId: 'biz-1', postedAt: new Date('2026-08-20T00:00:00Z') },
        { businessId: 'biz-2', postedAt: new Date('2026-08-20T00:00:00Z') },
      ],
    });
    const service = new MetricsService(prisma as never);

    const funnel = await service.getConversionFunnel('biz-1', 7, 'qr');

    expect(stepCount(funnel.steps, 'reviews_since_flikker')).toBe(1);
  });

  it('matches the dashboard goal: both read the same reviews-since-start source', async () => {
    const reviews = [
      { businessId: 'biz-1', postedAt: new Date('2026-07-01T00:00:00Z') },
      { businessId: 'biz-1', postedAt: new Date('2026-08-18T00:00:00Z') },
      { businessId: 'biz-1', postedAt: new Date('2026-08-19T00:00:00Z') },
    ];
    const prisma = makePrisma({ reviews });
    const service = new MetricsService(prisma as never);

    const funnel = await service.getConversionFunnel('biz-1', 7, 'qr');
    // The dashboard goal counts with the same where-builder and start date.
    const goalCurrent = await prisma.googleReview.count({
      where: {
        businessId: 'biz-1',
        postedAt: { gte: FLIKKER_START },
      },
    } as never);

    expect(stepCount(funnel.steps, 'reviews_since_flikker')).toBe(goalCurrent);
  });
});

describe('getConversionFunnel — Escaneos', () => {
  it('only counts scans of this business from the Flikker start on', async () => {
    const prisma = makePrisma({
      scans: [
        {
          businessId: 'biz-1',
          campaignId: 'camp-1',
          scannedAt: new Date('2026-08-10T00:00:00Z'),
        },
        {
          businessId: 'biz-1',
          campaignId: 'camp-1',
          scannedAt: new Date('2026-08-18T00:00:00Z'),
        },
        {
          businessId: 'biz-2',
          campaignId: 'camp-1',
          scannedAt: new Date('2026-08-18T00:00:00Z'),
        },
      ],
    });
    const service = new MetricsService(prisma as never);

    const funnel = await service.getConversionFunnel('biz-1', 7, 'qr');

    expect(stepCount(funnel.steps, 'scanned')).toBe(1);
  });
});
