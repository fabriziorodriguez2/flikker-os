import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CheckoutLeadStatus, CheckoutPlan } from '@prisma/client';
import { CheckoutLeadsService } from './checkout-leads.service';
import {
  MercadoPagoSubscriptionProvider,
  MercadoPagoSubscriptionError,
} from './mercado-pago-subscription.provider';

/**
 * `createCheckout` — la operación que transforma un CheckoutLead PENDING
 * en una subscription real. Mockea Prisma y el provider de Mercado Pago: lo
 * que se prueba acá es la LÓGICA (reglas de estado, qué se persiste, cuándo
 * se llama a MP, el reclamo de concurrencia), no la red ni la base real —
 * eso lo cubren `mercado-pago-subscription.provider.spec.ts` y
 * `checkout-leads-checkout.integration.spec.ts` respectivamente.
 */
describe('CheckoutLeadsService.createCheckout', () => {
  function baseLead(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'lead-1',
      name: 'Juan Pérez',
      businessName: 'Café Ejemplo',
      phoneE164: '+59899123456',
      email: 'juan@ejemplo.com',
      plan: CheckoutPlan.MONTHLY,
      status: CheckoutLeadStatus.PENDING,
      idempotencyKey: null,
      paymentProvider: null,
      externalReference: null,
      checkoutCreatedAt: null,
      paidAt: null,
      providerSubscriptionId: null,
      providerStatus: null,
      providerIdempotencyKey: null,
      checkoutUrl: null,
      checkoutClaimedAt: null,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  function makePrisma(lead: ReturnType<typeof baseLead> | null) {
    return {
      checkoutLead: {
        findUnique: jest.fn().mockResolvedValue(lead),
        // Simula el reclamo atómico `PENDING -> CHECKOUT_CREATING`: gana
        // siempre que el mock no diga lo contrario (los tests de
        // concurrencia lo pisan).
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
  }

  function makeProvider(
    overrides: Partial<MercadoPagoSubscriptionProvider> = {},
  ) {
    return {
      isAvailable: jest.fn().mockReturnValue(true),
      createPendingSubscription: jest.fn().mockResolvedValue({
        providerSubscriptionId: 'PREAPPROVAL-1',
        providerStatus: 'pending',
        checkoutUrl: 'https://mp.test/checkout/1',
        externalReference: 'lead-1',
      }),
      ...overrides,
    };
  }

  function makeService(
    prisma: ReturnType<typeof makePrisma>,
    provider: ReturnType<typeof makeProvider>,
  ) {
    return new CheckoutLeadsService(prisma as never, provider as never);
  }

  // ── camino feliz ────────────────────────────────────────────────────

  it('MONTHLY: le manda al provider plan=MONTHLY', async () => {
    const lead = baseLead({ plan: CheckoutPlan.MONTHLY });
    const prisma = makePrisma(lead);
    const provider = makeProvider();
    const service = makeService(prisma, provider);

    await service.createCheckout('lead-1');

    expect(provider.createPendingSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ plan: CheckoutPlan.MONTHLY }),
    );
  });

  it('YEARLY: le manda al provider plan=YEARLY', async () => {
    const lead = baseLead({ plan: CheckoutPlan.YEARLY });
    const prisma = makePrisma(lead);
    const provider = makeProvider();
    const service = makeService(prisma, provider);

    await service.createCheckout('lead-1');

    expect(provider.createPendingSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ plan: CheckoutPlan.YEARLY }),
    );
  });

  it('checkoutLeadId es el id del lead (external_reference del lado del provider)', async () => {
    const lead = baseLead();
    const prisma = makePrisma(lead);
    const provider = makeProvider();
    const service = makeService(prisma, provider);

    await service.createCheckout('lead-1');

    expect(provider.createPendingSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ checkoutLeadId: 'lead-1' }),
    );
  });

  it('payerEmail viene del lead, no de ningún otro lado', async () => {
    const lead = baseLead({ email: 'ana@otra-cosa.com' });
    const prisma = makePrisma(lead);
    const provider = makeProvider();
    const service = makeService(prisma, provider);

    await service.createCheckout('lead-1');

    expect(provider.createPendingSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ payerEmail: 'ana@otra-cosa.com' }),
    );
  });

  it('persiste providerSubscriptionId, providerStatus, paymentProvider, checkoutCreatedAt y CHECKOUT_CREATED', async () => {
    const lead = baseLead();
    const prisma = makePrisma(lead);
    const provider = makeProvider({
      createPendingSubscription: jest.fn().mockResolvedValue({
        providerSubscriptionId: 'PREAPPROVAL-777',
        providerStatus: 'pending',
        checkoutUrl: 'https://mp.test/checkout/777',
        externalReference: 'lead-1',
      }),
    } as never);
    const service = makeService(prisma, provider);

    const result = await service.createCheckout('lead-1');

    expect(result).toEqual({
      checkoutUrl: 'https://mp.test/checkout/777',
      status: CheckoutLeadStatus.CHECKOUT_CREATED,
    });

    const persistCall = prisma.checkoutLead.updateMany.mock.calls.find(
      (call) => call[0].data?.status === CheckoutLeadStatus.CHECKOUT_CREATED,
    );
    expect(persistCall).toBeDefined();
    expect(persistCall![0]).toEqual({
      where: { id: 'lead-1', status: CheckoutLeadStatus.CHECKOUT_CREATING },
      data: {
        status: CheckoutLeadStatus.CHECKOUT_CREATED,
        paymentProvider: 'MERCADO_PAGO',
        providerSubscriptionId: 'PREAPPROVAL-777',
        providerStatus: 'pending',
        externalReference: 'lead-1',
        checkoutUrl: 'https://mp.test/checkout/777',
        checkoutCreatedAt: expect.any(Date),
        checkoutClaimedAt: null,
      },
    });
  });

  it('antes de persistir CHECKOUT_CREATED, reclama CHECKOUT_CREATING desde PENDING — ÚNICAMENTE desde PENDING', async () => {
    const lead = baseLead();
    const prisma = makePrisma(lead);
    const provider = makeProvider();
    const service = makeService(prisma, provider);

    await service.createCheckout('lead-1');

    const claimCall = prisma.checkoutLead.updateMany.mock.calls[0];
    expect(claimCall[0]).toEqual({
      where: { id: 'lead-1', status: CheckoutLeadStatus.PENDING },
      data: {
        status: CheckoutLeadStatus.CHECKOUT_CREATING,
        checkoutClaimedAt: expect.any(Date),
      },
    });
  });

  // ── error del provider — nunca CHECKOUT_CREATED sin confirmación ───

  it('rechazo CONFIRMADO (retryable=false): vuelve a PENDING, nunca CHECKOUT_RECONCILIATION_REQUIRED', async () => {
    const lead = baseLead();
    const prisma = makePrisma(lead);
    const provider = makeProvider({
      createPendingSubscription: jest
        .fn()
        .mockRejectedValue(
          new MercadoPagoSubscriptionError('plan inválido', false, 400),
        ),
    } as never);
    const service = makeService(prisma, provider);

    await expect(service.createCheckout('lead-1')).rejects.toThrow(
      ServiceUnavailableException,
    );

    const persistCall = prisma.checkoutLead.updateMany.mock.calls.find(
      (call) => call[0].data?.status === CheckoutLeadStatus.CHECKOUT_CREATED,
    );
    expect(persistCall).toBeUndefined();

    const releaseCall = prisma.checkoutLead.updateMany.mock.calls.find(
      (call) => call[0].data?.status === CheckoutLeadStatus.PENDING,
    );
    expect(releaseCall).toBeDefined();
    expect(releaseCall![0]).toEqual({
      where: { id: 'lead-1', status: CheckoutLeadStatus.CHECKOUT_CREATING },
      data: { status: CheckoutLeadStatus.PENDING, checkoutClaimedAt: null },
    });
  });

  it('falla AMBIGUA (retryable=true — timeout/5xx/429): pasa a CHECKOUT_RECONCILIATION_REQUIRED, NUNCA a PENDING', async () => {
    const lead = baseLead();
    const prisma = makePrisma(lead);
    const provider = makeProvider({
      createPendingSubscription: jest
        .fn()
        .mockRejectedValue(
          new MercadoPagoSubscriptionError('caído', true, 503),
        ),
    } as never);
    const service = makeService(prisma, provider);

    await expect(service.createCheckout('lead-1')).rejects.toThrow(
      ServiceUnavailableException,
    );

    const persistCall = prisma.checkoutLead.updateMany.mock.calls.find(
      (call) => call[0].data?.status === CheckoutLeadStatus.CHECKOUT_CREATED,
    );
    expect(persistCall).toBeUndefined();

    const pendingCall = prisma.checkoutLead.updateMany.mock.calls.find(
      (call) => call[0].data?.status === CheckoutLeadStatus.PENDING,
    );
    expect(pendingCall).toBeUndefined();

    const reconciliationCall = prisma.checkoutLead.updateMany.mock.calls.find(
      (call) =>
        call[0].data?.status ===
        CheckoutLeadStatus.CHECKOUT_RECONCILIATION_REQUIRED,
    );
    expect(reconciliationCall).toBeDefined();
    expect(reconciliationCall![0]).toEqual({
      where: { id: 'lead-1', status: CheckoutLeadStatus.CHECKOUT_CREATING },
      data: { status: CheckoutLeadStatus.CHECKOUT_RECONCILIATION_REQUIRED },
    });
    // `checkoutClaimedAt` NO se toca — queda como evidencia de cuándo se
    // intentó, para quien revise manualmente.
    expect(reconciliationCall![0].data).not.toHaveProperty('checkoutClaimedAt');
  });

  it('error inesperado (no MercadoPagoSubscriptionError) también se trata como AMBIGUO por precaución', async () => {
    const lead = baseLead();
    const prisma = makePrisma(lead);
    const provider = makeProvider({
      createPendingSubscription: jest
        .fn()
        .mockRejectedValue(new Error('bug inesperado')),
    } as never);
    const service = makeService(prisma, provider);

    await expect(service.createCheckout('lead-1')).rejects.toThrow(
      'bug inesperado',
    );

    const reconciliationCall = prisma.checkoutLead.updateMany.mock.calls.find(
      (call) =>
        call[0].data?.status ===
        CheckoutLeadStatus.CHECKOUT_RECONCILIATION_REQUIRED,
    );
    expect(reconciliationCall).toBeDefined();
  });

  it('CHECKOUT_RECONCILIATION_REQUIRED: ConflictException inmediato, nunca reintenta el POST', async () => {
    const lead = baseLead({
      status: CheckoutLeadStatus.CHECKOUT_RECONCILIATION_REQUIRED,
    });
    const prisma = makePrisma(lead);
    const provider = makeProvider();
    const service = makeService(prisma, provider);

    await expect(service.createCheckout('lead-1')).rejects.toThrow(
      ConflictException,
    );
    expect(provider.createPendingSubscription).not.toHaveBeenCalled();
    expect(prisma.checkoutLead.updateMany).not.toHaveBeenCalled();
  });

  it('sin MERCADO_PAGO_ACCESS_TOKEN (isAvailable=false): 503, nunca llama al provider ni intenta reclamar', async () => {
    const lead = baseLead();
    const prisma = makePrisma(lead);
    const provider = makeProvider({
      isAvailable: jest.fn().mockReturnValue(false),
    } as never);
    const service = makeService(prisma, provider);

    await expect(service.createCheckout('lead-1')).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(provider.createPendingSubscription).not.toHaveBeenCalled();
    expect(prisma.checkoutLead.updateMany).not.toHaveBeenCalled();
  });

  // ── idempotencia hacia Mercado Pago (defensa secundaria) ────────────

  it('genera y persiste la providerIdempotencyKey (vía update, no updateMany) tras ganar el reclamo', async () => {
    const lead = baseLead({ providerIdempotencyKey: null });
    const prisma = makePrisma(lead);
    const provider = makeProvider();
    const service = makeService(prisma, provider);

    await service.createCheckout('lead-1');

    expect(prisma.checkoutLead.update).toHaveBeenCalledWith({
      where: { id: 'lead-1' },
      data: { providerIdempotencyKey: expect.any(String) },
    });
    const persistedKey = (
      prisma.checkoutLead.update.mock.calls[0][0] as {
        data: { providerIdempotencyKey: string };
      }
    ).data.providerIdempotencyKey;
    expect(provider.createPendingSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: persistedKey }),
    );
  });

  it('si ya existe una providerIdempotencyKey (retomando un reclamo viejo), la reusa sin generar una nueva', async () => {
    const lead = baseLead({ providerIdempotencyKey: 'key-ya-persistida' });
    const prisma = makePrisma(lead);
    const provider = makeProvider();
    const service = makeService(prisma, provider);

    await service.createCheckout('lead-1');

    expect(prisma.checkoutLead.update).not.toHaveBeenCalled();
    expect(provider.createPendingSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'key-ya-persistida' }),
    );
  });

  // ── concurrencia — nunca dos llamadas a Mercado Pago para el mismo lead ─

  describe('concurrencia', () => {
    beforeEach(() => {
      jest.useFakeTimers({ advanceTimers: true });
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('si pierde el reclamo y el ganador termina en CHECKOUT_CREATED, lo relee y NUNCA llama al provider', async () => {
      const lead = baseLead();
      const prisma = makePrisma(lead);
      // Pierde el reclamo (otro request ya lo tiene).
      prisma.checkoutLead.updateMany.mockResolvedValueOnce({ count: 0 });
      // La espera poll-ea: primeras vueltas todavía CHECKOUT_CREATING, al
      // final el ganador ya terminó.
      prisma.checkoutLead.findUnique
        .mockResolvedValueOnce(lead) // lectura inicial
        .mockResolvedValueOnce({
          status: CheckoutLeadStatus.CHECKOUT_CREATING,
          checkoutUrl: null,
        })
        .mockResolvedValueOnce({
          status: CheckoutLeadStatus.CHECKOUT_CREATED,
          checkoutUrl: 'https://mp.test/checkout/del-ganador',
        });
      const provider = makeProvider();
      const service = makeService(prisma, provider);

      const result = await service.createCheckout('lead-1');

      expect(result).toEqual({
        checkoutUrl: 'https://mp.test/checkout/del-ganador',
        status: CheckoutLeadStatus.CHECKOUT_CREATED,
      });
      expect(provider.createPendingSubscription).not.toHaveBeenCalled();
    });

    it('si pierde el reclamo y el ganador FALLA (vuelve a PENDING), reintenta tomar el reclamo él mismo', async () => {
      const lead = baseLead();
      const prisma = makePrisma(lead);
      prisma.checkoutLead.updateMany
        .mockResolvedValueOnce({ count: 0 }) // pierde el primer reclamo
        .mockResolvedValueOnce({ count: 1 }); // segundo intento: ahora gana
      prisma.checkoutLead.findUnique
        .mockResolvedValueOnce(lead) // lectura inicial
        .mockResolvedValueOnce({
          status: CheckoutLeadStatus.PENDING,
          checkoutUrl: null,
        }); // el ganador original liberó el reclamo
      const provider = makeProvider();
      const service = makeService(prisma, provider);

      const result = await service.createCheckout('lead-1');

      expect(result.status).toBe(CheckoutLeadStatus.CHECKOUT_CREATED);
      expect(provider.createPendingSubscription).toHaveBeenCalledTimes(1);
    });

    it('si pierde el reclamo y el ganador termina AMBIGUO (CHECKOUT_RECONCILIATION_REQUIRED), NUNCA reintenta ni llama al provider', async () => {
      const lead = baseLead();
      const prisma = makePrisma(lead);
      // Pierde el reclamo las DOS veces que el loop de `createCheckout` lo
      // intenta — igual que pasaría contra Postgres real, ya que el
      // status real ya no es PENDING en ninguna de las dos vueltas.
      prisma.checkoutLead.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 });
      prisma.checkoutLead.findUnique
        .mockResolvedValueOnce(lead) // lectura inicial
        .mockResolvedValueOnce({
          status: CheckoutLeadStatus.CHECKOUT_RECONCILIATION_REQUIRED,
          checkoutUrl: null,
        })
        .mockResolvedValueOnce({
          status: CheckoutLeadStatus.CHECKOUT_RECONCILIATION_REQUIRED,
          checkoutUrl: null,
        });
      const provider = makeProvider();
      const service = makeService(prisma, provider);

      await expect(service.createCheckout('lead-1')).rejects.toThrow(
        ConflictException,
      );
      expect(provider.createPendingSubscription).not.toHaveBeenCalled();
    });

    it('si nadie resuelve en la ventana de espera, 409 explícito — nunca llama al provider', async () => {
      const lead = baseLead();
      const prisma = makePrisma(lead);
      prisma.checkoutLead.updateMany.mockResolvedValue({ count: 0 });
      prisma.checkoutLead.findUnique.mockResolvedValue({
        status: CheckoutLeadStatus.CHECKOUT_CREATING,
        checkoutUrl: null,
      });
      const provider = makeProvider();
      const service = makeService(prisma, provider);

      // Esta ruta espera DOS ventanas completas (el loop de `createCheckout`
      // intenta reclamar dos veces, cada una espera hasta
      // CONCURRENT_WAIT_POLLS x CONCURRENT_WAIT_INTERVAL_MS) — con fake
      // timers el tiempo REAL del test sigue acotado, pero el timeout por
      // default de Jest (5000ms) puede no alcanzar con el overhead del
      // runner. Se sube explícitamente en vez de acortar la ventana real de
      // espera del código de producción.
      await expect(service.createCheckout('lead-1')).rejects.toThrow(
        ConflictException,
      );
      expect(provider.createPendingSubscription).not.toHaveBeenCalled();
    }, 15000);
  });

  // ── reglas de estado ─────────────────────────────────────────────────

  it('lead inexistente: NotFoundException', async () => {
    const prisma = makePrisma(null);
    const provider = makeProvider();
    const service = makeService(prisma, provider);

    await expect(service.createCheckout('no-existe')).rejects.toThrow(
      NotFoundException,
    );
    expect(provider.createPendingSubscription).not.toHaveBeenCalled();
  });

  it('PAID: ConflictException, nunca crea una subscription nueva', async () => {
    const lead = baseLead({ status: CheckoutLeadStatus.PAID });
    const prisma = makePrisma(lead);
    const provider = makeProvider();
    const service = makeService(prisma, provider);

    await expect(service.createCheckout('lead-1')).rejects.toThrow(
      ConflictException,
    );
    expect(provider.createPendingSubscription).not.toHaveBeenCalled();
  });

  it('FAILED: ConflictException — la política de reintento queda pendiente a propósito', async () => {
    const lead = baseLead({ status: CheckoutLeadStatus.FAILED });
    const prisma = makePrisma(lead);
    const provider = makeProvider();
    const service = makeService(prisma, provider);

    await expect(service.createCheckout('lead-1')).rejects.toThrow(
      ConflictException,
    );
    expect(provider.createPendingSubscription).not.toHaveBeenCalled();
  });

  it('EXPIRED: ConflictException, mismo criterio que FAILED', async () => {
    const lead = baseLead({ status: CheckoutLeadStatus.EXPIRED });
    const prisma = makePrisma(lead);
    const provider = makeProvider();
    const service = makeService(prisma, provider);

    await expect(service.createCheckout('lead-1')).rejects.toThrow(
      ConflictException,
    );
    expect(provider.createPendingSubscription).not.toHaveBeenCalled();
  });

  it('CHECKOUT_CREATED con checkoutUrl guardada: la devuelve directo, sin llamar a MP ni tocar la base', async () => {
    const lead = baseLead({
      status: CheckoutLeadStatus.CHECKOUT_CREATED,
      checkoutUrl: 'https://mp.test/checkout/ya-existente',
      providerSubscriptionId: 'PREAPPROVAL-viejo',
      providerIdempotencyKey: 'key-vieja',
    });
    const prisma = makePrisma(lead);
    const provider = makeProvider();
    const service = makeService(prisma, provider);

    const result = await service.createCheckout('lead-1');

    expect(result).toEqual({
      checkoutUrl: 'https://mp.test/checkout/ya-existente',
      status: CheckoutLeadStatus.CHECKOUT_CREATED,
    });
    expect(provider.createPendingSubscription).not.toHaveBeenCalled();
    expect(prisma.checkoutLead.updateMany).not.toHaveBeenCalled();
    expect(prisma.checkoutLead.update).not.toHaveBeenCalled();
  });

  it('PAID no crea una subscription nueva aunque quedara un providerSubscriptionId viejo', async () => {
    const lead = baseLead({
      status: CheckoutLeadStatus.PAID,
      providerSubscriptionId: 'PREAPPROVAL-ya-pagado',
      checkoutUrl: 'https://mp.test/checkout/ya-pagado',
    });
    const prisma = makePrisma(lead);
    const provider = makeProvider();
    const service = makeService(prisma, provider);

    await expect(service.createCheckout('lead-1')).rejects.toThrow(
      ConflictException,
    );
    expect(provider.createPendingSubscription).not.toHaveBeenCalled();
  });
});
