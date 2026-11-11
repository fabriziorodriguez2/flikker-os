import { ConsentAction } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  createTestBusiness,
  makeTestSuffix,
} from '../reviews/reviews.test-helpers';
import {
  customersWithWhatsappMarketingConsent,
  hasWhatsappMarketingConsent,
} from './marketing-consent';

/**
 * La regla de los envíos promocionales automáticos, contra Postgres real:
 * solo un GRANTED vigente del MISMO negocio habilita.
 */
describe('WhatsApp marketing consent (integration)', () => {
  let prisma: PrismaService;
  let available = false;
  const s = makeTestSuffix();
  let businessId = '';
  let otherBusinessId = '';
  const ids: Record<string, string> = {};

  async function customer(label: string, bizId = businessId, optedOut = false) {
    const row = await prisma.customer.create({
      data: {
        businessId: bizId,
        name: `Cliente ${label}`,
        phoneE164: `+5989${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
        optedOut,
      },
      select: { id: true },
    });
    ids[label] = row.id;
    return row.id;
  }

  async function consent(
    customerId: string,
    action: ConsentAction,
    at: Date,
    bizId = businessId,
  ) {
    await prisma.customerConsentEvent.create({
      data: {
        businessId: bizId,
        customerId,
        channel: 'WHATSAPP',
        action,
        source: 'STAFF',
        createdAt: at,
      },
    });
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;
    prisma = new PrismaService();
    try {
      await prisma.$connect();
      businessId = (await createTestBusiness(prisma, `mc-${s}`)).id;
      otherBusinessId = (await createTestBusiness(prisma, `mc2-${s}`)).id;

      const t0 = new Date('2026-01-01T00:00:00Z');
      const t1 = new Date('2026-02-01T00:00:00Z');

      await customer('never');
      await consent(await customer('granted'), 'GRANTED', t0);
      const revoked = await customer('revoked');
      await consent(revoked, 'GRANTED', t0);
      await consent(revoked, 'REVOKED', t1);
      const regranted = await customer('regranted');
      await consent(regranted, 'REVOKED', t0);
      await consent(regranted, 'GRANTED', t1);
      const suppressed = await customer('suppressed');
      await consent(suppressed, 'SUPPRESSED', t0);
      await consent(suppressed, 'GRANTED', t1);
      // Baja por el camino viejo (`optedOut`) con un GRANTED en el registro.
      await consent(
        await customer('legacyOptOut', businessId, true),
        'GRANTED',
        t0,
      );
      // GRANTED de otro negocio: no sirve para este.
      const foreign = await customer('foreign', otherBusinessId);
      await consent(foreign, 'GRANTED', t0, otherBusinessId);

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
      await prisma.customer.deleteMany({ where: { businessId: id } });
      await prisma.business.delete({ where: { id } });
    }
    await prisma.$disconnect();
  });

  it('solo un GRANTED vigente habilita; no darse de baja no es autorización', async () => {
    if (!available) return;
    const allowed = await customersWithWhatsappMarketingConsent(
      prisma,
      businessId,
      Object.values(ids),
    );
    expect(allowed).toEqual(new Set([ids.granted, ids.regranted]));
  });

  it('la baja (registro o espejo optedOut) y la supresión ganan sobre un GRANTED', async () => {
    if (!available) return;
    for (const label of ['revoked', 'suppressed', 'legacyOptOut']) {
      expect(
        await hasWhatsappMarketingConsent(prisma, businessId, ids[label]),
      ).toBe(false);
    }
  });

  it('el consentimiento de otro negocio no cuenta, ni consultado desde este', async () => {
    if (!available) return;
    expect(
      await hasWhatsappMarketingConsent(prisma, businessId, ids.foreign),
    ).toBe(false);
    expect(
      await hasWhatsappMarketingConsent(prisma, otherBusinessId, ids.foreign),
    ).toBe(true);
  });
});
