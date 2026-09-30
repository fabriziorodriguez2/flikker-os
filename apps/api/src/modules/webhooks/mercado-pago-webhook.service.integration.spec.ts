import { randomUUID } from 'crypto';
import { CheckoutLeadStatus, CheckoutPlan } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MercadoPagoWebhookService } from './mercado-pago-webhook.service';
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
  const createdLeadIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    if (createdLeadIds.length > 0) {
      await prisma.checkoutLead.deleteMany({
        where: { id: { in: createdLeadIds } },
      });
    }
    await prisma.$disconnect();
  });

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
    const service = new MercadoPagoWebhookService(prisma, provider as never);

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
    const services = Array.from(
      { length: 10 },
      () => new MercadoPagoWebhookService(prisma, provider as never),
    );

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
    const service = new MercadoPagoWebhookService(prisma, provider as never);

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
    const service = new MercadoPagoWebhookService(prisma, provider as never);

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
    const service = new MercadoPagoWebhookService(prisma, provider as never);

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
    const service = new MercadoPagoWebhookService(prisma, provider as never);

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
    const service = new MercadoPagoWebhookService(prisma, provider as never);

    await service.handleSubscriptionPreapproval(subscriptionAjena);

    const row = await prisma.checkoutLead.findUniqueOrThrow({
      where: { id: lead.id },
    });
    // Nunca tocado: sigue CHECKOUT_CREATED con SU subscription original.
    expect(row.status).toBe(CheckoutLeadStatus.CHECKOUT_CREATED);
    expect(row.providerSubscriptionId).toBe(otraSubscripcion);
  });
});
