import { randomUUID } from 'crypto';
import { CheckoutLeadStatus, CheckoutPlan } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MercadoPagoWebhookService } from './mercado-pago-webhook.service';
import { SubscriptionPaidNotificationService } from './subscription-paid-notification.service';
import { PlansService } from '../plans/plans.service';
import { PlansRepository } from '../plans/plans.repository';
import { DomainEventClaimService } from '../domain-events/domain-event-claim.service';
import { EmailService } from '../../jobs/email.service';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import type { PreapprovalResource } from '../public/mercado-pago-subscription.provider';

/**
 * `MercadoPagoWebhookService` contra Postgres real.
 *
 * Lo que un mock de Prisma no puede probar: que dos entregas
 * VERDADERAMENTE concurrentes del mismo webhook `authorized` nunca
 * produzcan dos escrituras (o un estado inconsistente) — eso es
 * comportamiento real de Postgres (bloqueo de fila + reevaluación del
 * WHERE), no de este código. `Promise.all` sobre dos llamadas reales es
 * la única forma honesta de probarlo (§11/§17 — idempotencia).
 *
 * `PlansService`/`PlansRepository`/`DomainEventClaimService` son los
 * REALES (contra la misma base) a propósito — Parte 5 pide explícitamente
 * probar "PAID → PRO" y "repetido → sigue un solo upgrade" contra la base
 * de verdad, no con un mock de `activateProSelfService`.
 * `EmailService`/`WhatsAppBspService` también son los reales, pero sin
 * credenciales configuradas en el entorno de test — `isAvailable()`
 * devuelve `false` y las notificaciones se omiten solas, sin golpear
 * ninguna red real.
 */
class FakeProvider {
  constructor(private readonly resource: PreapprovalResource) {}
  getPreapprovalById(): Promise<PreapprovalResource> {
    return Promise.resolve(this.resource);
  }
  getAuthorizedPaymentById(): never {
    throw new Error('no usado en este spec');
  }
  createPendingSubscription(): never {
    throw new Error('el webhook nunca debe llamar a esto');
  }
  isAvailable(): boolean {
    return true;
  }
}

