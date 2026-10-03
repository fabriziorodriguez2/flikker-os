import { randomUUID } from 'crypto';
import { CheckoutLeadStatus, CheckoutPlan } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthRepository } from './auth.repository';
import { PreOnboardingCheckoutService } from './pre-onboarding-checkout.service';
import { MercadoPagoWebhookService } from '../webhooks/mercado-pago-webhook.service';
import { SubscriptionPaidNotificationService } from '../webhooks/subscription-paid-notification.service';
import { PlansService } from '../plans/plans.service';
import { PlansRepository } from '../plans/plans.repository';
import { DomainEventClaimService } from '../domain-events/domain-event-claim.service';
import { EmailService } from '../../jobs/email.service';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import type { PreapprovalResource } from '../public/mercado-pago-subscription.provider';

/**
 * `PreOnboardingCheckoutService#getStatus` contra Postgres real.
 *
 * Lo nuevo que esto prueba (no cubierto por
 * `mercado-pago-webhook.service.integration.spec.ts`, que ejercita
 * `handleSubscriptionPreapproval` directo): que el endpoint de status
 * reconcilia con esa MISMA lógica y después vuelve a leer el lead —
 * `getStatus` nunca debe devolver el estado viejo si la reconciliación
 * cambió algo. Un stub de `MercadoPagoSubscriptionProvider` reemplaza la
 * única llamada de red real (`getPreapprovalById`); todo lo demás —
 * Prisma, `PlansService`, `DomainEventClaimService` — es real.
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
    throw new Error('getStatus nunca debe crear un checkout nuevo');
  }
}

describe('PreOnboardingCheckoutService#getStatus (integration)', () => {
  let prisma: PrismaService;
  const createdUserIds: string[] = [];
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
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  function makeService(provider: FakeProvider) {
    const plans = new PlansService(new PlansRepository(prisma));
    const notification = new SubscriptionPaidNotificationService(
      prisma,
      new DomainEventClaimService(prisma),
      new EmailService(),
      new WhatsAppBspService(),
    );
    const webhook = new MercadoPagoWebhookService(
      prisma,
      provider as never,
      plans,
      notification,
    );
    const repository = new AuthRepository(prisma);
    return new PreOnboardingCheckoutService(repository, {} as never, webhook);
  }

  async function makeUser() {
    const user = await prisma.user.create({
      data: {
        email: `status-${randomUUID()}@test.local`,
        passwordHash: 'x',
        firstName: 'Ana',
        lastName: 'Pérez',
        emailVerifiedAt: new Date(),
        pendingUpgradePlan: CheckoutPlan.MONTHLY,
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function makeCheckoutCreatedLead(userId: string) {
    const lead = await prisma.checkoutLead.create({
      data: {
        requestedByUserId: userId,
        businessId: null,
        email: `lead-${randomUUID()}@test.local`,
        plan: CheckoutPlan.MONTHLY,
        status: CheckoutLeadStatus.CHECKOUT_CREATED,
        providerSubscriptionId: `SUB-${randomUUID()}`,
        checkoutUrl: 'https://mp.test/checkout/x',
        checkoutCreatedAt: new Date(),
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
      payerEmail: 'ana@test.local',
      autoRecurring: {
        frequency: 1,
        frequencyType: 'months',
        transactionAmount: 1000,
        currencyId: 'UYU',
      },
    };
  }

  it('CHECKOUT_CREATED + MP authorized: reconcilia y devuelve PAID ya actualizado, sin crear ningún Business', async () => {
    const user = await makeUser();
    const lead = await makeCheckoutCreatedLead(user.id);
    const provider = new FakeProvider(
      preapprovalFor(lead.providerSubscriptionId!),
    );
    const service = makeService(provider);

    const result = await service.getStatus(user.id);

    expect(result.status).toBe(CheckoutLeadStatus.PAID);
    expect(result.businessId).toBeNull();

    const row = await prisma.checkoutLead.findUniqueOrThrow({
      where: { id: lead.id },
    });
    expect(row.status).toBe(CheckoutLeadStatus.PAID);
    expect(row.businessId).toBeNull();
  });

  it('sin ningún checkout: status/plan/businessId todos null, sin tocar la base', async () => {
    const user = await makeUser();
    const service = makeService(new FakeProvider(preapprovalFor('sub-unused')));

    const result = await service.getStatus(user.id);

    expect(result).toEqual({ status: null, plan: null, businessId: null });
  });

  it('PENDING (reconciliación en curso en otro lado): no intenta reconciliar porque no hay providerSubscriptionId todavía', async () => {
    const user = await makeUser();
    const lead = await prisma.checkoutLead.create({
      data: {
        requestedByUserId: user.id,
        businessId: null,
        email: user.email,
        plan: CheckoutPlan.MONTHLY,
        status: CheckoutLeadStatus.CHECKOUT_CREATING,
      },
    });
    createdLeadIds.push(lead.id);
    const service = makeService(new FakeProvider(preapprovalFor('sub-unused')));

    const result = await service.getStatus(user.id);

    expect(result.status).toBe(CheckoutLeadStatus.CHECKOUT_CREATING);
  });

  it('IDEMPOTENTE: consultar el status repetidas veces después de PAID sigue devolviendo PAID, sin duplicar nada', async () => {
    const user = await makeUser();
    const lead = await makeCheckoutCreatedLead(user.id);
    const provider = new FakeProvider(
      preapprovalFor(lead.providerSubscriptionId!),
    );
    const service = makeService(provider);

    await service.getStatus(user.id);
    const second = await service.getStatus(user.id);
    const third = await service.getStatus(user.id);

    expect(second.status).toBe(CheckoutLeadStatus.PAID);
    expect(third.status).toBe(CheckoutLeadStatus.PAID);
  });
});
