import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import {
  createTestBusiness,
  makeTestSuffix,
} from '../reviews/reviews.test-helpers';
import { ConsentService } from './consent.service';
import { ConsentAuditService } from './consent-audit.service';

/**
 * Importar autorizaciones anteriores, contra Postgres real. Lo que no puede
 * pasar nunca: que una autorización vieja pise una baja, que la vista previa
 * escriba algo, o que se toque un cliente de otro negocio.
 */
describe('ConsentAuditService (integration)', () => {
  let prisma: PrismaService;
  let consent: ConsentService;
  let service: ConsentAuditService;
  let available = false;
  const s = makeTestSuffix();
  let businessId = '';
  let otherBusinessId = '';
  const phones: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const NOW = new Date();
  const daysAgo = (d: number) =>
    new Date(NOW.getTime() - d * 86_400_000).toISOString();
  const evidence = {
    collectedVia: 'Planilla firmada en el mostrador',
    documentRef: 'Carpeta Drive /consentimientos/2026',
    consentTextShown:
      'Acepto recibir promociones y beneficios del local por WhatsApp.',
  };

  async function customer(label: string, bizId = businessId, optedOut = false) {
    const phone = `+5989${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
    const row = await prisma.customer.create({
      data: { businessId: bizId, name: label, phoneE164: phone, optedOut },
      select: { id: true },
    });
    phones[label] = phone;
    ids[label] = row.id;
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;
    prisma = new PrismaService();
    try {
      await prisma.$connect();
      consent = new ConsentService(prisma);
      service = new ConsentAuditService(
        prisma,
        consent,
        new AuditService(prisma),
      );
      businessId = (await createTestBusiness(prisma, `cai-${s}`)).id;
      otherBusinessId = (await createTestBusiness(prisma, `cai2-${s}`)).id;
      for (const label of [
        'ok',
        'ok2',
        'already',
        'revoked',
        'suppressed',
        'old',
      ]) {
        await customer(label);
      }
      await customer('optout', businessId, true);
      await customer('foreign', otherBusinessId);
      await consent.record({
        businessId,
        customerId: ids.already,
        channel: 'WHATSAPP',
        action: 'GRANTED',
        source: 'CHECKIN_FORM',
      });
      await consent.record({
        businessId,
        customerId: ids.revoked,
        channel: 'WHATSAPP',
        action: 'REVOKED',
        source: 'INBOUND_KEYWORD',
      });
      await consent.record({
        businessId,
        customerId: ids.suppressed,
        channel: 'WHATSAPP',
        action: 'SUPPRESSED',
        source: 'COMPLAINT',
      });
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
      await prisma.auditLog.deleteMany({ where: { businessId: id } });
      await prisma.customer.deleteMany({ where: { businessId: id } });
      await prisma.business.delete({ where: { id } });
    }
    await prisma.$disconnect();
  });

  const rows = () => [
    { phone: phones.ok, grantedAt: daysAgo(120) },
    { phone: phones.ok2, grantedAt: daysAgo(30) },
    { phone: phones.ok2, grantedAt: daysAgo(30) },
    { phone: phones.already, grantedAt: daysAgo(30) },
    { phone: phones.revoked, grantedAt: daysAgo(400) },
    { phone: phones.suppressed, grantedAt: daysAgo(30) },
    { phone: phones.optout, grantedAt: daysAgo(30) },
    { phone: phones.old, grantedAt: daysAgo(900) },
    { phone: phones.foreign, grantedAt: daysAgo(30) },
    { phone: '123', grantedAt: daysAgo(30) },
  ];

  it('la vista previa explica qué entra y qué no, sin escribir nada', async () => {
    if (!available) return;
    const before = await prisma.customerConsentEvent.count({
      where: { businessId },
    });
    const preview = await service.importLegacy(businessId, 'admin-1', {
      channel: 'WHATSAPP',
      evidence,
      rows: rows(),
      confirm: false,
    });
    expect(preview).toMatchObject({ preview: true, toImport: 2, imported: 0 });
    const reasons = Object.fromEntries(
      preview.excluded.map((e) => [e.reason, e.count]),
    );
    expect(reasons).toEqual({
      DUPLICATE_ROW: 1,
      ALREADY_GRANTED: 1,
      OPTED_OUT_OR_REVOKED: 2,
      SUPPRESSED: 1,
      TOO_OLD: 1,
      CUSTOMER_NOT_FOUND: 1,
      INVALID_PHONE: 1,
    });
    expect(
      await prisma.customerConsentEvent.count({ where: { businessId } }),
    ).toBe(before);
  });

  it('con confirmación importa con su fecha y su prueba, y nunca pisa una baja', async () => {
    if (!available) return;
    const result = await service.importLegacy(businessId, 'admin-1', {
      channel: 'WHATSAPP',
      evidence,
      rows: rows(),
      confirm: true,
    });
    expect(result).toMatchObject({ preview: false, imported: 2 });

    const imported = await prisma.customerConsentEvent.findFirstOrThrow({
      where: { customerId: ids.ok, source: 'LEGACY_IMPORT' },
    });
    expect(imported.action).toBe('GRANTED');
    expect(imported.textVersion).toMatch(/^legacy:/);
    expect(imported.note).toContain('Carpeta Drive');
    expect(
      Math.abs(imported.createdAt.getTime() - new Date(daysAgo(120)).getTime()),
    ).toBeLessThan(1000);

    // El que se dio de baja por el camino viejo sigue dado de baja.
    const optout = await prisma.customer.findUniqueOrThrow({
      where: { id: ids.optout },
    });
    expect(optout.optedOut).toBe(true);
    expect(
      await prisma.customerConsentEvent.count({
        where: { customerId: ids.optout },
      }),
    ).toBe(0);
    // El cliente de otro negocio no se tocó.
    expect(
      await prisma.customerConsentEvent.count({
        where: { customerId: ids.foreign },
      }),
    ).toBe(0);

    const audit = await service.audit(businessId);
    expect(audit.whatsapp.granted).toBe(3);
    expect(audit.whatsapp.grantedBySource).toMatchObject({
      LEGACY_IMPORT: 2,
      CHECKIN_FORM: 1,
    });
    expect(audit.customers.active).toBe(7);
  });

  it('sin prueba suficiente no importa nada', async () => {
    if (!available) return;
    await expect(
      service.importLegacy(businessId, 'admin-1', {
        channel: 'WHATSAPP',
        evidence: {
          ...evidence,
          consentTextShown: 'Acepto los términos y condiciones.',
        },
        rows: rows(),
        confirm: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.importLegacy(businessId, 'admin-1', {
        channel: 'WHATSAPP',
        evidence: { ...evidence, documentRef: '' },
        rows: rows(),
        confirm: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
