import { randomUUID } from 'crypto';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConsentService } from '../policy/consent.service';
import {
  createTestBusiness,
  makeTestSuffix,
} from '../reviews/reviews.test-helpers';
import { MyFlikkerConsentService } from './my-flikker-consent.service';

/**
 * Preferencias de comunicación del cliente (Mi Flikker y check-in) contra
 * Postgres real: decidir, cambiar de opinión, nunca levantar una supresión y
 * nunca tocar algo fuera de la propia cuenta.
 */
describe('Consentimiento decidido por el cliente (integration)', () => {
  let prisma: PrismaService;
  let consent: ConsentService;
  let service: MyFlikkerConsentService;
  let available = false;
  const s = makeTestSuffix();
  const businesses: string[] = [];
  let accountId = '';
  let otherAccountId = '';

  async function customer(
    businessId: string,
    account: string | null,
    email?: string,
  ) {
    return prisma.customer.create({
      data: {
        businessId,
        name: 'Cliente',
        phoneE164: `+5989${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
        flikkerAccountId: account,
        email: email ?? null,
      },
      select: { id: true },
    });
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;
    prisma = new PrismaService();
    try {
      await prisma.$connect();
      consent = new ConsentService(prisma);
      service = new MyFlikkerConsentService(prisma, consent);
      for (const label of ['a', 'b', 'c']) {
        businesses.push(
          (await createTestBusiness(prisma, `mfc-${label}-${s}`)).id,
        );
      }
      accountId = (
        await prisma.flikkerAccount.create({
          data: {
            phoneE164: `+5989${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
          },
        })
      ).id;
      otherAccountId = (
        await prisma.flikkerAccount.create({
          data: {
            phoneE164: `+5989${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
          },
        })
      ).id;
      await customer(businesses[0], accountId, 'ana@test.local');
      await customer(businesses[1], accountId);
      await customer(businesses[2], otherAccountId);
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
    for (const id of businesses) {
      await prisma.customer.deleteMany({ where: { businessId: id } });
      await prisma.business.delete({ where: { id } });
    }
    await prisma.flikkerAccount.deleteMany({
      where: { id: { in: [accountId, otherAccountId] } },
    });
    await prisma.$disconnect();
  });

  it('lista solo los comercios de la cuenta, sin autorización por defecto', async () => {
    if (!available) return;
    const list = await service.list(accountId);
    expect(list.map((l) => l.businessId).sort()).toEqual(
      [businesses[0], businesses[1]].sort(),
    );
    for (const item of list) {
      expect(item.whatsapp.status).toBe('UNKNOWN');
      expect(item.whatsapp.text).toContain('por WhatsApp');
    }
    expect(
      list.find((l) => l.businessId === businesses[0])!.email.available,
    ).toBe(true);
    expect(
      list.find((l) => l.businessId === businesses[1])!.email.available,
    ).toBe(false);
  });

  it('acepta, retira y vuelve a aceptar; guarda origen y versión del texto', async () => {
    if (!available) return;
    const biz = businesses[0];
    expect((await service.set(accountId, biz, 'WHATSAPP', true)).status).toBe(
      'GRANTED',
    );
    // Repetir el mismo sí no agrega eventos.
    await service.set(accountId, biz, 'WHATSAPP', true);
    expect((await service.set(accountId, biz, 'WHATSAPP', false)).status).toBe(
      'REVOKED',
    );
    expect((await service.set(accountId, biz, 'WHATSAPP', true)).status).toBe(
      'GRANTED',
    );

    const customerRow = await prisma.customer.findFirstOrThrow({
      where: { businessId: biz, flikkerAccountId: accountId },
      select: { id: true, optedOut: true },
    });
    expect(customerRow.optedOut).toBe(false);
    const events = await prisma.customerConsentEvent.findMany({
      where: { customerId: customerRow.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((e) => e.action)).toEqual([
      'GRANTED',
      'REVOKED',
      'GRANTED',
    ]);
    expect(events.every((e) => e.source === 'MI_FLIKKER')).toBe(true);
    expect(events[0].textVersion).toBe('whatsapp-marketing-v2');
  });

  it('la baja apaga el espejo optedOut que leen los caminos viejos', async () => {
    if (!available) return;
    const biz = businesses[1];
    await service.set(accountId, biz, 'WHATSAPP', true);
    await service.set(accountId, biz, 'WHATSAPP', false);
    const row = await prisma.customer.findFirstOrThrow({
      where: { businessId: biz, flikkerAccountId: accountId },
      select: { optedOut: true },
    });
    expect(row.optedOut).toBe(true);
  });

  it('un sí del cliente nunca levanta una supresión', async () => {
    if (!available) return;
    const biz = businesses[0];
    const row = await prisma.customer.findFirstOrThrow({
      where: { businessId: biz, flikkerAccountId: accountId },
      select: { id: true },
    });
    await consent.record({
      businessId: biz,
      customerId: row.id,
      channel: 'WHATSAPP',
      action: 'SUPPRESSED',
      source: 'COMPLAINT',
    });
    expect((await service.set(accountId, biz, 'WHATSAPP', true)).status).toBe(
      'SUPPRESSED',
    );
  });

  it('el email tiene su propio consentimiento, independiente del WhatsApp', async () => {
    if (!available) return;
    const biz = businesses[1];
    expect((await service.set(accountId, biz, 'EMAIL', true)).status).toBe(
      'GRANTED',
    );
    const item = (await service.list(accountId)).find(
      (l) => l.businessId === biz,
    )!;
    expect(item.email.status).toBe('GRANTED');
    expect(item.whatsapp.status).toBe('REVOKED');
  });

  it('no puede tocar un comercio de otra cuenta', async () => {
    if (!available) return;
    await expect(
      service.set(accountId, businesses[2], 'WHATSAPP', true),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.set(accountId, randomUUID(), 'WHATSAPP', true),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