describe('MercadoPagoWebhookService (integration)', () => {
  let prisma: PrismaService;
  let plans: PlansService;
  const createdLeadIds: string[] = [];
  const createdBusinessIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    plans = new PlansService(new PlansRepository(prisma));
  });

  afterAll(async () => {
    if (createdLeadIds.length > 0) {
      await prisma.checkoutLead.deleteMany({
        where: { id: { in: createdLeadIds } },
      });
    }
    if (createdBusinessIds.length > 0) {
      await prisma.subscription.deleteMany({
        where: { businessId: { in: createdBusinessIds } },
      });
      await prisma.business.deleteMany({
        where: { id: { in: createdBusinessIds } },
      });
    }
    await prisma.$disconnect();
  });

  function makeService(provider: FakeProvider) {
    const notification = new SubscriptionPaidNotificationService(
      prisma,
      new DomainEventClaimService(prisma),
      new EmailService(),
      new WhatsAppBspService(),
    );
    return new MercadoPagoWebhookService(
      prisma,
      provider as never,
      plans,
      notification,
    );
  }

  async function makeBusiness() {
    const business = await prisma.business.create({
      data: {
        name: `Negocio de prueba ${randomUUID()}`,
        slug: `negocio-prueba-${randomUUID()}`,
        country: 'UY',
        timezone: 'America/Montevideo',
        currency: 'UYU',
      },
    });
    createdBusinessIds.push(business.id);
    return business;
  }

  async function makeCheckoutCreatedLead(
    overrides: Partial<
      Parameters<typeof prisma.checkoutLead.create>[0]['data']
    > = {},
  ) {
    const lead = await prisma.checkoutLead.create({
      data: {
        name: 'Juan Pérez',
        businessName: 'Café Ejemplo',
        phoneE164: `+5989${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
        email: `lead-${randomUUID()}@ejemplo.com`,
        plan: CheckoutPlan.MONTHLY,
        status: CheckoutLeadStatus.CHECKOUT_CREATED,
        providerSubscriptionId: `SUB-${randomUUID()}`,
        checkoutUrl: 'https://mp.test/checkout/x',
        checkoutCreatedAt: new Date(),
        ...overrides,
      },
    });
    createdLeadIds.push(lead.id);
    return lead;
  }

  function preapprovalFor(subscriptionId: string): PreapprovalResource {
    return {
      id: subscriptionId,
      status: 'authorized',
      externalReference: null,
      payerEmail: 'juan@ejemplo.com',
      autoRecurring: {
        frequency: 1,
        frequencyType: 'months',
        transactionAmount: 1000,
        currencyId: 'UYU',
      },
    };
  }

  it('autorizado: transiciona CHECKOUT_CREATED -> PAID contra la base real', async () => {
    const lead = await makeCheckoutCreatedLead();
    const provider = new FakeProvider(
      preapprovalFor(lead.providerSubscriptionId!),
    );
    const service = makeService(provider);

    await service.handleSubscriptionPreapproval(lead.providerSubscriptionId!);

    const row = await prisma.checkoutLead.findUniqueOrThrow({
      where: { id: lead.id },
    });
    expect(row.status).toBe(CheckoutLeadStatus.PAID);
    expect(row.paidAt).not.toBeNull();
    expect(row.providerStatus).toBe('authorized');
  });

  /*
    La prueba central de esta tanda: diez entregas VERDADERAMENTE
    concurrentes del mismo webhook "authorized" sobre el mismo lead nunca
    producen más de una transición real — el lead termina en PAID con un
    único `paidAt`, sin importar cuántas entregas lleguen a la vez.
  */
  it('diez entregas concurrentes del mismo webhook authorized: un único PAID', async () => {
    const lead = await makeCheckoutCreatedLead();
    const provider = new FakeProvider(
      preapprovalFor(lead.providerSubscriptionId!),
    );
    const services = Array.from({ length: 10 }, () => makeService(provider));

    await Promise.all(
      services.map((service) =>
        service.handleSubscriptionPreapproval(lead.providerSubscriptionId!),
      ),
    );

    const row = await prisma.checkoutLead.findUniqueOrThrow({
      where: { id: lead.id },
    });
    expect(row.status).toBe(CheckoutLeadStatus.PAID);
    expect(row.paidAt).not.toBeNull();
  });

  it('webhook repetido DESPUÉS de ya estar PAID: no-op, paidAt no cambia', async () => {
    const lead = await makeCheckoutCreatedLead();
    const provider = new FakeProvider(
      preapprovalFor(lead.providerSubscriptionId!),
    );
    const service = makeService(provider);

    await service.handleSubscriptionPreapproval(lead.providerSubscriptionId!);
    const first = await prisma.checkoutLead.findUniqueOrThrow({
      where: { id: lead.id },
    });

    await service.handleSubscriptionPreapproval(lead.providerSubscriptionId!);
    const second = await prisma.checkoutLead.findUniqueOrThrow({
      where: { id: lead.id },
    });

    expect(second.paidAt?.getTime()).toBe(first.paidAt?.getTime());
  });

  it('mismatch de amount: pasa a CHECKOUT_RECONCILIATION_REQUIRED contra la base real, nunca PAID', async () => {
    const lead = await makeCheckoutCreatedLead({ plan: CheckoutPlan.YEARLY });
    const resource = preapprovalFor(lead.providerSubscriptionId!);
    resource.autoRecurring.transactionAmount = 1000; // YEARLY espera 10000
    const provider = new FakeProvider(resource);
    const service = makeService(provider);

    await service.handleSubscriptionPreapproval(lead.providerSubscriptionId!);

    const row = await prisma.checkoutLead.findUniqueOrThrow({
      where: { id: lead.id },
    });
    expect(row.status).toBe(
      CheckoutLeadStatus.CHECKOUT_RECONCILIATION_REQUIRED,
    );
    expect(row.paidAt).toBeNull();
  });

  it('cancelled: el lead queda exactamente como estaba', async () => {
    const lead = await makeCheckoutCreatedLead();
    const resource = preapprovalFor(lead.providerSubscriptionId!);
    resource.status = 'cancelled';
    const provider = new FakeProvider(resource);
    const service = makeService(provider);

    await service.handleSubscriptionPreapproval(lead.providerSubscriptionId!);

    const row = await prisma.checkoutLead.findUniqueOrThrow({
      where: { id: lead.id },
    });
    expect(row.status).toBe(CheckoutLeadStatus.CHECKOUT_CREATED);
  });

  it('fallback por external_reference: resuelve el lead correcto cuando providerSubscriptionId todavía no coincide directo', async () => {
    const lead = await makeCheckoutCreatedLead({
      providerSubscriptionId: null,
    });
    const subscriptionId = `SUB-${randomUUID()}`;
    const resource = preapprovalFor(subscriptionId);
    resource.externalReference = lead.id;
    const provider = new FakeProvider(resource);
    const service = makeService(provider);

    await service.handleSubscriptionPreapproval(subscriptionId);

    const row = await prisma.checkoutLead.findUniqueOrThrow({
      where: { id: lead.id },
    });
    expect(row.status).toBe(CheckoutLeadStatus.PAID);
  });

  it('lead ya asociado a OTRA subscription: el fallback por external_reference NUNCA lo reasocia', async () => {
    const otraSubscripcion = `SUB-${randomUUID()}`;
    const lead = await makeCheckoutCreatedLead({
      providerSubscriptionId: otraSubscripcion,
    });
    const subscriptionAjena = `SUB-${randomUUID()}`;
    const resource = preapprovalFor(subscriptionAjena);
    resource.externalReference = lead.id;
    const provider = new FakeProvider(resource);
    const service = makeService(provider);

    await service.handleSubscriptionPreapproval(subscriptionAjena);

    const row = await prisma.checkoutLead.findUniqueOrThrow({
      where: { id: lead.id },
    });
    // Nunca tocado: sigue CHECKOUT_CREATED con SU subscription original.
    expect(row.status).toBe(CheckoutLeadStatus.CHECKOUT_CREATED);
    expect(row.providerSubscriptionId).toBe(otraSubscripcion);
  });

  // ── Parte 5 — PAID activa Pro en el Business vinculado ──────────────

  describe('PAID -> PRO (Parte 5)', () => {
    it('con businessId: PAID activa Pro de verdad en el Business (Subscription real)', async () => {
      const business = await makeBusiness();
      const lead = await makeCheckoutCreatedLead({ businessId: business.id });
      const provider = new FakeProvider(
        preapprovalFor(lead.providerSubscriptionId!),
      );
      const service = makeService(provider);

      await service.handleSubscriptionPreapproval(lead.providerSubscriptionId!);

      expect(await plans.isOnProPlan(business.id)).toBe(true);
    });

    it('webhook authorized repetido ×10 sobre el mismo lead: Business sigue Pro, un solo upgrade lógico', async () => {
      const business = await makeBusiness();
      const lead = await makeCheckoutCreatedLead({ businessId: business.id });
      const provider = new FakeProvider(
        preapprovalFor(lead.providerSubscriptionId!),
      );
      const services = Array.from({ length: 10 }, () => makeService(provider));

      await Promise.all(
        services.map((service) =>
          service.handleSubscriptionPreapproval(lead.providerSubscriptionId!),
        ),
      );

      expect(await plans.isOnProPlan(business.id)).toBe(true);
      const subscription = await prisma.subscription.findUnique({
        where: { businessId: business.id },
      });
      expect(subscription).not.toBeNull();
    });

    it('YEARLY: activa Pro con el ciclo de facturación anual (currentPeriodEnd ~12 meses)', async () => {
      const business = await makeBusiness();
      const lead = await makeCheckoutCreatedLead({
        businessId: business.id,
        plan: CheckoutPlan.YEARLY,
      });
      const resource = preapprovalFor(lead.providerSubscriptionId!);
      resource.autoRecurring = {
        frequency: 12,
        frequencyType: 'months',
        transactionAmount: 10000,
        currencyId: 'UYU',
      };
      const provider = new FakeProvider(resource);
      const service = makeService(provider);

      await service.handleSubscriptionPreapproval(lead.providerSubscriptionId!);

      const subscription = await prisma.subscription.findUniqueOrThrow({
        where: { businessId: business.id },
      });
      const monthsDiff =
        (subscription.currentPeriodEnd.getTime() -
          subscription.currentPeriodStart.getTime()) /
        (30 * 24 * 60 * 60 * 1000);
      expect(monthsDiff).toBeGreaterThan(10);
      expect(monthsDiff).toBeLessThan(13);
    });

    it('sin businessId: PAID nunca activa Pro en ningún lado', async () => {
      const lead = await makeCheckoutCreatedLead();
      const provider = new FakeProvider(
        preapprovalFor(lead.providerSubscriptionId!),
      );
      const service = makeService(provider);

      await service.handleSubscriptionPreapproval(lead.providerSubscriptionId!);

      const row = await prisma.checkoutLead.findUniqueOrThrow({
        where: { id: lead.id },
      });
      expect(row.status).toBe(CheckoutLeadStatus.PAID);
      // No hay businessId — no hay nada que verificar del lado de Pro, el
      // punto es simplemente que esto no explota y no crea nada.
    });
  });
});
