import { randomUUID } from 'crypto';
import { VisitVerificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { VisitsRepository } from './visits.repository';

/**
 * Real-Postgres concurrency test for visit deduplication. Verifies that the
 * advisory-lock transaction lets only ONE of several simultaneous check-ins for
 * the same customer create a visit within the dedup window. Skips gracefully
 * when no database is reachable (e.g. CI without Postgres).
 */
describe('VisitsRepository concurrency (integration)', () => {
  let prisma: PrismaService;
  let repo: VisitsRepository;
  let available = false;
  let businessId = '';
  let customerId = '';

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;
    prisma = new PrismaService();
    try {
      await prisma.$connect();
      const business = await prisma.business.create({
        data: {
          name: 'Concurrency Test Co',
          slug: `concurrency-${randomUUID()}`,
          country: 'UY',
          timezone: 'America/Montevideo',
          currency: 'UYU',
        },
        select: { id: true },
      });
      businessId = business.id;
      const customer = await prisma.customer.create({
        data: {
          businessId,
          name: 'Concurrency Tester',
          phoneE164: '+59899000001',
          origin: 'qr',
        },
        select: { id: true },
      });
      customerId = customer.id;
      repo = new VisitsRepository(prisma);
      available = true;
    } catch {
      available = false;
    }
  });

  afterAll(async () => {
    if (!available) {
      await prisma?.$disconnect().catch(() => undefined);
      return;
    }
    await prisma.visit.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.business.deleteMany({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates exactly one visit under concurrent check-ins (max 1/day)', async () => {
    if (!available) {
      console.warn('DB unavailable — skipping concurrency integration test');
      return;
    }

    const input = {
      businessId,
      customerId,
      sourceId: null,
      verificationType: VisitVerificationType.persistent_session,
      timezone: 'America/Montevideo',
      minHoursBetweenVisits: 8,
      maxVisitsPerDay: 1,
      attribute: false,
    };

    const results = await Promise.all(
      Array.from({ length: 6 }, () => repo.registerVisit(input)),
    );

    const created = results.filter((r) => r.created).length;
    const prevented = results.filter((r) => !r.created).length;
    const persisted = await prisma.visit.count({
      where: { businessId, customerId },
    });

    expect(created).toBe(1);
    expect(prevented).toBe(5);
    expect(persisted).toBe(1);
  });
});
