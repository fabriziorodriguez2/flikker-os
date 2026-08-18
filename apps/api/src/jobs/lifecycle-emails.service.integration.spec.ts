import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { BusinessStatus, ExperienceVersion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LifecycleEmailsService } from './lifecycle-emails.service';
import { EmailService } from './email.service';
import { WhatsAppBspService } from './whatsapp-bsp.service';

/**
 * La migración que agregó `channel` a `EmailLog` cambió el índice único de
 * `(businessId, kind, dedupeKey)` a `(businessId, kind, channel,
 * dedupeKey)` — esto prueba esa migración contra Postgres real, no contra
 * un mock que no sabe qué constraint existe de verdad.
 */
describe('LifecycleEmailsService — unicidad por canal (integration)', () => {
  let prisma: PrismaService;
  let service: LifecycleEmailsService;
  const businesses: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        LifecycleEmailsService,
        EmailService,
        WhatsAppBspService,
      ],
    })
      // Solo Prisma es real acá — lo que se prueba es la constraint única
      // de `EmailLog`, no la entrega real. Sin esto, el resultado depende
      // de si RESEND_API_KEY/WHATSAPP_PROVIDER están configurados en el
      // entorno donde corre el test.
      .overrideProvider(EmailService)
      .useValue({
        isAvailable: () => true,
        send: () => Promise.resolve(null),
      })
      .overrideProvider(WhatsAppBspService)
      .useValue({
        isChannelAvailable: () => Promise.resolve(true),
        sendText: () => Promise.resolve({ whatsappMessageId: 'wa-test' }),
      })
      .compile();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(LifecycleEmailsService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    for (const id of businesses.splice(0)) {
      await prisma.emailLog.deleteMany({ where: { businessId: id } });
      await prisma.customer.deleteMany({ where: { businessId: id } });
      await prisma.business.delete({ where: { id } }).catch(() => undefined);
    }
  });

  async function makeBusiness() {
    const business = await prisma.business.create({
      data: {
        id: randomUUID(),
        name: 'Café Log',
        slug: `log-${randomUUID().slice(0, 8)}`,
        status: BusinessStatus.ACTIVE,
        country: 'UY',
        currency: 'UYU',
        timezone: 'America/Montevideo',
        experienceVersion: ExperienceVersion.CHECKIN_V2,
      },
    });
    businesses.push(business.id);
    return business.id;
  }

  const makeCustomer = (businessId: string) =>
    prisma.customer
      .create({
        data: {
          id: randomUUID(),
          businessId,
          name: 'Cliente Test',
          email: 'cliente@test.com',
          phoneE164: '+59891111111',
        },
      })
      .then((c) => c.id);

  it('el email y el WhatsApp de la misma ocurrencia coexisten — no se leen como duplicado del otro', async () => {
    const businessId = await makeBusiness();
    const customerId = await makeCustomer(businessId);

    const emailOutcome = await service.sendOnce({
      businessId,
      customerId,
      kind: 'birthday',
      channel: 'email',
      dedupeKey: '2026',
      to: 'cliente@test.com',
      subject: 'Feliz cumpleaños',
      html: '<p>Hola</p>',
    });
    const whatsAppOutcome = await service.sendOnce({
      businessId,
      customerId,
      kind: 'birthday',
      channel: 'whatsapp',
      dedupeKey: '2026',
      to: '+59891111111',
      text: 'Feliz cumpleaños',
    });

    expect(emailOutcome).toBe('sent');
    expect(whatsAppOutcome).toBe('sent');
    const rows = await prisma.emailLog.findMany({
      where: { businessId, customerId, kind: 'birthday' },
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.channel).sort()).toEqual(['email', 'whatsapp']);
  });

  it('un segundo intento en el MISMO canal para la misma ocurrencia se lee como duplicado', async () => {
    const businessId = await makeBusiness();
    const customerId = await makeCustomer(businessId);

    const first = await service.sendOnce({
      businessId,
      customerId,
      kind: 'birthday',
      channel: 'whatsapp',
      dedupeKey: '2026',
      to: '+59891111111',
      text: 'Feliz cumpleaños',
    });
    const second = await service.sendOnce({
      businessId,
      customerId,
      kind: 'birthday',
      channel: 'whatsapp',
      dedupeKey: '2026',
      to: '+59891111111',
      text: 'Feliz cumpleaños',
    });

    expect(first).toBe('sent');
    expect(second).toBe('skipped_duplicate');
    const rows = await prisma.emailLog.findMany({
      where: { businessId, customerId, kind: 'birthday', channel: 'whatsapp' },
    });
    expect(rows).toHaveLength(1);
  });
});
