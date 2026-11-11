import { PrismaService } from '../../../prisma/prisma.service';
import {
  createTestBusiness,
  makeTestSuffix,
} from '../../reviews/reviews.test-helpers';
import { previewSegment } from './business-snapshot';
import { BusinessSnapshotService } from './business-snapshot.service';

/**
 * La foto del negocio contra Postgres real: lo que importa es que solo mire
 * datos de ESE negocio y que el consentimiento salga del registro real.
 */
describe('BusinessSnapshotService (integration)', () => {
  let prisma: PrismaService;
  let service: BusinessSnapshotService;
  let available = false;
  const s = makeTestSuffix();
  let businessId = '';
  let otherBusinessId = '';
  const NOW = new Date();
  const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

  async function customer(
    bizId: string,
    visitsAgo: number[],
    consent: boolean,
  ) {
    const c = await prisma.customer.create({
      data: {
        businessId: bizId,
        name: 'Cliente',
        phoneE164: `+5989${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
        ...(consent
          ? {
              consentEvents: {
                create: {
                  businessId: bizId,
                  channel: 'WHATSAPP',
                  action: 'GRANTED',
                  source: 'CHECKIN_FORM',
                },
              },
            }
          : {}),
      },
      select: { id: true },
    });
    for (const d of visitsAgo) {
      await prisma.visit.create({
        data: {
          businessId: bizId,
          customerId: c.id,
          occurredAt: ago(d),
          visitDayKey: ago(d).toISOString().slice(0, 10),
          verificationType: 'persistent_session',
        },
      });
    }
    return c.id;
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;
    prisma = new PrismaService();
    try {
      await prisma.$connect();
      service = new BusinessSnapshotService(prisma);
      businessId = (await createTestBusiness(prisma, `snap-${s}`)).id;
      otherBusinessId = (await createTestBusiness(prisma, `snap2-${s}`)).id;
      await customer(businessId, [60, 50, 40], true);
      await customer(businessId, [45], false);
      // Otro negocio, con muchas visitas recientes: no puede contar acá.
      await customer(otherBusinessId, [1, 2, 3, 4], true);
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
    for (const id of [businessId, otherBusinessId]) {
      await prisma.visit.deleteMany({ where: { businessId: id } });
      await prisma.customer.deleteMany({ where: { businessId: id } });
      await prisma.business.delete({ where: { id } });
    }
    await prisma.$disconnect();
  });

  it('solo mira datos del negocio pedido', async () => {
    if (!available) return;
    const snap = await service.load(businessId, NOW);
    expect(snap.features.size).toBe(2);
    expect(snap.facts['customers.active']).toBe(2);
    expect(snap.facts['visits.last_28d']).toBe(0);
    expect(snap.facts['customers.single_visit_lapsed_30d']).toBe(1);
  });

  it('el consentimiento sale del registro real', async () => {
    if (!available) return;
    const snap = await service.load(businessId, NOW);
    expect(snap.facts['customers.with_whatsapp_consent']).toBe(1);
    expect(
      previewSegment(snap, { field: 'visitCount', op: 'gte', value: 1 }),
    ).toEqual({ matched: 2, reachable: 1 });
  });
});
