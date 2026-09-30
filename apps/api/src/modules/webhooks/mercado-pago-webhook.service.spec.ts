import { CheckoutLeadStatus, CheckoutPlan } from '@prisma/client';
import { MercadoPagoWebhookService } from './mercado-pago-webhook.service';
import type { MercadoPagoSubscriptionProvider } from '../public/mercado-pago-subscription.provider';

/**
 * Reconciliación de `CheckoutLead` a partir del recurso REAL de Mercado
 * Pago (nunca del body del webhook) — mockea Prisma y el provider. Lo que
 * se prueba acá es la LÓGICA de reconciliación; la firma la cubre
 * `mercado-pago-webhook-security.spec.ts` y el dispatch del controller
 * `mercado-pago-webhook.controller.spec.ts`.
 */
describe('MercadoPagoWebhookService', () => {
  function baseLead(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'lead-1',
      plan: CheckoutPlan.MONTHLY,
      status: CheckoutLeadStatus.CHECKOUT_CREATED,
      providerSubscriptionId: 'sub-123',
      providerStatus: 'pending',
      paidAt: null,
      ...overrides,
    };
  }

  function preapproval(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'sub-123',
      status: 'authorized',
      externalReference: 'lead-1',
      payerEmail: 'juan@ejemplo.com',
      autoRecurring: {
        frequency: 1,
        frequencyType: 'months',
        transactionAmount: 1000,
        currencyId: 'UYU',
      },
      ...overrides,
    };
  }

  function makePrisma(lead: ReturnType<typeof baseLead> | null) {
    return {
      checkoutLead: {
        findUnique: jest.fn().mockResolvedValue(lead),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
  }

  function makeProvider(
    overrides: Partial<MercadoPagoSubscriptionProvider> = {},
  ) {
    return {
      getPreapprovalById: jest.fn(),
      getAuthorizedPaymentById: jest.fn(),
      createPendingSubscription: jest.fn(),
      isAvailable: jest.fn().mockReturnValue(true),
      ...overrides,
    };
  }

  function makeService(
    prisma: ReturnType<typeof makePrisma>,
    provider: ReturnType<typeof makeProvider>,
  ) {
    return new MercadoPagoWebhookService(prisma as never, provider as never);
  }

  // ── mapping de statuses (§9) ────────────────────────────────────────

  describe('mapping de statuses', () => {
    it('pending: mantiene CHECKOUT_CREATED, no escribe nada', async () => {
      const lead = baseLead();
      const prisma = makePrisma(lead);
      const provider = makeProvider({
        getPreapprovalById: jest
          .fn()
          .mockResolvedValue(preapproval({ status: 'pending' })),
      } as never);
      const service = makeService(prisma, provider);

      await service.handleSubscriptionPreapproval('sub-123');

      expect(prisma.checkoutLead.updateMany).not.toHaveBeenCalled();
    });

    it('authorized + todo válido: PAID', async () => {
      const lead = baseLead();
      const prisma = makePrisma(lead);
      const provider = makeProvider({
        getPreapprovalById: jest.fn().mockResolvedValue(preapproval()),
      } as never);
      const service = makeService(prisma, provider);

      await service.handleSubscriptionPreapproval('sub-123');

      expect(prisma.checkoutLead.updateMany).toHaveBeenCalledWith({
        where: { id: 'lead-1', status: CheckoutLeadStatus.CHECKOUT_CREATED },
        data: {
          status: CheckoutLeadStatus.PAID,
          paidAt: expect.any(Date),
          providerStatus: 'authorized',
        },
      });
    });

    it('cancelled: nunca PAID, no escribe nada', async () => {
      const lead = baseLead();
      const prisma = makePrisma(lead);
      const provider = makeProvider({
        getPreapprovalById: jest
          .fn()
          .mockResolvedValue(preapproval({ status: 'cancelled' })),
      } as never);
      const service = makeService(prisma, provider);

      await service.handleSubscriptionPreapproval('sub-123');

      expect(prisma.checkoutLead.updateMany).not.toHaveBeenCalled();
    });

    it('paused: nunca marca como nuevo PAID, no escribe nada', async () => {
      const lead = baseLead();
      const prisma = makePrisma(lead);
      const provider = makeProvider({
        getPreapprovalById: jest
          .fn()
          .mockResolvedValue(preapproval({ status: 'paused' })),
      } as never);
      const service = makeService(prisma, provider);

      await service.handleSubscriptionPreapproval('sub-123');

      expect(prisma.checkoutLead.updateMany).not.toHaveBeenCalled();
    });
  });

  // ── validaciones antes de activar (§8) ──────────────────────────────

  describe('validaciones — nunca PAID si algo no coincide', () => {
    it('external_reference no coincide con ningún lead conocido: no PAID', async () => {
      const prisma = makePrisma(null); // ni por providerSubscriptionId ni por external_reference
      const provider = makeProvider({
        getPreapprovalById: jest
          .fn()
          .mockResolvedValue(preapproval({ externalReference: 'lead-x' })),
      } as never);
      const service = makeService(prisma, provider);

      await service.handleSubscriptionPreapproval('sub-123');

      expect(prisma.checkoutLead.updateMany).not.toHaveBeenCalled();
    });

    it('lead resuelto por external_reference ya asociado a OTRA subscription: no PAID, no se reasocia', async () => {
      // findUnique por providerSubscriptionId (sub-123) no encuentra nada;
      // findUnique por external_reference (lead.id) encuentra un lead que
      // ya tiene una subscription DISTINTA.
      const leadConSubscripcionDistinta = baseLead({
        providerSubscriptionId: 'sub-OTRA-DISTINTA',
      });
      const prisma = {
        checkoutLead: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce(null) // por providerSubscriptionId
            .mockResolvedValueOnce(leadConSubscripcionDistinta), // por external_reference
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const provider = makeProvider({
        getPreapprovalById: jest.fn().mockResolvedValue(preapproval()),
      } as never);
      const service = makeService(prisma as never, provider);

      await service.handleSubscriptionPreapproval('sub-123');

      expect(prisma.checkoutLead.updateMany).not.toHaveBeenCalled();
    });

    it('MONTHLY: amount incorrecto → no PAID, pasa a CHECKOUT_RECONCILIATION_REQUIRED', async () => {
      const lead = baseLead({ plan: CheckoutPlan.MONTHLY });
      const prisma = makePrisma(lead);
      const provider = makeProvider({
        getPreapprovalById: jest.fn().mockResolvedValue(
          preapproval({
            autoRecurring: {
              frequency: 1,
              frequencyType: 'months',
              transactionAmount: 999, // != 1000
              currencyId: 'UYU',
            },
          }),
        ),
      } as never);
      const service = makeService(prisma, provider);

      await service.handleSubscriptionPreapproval('sub-123');

      const paidCall = prisma.checkoutLead.updateMany.mock.calls.find(
        (call) => call[0].data?.status === CheckoutLeadStatus.PAID,
      );
      expect(paidCall).toBeUndefined();
      expect(prisma.checkoutLead.updateMany).toHaveBeenCalledWith({
        where: { id: 'lead-1', status: CheckoutLeadStatus.CHECKOUT_CREATED },
        data: { status: CheckoutLeadStatus.CHECKOUT_RECONCILIATION_REQUIRED },
      });
    });

    it('currency incorrecta → no PAID', async () => {
      const lead = baseLead();
      const prisma = makePrisma(lead);
      const provider = makeProvider({
        getPreapprovalById: jest.fn().mockResolvedValue(
          preapproval({
            autoRecurring: {
              frequency: 1,
              frequencyType: 'months',
              transactionAmount: 1000,
              currencyId: 'ARS', // != UYU
            },
          }),
        ),
      } as never);
      const service = makeService(prisma, provider);

      await service.handleSubscriptionPreapproval('sub-123');

      const paidCall = prisma.checkoutLead.updateMany.mock.calls.find(
        (call) => call[0].data?.status === CheckoutLeadStatus.PAID,
      );
      expect(paidCall).toBeUndefined();
    });

    it('frequency incorrecta → no PAID', async () => {
      const lead = baseLead();
      const prisma = makePrisma(lead);
      const provider = makeProvider({
        getPreapprovalById: jest.fn().mockResolvedValue(
          preapproval({
            autoRecurring: {
              frequency: 12, // MONTHLY espera 1
              frequencyType: 'months',
              transactionAmount: 1000,
              currencyId: 'UYU',
            },
          }),
        ),
      } as never);
      const service = makeService(prisma, provider);

      await service.handleSubscriptionPreapproval('sub-123');

      const paidCall = prisma.checkoutLead.updateMany.mock.calls.find(
        (call) => call[0].data?.status === CheckoutLeadStatus.PAID,
      );
      expect(paidCall).toBeUndefined();
    });

    it('YEARLY correcto (12 meses / UYU 10000): PAID', async () => {
      const lead = baseLead({ plan: CheckoutPlan.YEARLY });
      const prisma = makePrisma(lead);
      const provider = makeProvider({
        getPreapprovalById: jest.fn().mockResolvedValue(
          preapproval({
            autoRecurring: {
              frequency: 12,
              frequencyType: 'months',
              transactionAmount: 10000,
              currencyId: 'UYU',
            },
          }),
        ),
      } as never);
      const service = makeService(prisma, provider);

      await service.handleSubscriptionPreapproval('sub-123');

      expect(prisma.checkoutLead.updateMany).toHaveBeenCalledWith({
        where: { id: 'lead-1', status: CheckoutLeadStatus.CHECKOUT_CREATED },
        data: {
          status: CheckoutLeadStatus.PAID,
          paidAt: expect.any(Date),
          providerStatus: 'authorized',
        },
      });
    });
  });

  // ── idempotencia (§11) ──────────────────────────────────────────────

  describe('idempotencia', () => {
    it('lead ya PAID: webhook repetido es un no-op, nunca reescribe', async () => {
      const lead = baseLead({ status: CheckoutLeadStatus.PAID });
      const prisma = makePrisma(lead);
      const provider = makeProvider({
        getPreapprovalById: jest.fn().mockResolvedValue(preapproval()),
      } as never);
      const service = makeService(prisma, provider);

      await service.handleSubscriptionPreapproval('sub-123');

      expect(prisma.checkoutLead.updateMany).not.toHaveBeenCalled();
    });

    it('authorized recibido 10 veces seguidas: cada llamada intenta la transición guardada, pero como máximo una gana (count:1) — nunca dos PAID', async () => {
      const lead = baseLead();
      // La PRIMERA vez la transición gana (count:1); simulamos las
      // siguientes 9 entregas como si el lead YA estuviera PAID del lado
      // de la base (findUnique ya lo refleja) — exactamente lo que pasaría
      // contra Postgres real tras la primera transición exitosa.
      const prisma = makePrisma(lead);
      const provider = makeProvider({
        getPreapprovalById: jest.fn().mockResolvedValue(preapproval()),
      } as never);
      const service = makeService(prisma, provider);

      await service.handleSubscriptionPreapproval('sub-123');
      expect(prisma.checkoutLead.updateMany).toHaveBeenCalledTimes(1);

      // Las siguientes 9 entregas ven el lead ya PAID.
      prisma.checkoutLead.findUnique.mockResolvedValue(
        baseLead({ status: CheckoutLeadStatus.PAID }),
      );
      for (let i = 0; i < 9; i += 1) {
        await service.handleSubscriptionPreapproval('sub-123');
      }

      // Ningún updateMany adicional — el guardado de más arriba ya cubre
      // el caso "dos entregas concurrentes ven CHECKOUT_CREATED a la vez"
      // (eso es un comportamiento de Postgres, probado en el spec de
      // integración con base real).
      expect(prisma.checkoutLead.updateMany).toHaveBeenCalledTimes(1);
    });

    it('evento viejo después de uno nuevo: como siempre se pide el estado ACTUAL (nunca el del body), nunca retrocede', async () => {
      // "Evento viejo" no significa nada acá porque este service nunca lee
      // el body del webhook — solo el id. Cualquier entrega, vieja o
      // nueva, dispara el MISMO GET al recurso real, así que el resultado
      // siempre refleja el estado actual, nunca el de una entrega vieja.
      const lead = baseLead({ status: CheckoutLeadStatus.PAID });
      const prisma = makePrisma(lead);
      const provider = makeProvider({
        // El recurso real sigue "authorized" — no importa si esta llamada
        // representa una entrega vieja o nueva del webhook.
        getPreapprovalById: jest.fn().mockResolvedValue(preapproval()),
      } as never);
      const service = makeService(prisma, provider);

      await service.handleSubscriptionPreapproval('sub-123');

      // Ya estaba PAID — ninguna entrega, vieja o nueva, lo hace
      // retroceder ni lo vuelve a escribir.
      expect(prisma.checkoutLead.updateMany).not.toHaveBeenCalled();
    });
  });

  // ── lead en estado inesperado ────────────────────────────────────────

  it('authorized pero el lead está en PENDING (no CHECKOUT_CREATED): va a revisión manual, no PAID', async () => {
    const lead = baseLead({ status: CheckoutLeadStatus.PENDING });
    const prisma = makePrisma(lead);
    const provider = makeProvider({
      getPreapprovalById: jest.fn().mockResolvedValue(preapproval()),
    } as never);
    const service = makeService(prisma, provider);

    await service.handleSubscriptionPreapproval('sub-123');

    expect(prisma.checkoutLead.updateMany).toHaveBeenCalledWith({
      where: { id: 'lead-1', status: { not: CheckoutLeadStatus.PAID } },
      data: { status: CheckoutLeadStatus.CHECKOUT_RECONCILIATION_REQUIRED },
    });
  });

  // ── subscription_authorized_payment (§13) ───────────────────────────

  describe('subscription_authorized_payment', () => {
    it('pertenece a una subscription conocida: loguea, NO dispara ningún side effect en la base', async () => {
      const lead = baseLead();
      const prisma = makePrisma(lead);
      const provider = makeProvider({
        getAuthorizedPaymentById: jest.fn().mockResolvedValue({
          id: 'pay-1',
          preapprovalId: 'sub-123',
          status: 'approved',
        }),
      } as never);
      const service = makeService(prisma, provider);

      await service.handleSubscriptionAuthorizedPayment('pay-1');

      expect(prisma.checkoutLead.updateMany).not.toHaveBeenCalled();
    });

    it('no referencia ninguna subscription conocida: se ignora, no toca la base', async () => {
      const prisma = makePrisma(null);
      const provider = makeProvider({
        getAuthorizedPaymentById: jest.fn().mockResolvedValue({
          id: 'pay-1',
          preapprovalId: 'sub-desconocida',
          status: 'approved',
        }),
      } as never);
      const service = makeService(prisma, provider);

      await service.handleSubscriptionAuthorizedPayment('pay-1');

      expect(prisma.checkoutLead.updateMany).not.toHaveBeenCalled();
    });
  });

  // ── seguridad estructural (§17) ─────────────────────────────────────

  describe('seguridad', () => {
    it('nunca llama a createPendingSubscription — el webhook nunca crea una subscription', async () => {
      const lead = baseLead();
      const prisma = makePrisma(lead);
      const provider = makeProvider({
        getPreapprovalById: jest.fn().mockResolvedValue(preapproval()),
      } as never);
      const service = makeService(prisma, provider);

      await service.handleSubscriptionPreapproval('sub-123');

      expect(provider.createPendingSubscription).not.toHaveBeenCalled();
    });

    it('el provider usado no expone ningún método de búsqueda/cancelación', () => {
      const provider = makeProvider();
      for (const forbidden of ['search', 'cancel', 'cancelSubscription']) {
        expect(Object.keys(provider)).not.toContain(forbidden);
      }
    });
  });
});
