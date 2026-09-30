import { randomUUID } from 'crypto';
import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CheckoutLeadStatus, CheckoutPlan } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CheckoutLeadsService } from './checkout-leads.service';
import {
  MercadoPagoSubscriptionError,
  type CreatePendingSubscriptionInput,
  type CreatePendingSubscriptionResult,
} from './mercado-pago-subscription.provider';

/**
 * `createCheckout` contra Postgres real.
 *
 * Lo que un mock de Prisma NO puede probar es exactamente lo que más
 * importa acá: que el reclamo atómico `PENDING -> CHECKOUT_CREATING`
 * realmente serializa dos requests concurrentes contra la MISMA fila —
 * eso es un comportamiento de Postgres (bloqueo de fila + reevaluación
 * del WHERE tras el commit del primero), no de nuestro código.
 * `Promise.all` sobre dos llamadas reales a `createCheckout` es la única
 * forma honesta de probarlo.
 *
 * Distinto del test equivalente para la Orders API: acá el punto central
 * NO es "las dos llamadas comparten la misma key" — es que el provider de
 * Mercado Pago se llama EXACTAMENTE UNA VEZ entre las dos, porque
 * `/preapproval` no garantiza deduplicar dos llamadas concurrentes como sí
 * lo hace la Orders API.
 *
 * El provider de Mercado Pago se reemplaza por un doble de prueba — nunca
 * se golpea la red real en la suite normal.
 */
class FakeMercadoPagoProvider {
  calls: CreatePendingSubscriptionInput[] = [];

  isAvailable(): boolean {
    return true;
  }

  createPendingSubscription(
    input: CreatePendingSubscriptionInput,
  ): Promise<CreatePendingSubscriptionResult> {
    this.calls.push(input);
    // `provider_subscription_id` tiene un UNIQUE real en la base — un
    // contador que arranca en 0 por instancia colisionaría entre tests
    // distintos (las filas de tests previos siguen en la tabla hasta
    // `afterAll`). Un id derivado de `randomUUID()` es único de verdad,
    // igual que lo sería el id real que devuelve Mercado Pago.
    const fakeSubscriptionId = `FAKE-SUB-${randomUUID()}`;
    return Promise.resolve({
      providerSubscriptionId: fakeSubscriptionId,
      providerStatus: 'pending',
      checkoutUrl: `https://mp.test/checkout/${fakeSubscriptionId}`,
      externalReference: input.checkoutLeadId,
    });
  }
}

class UnavailableMercadoPagoProvider {
  isAvailable(): boolean {
    return false;
  }
  createPendingSubscription(): Promise<CreatePendingSubscriptionResult> {
    throw new Error('no debería llamarse — isAvailable() es false');
  }
}

/**
 * `retryable` distingue las dos naturalezas de falla que
 * `CheckoutLeadsService` trata distinto: `false` = rechazo confirmado por
 * MP (ej. 400 — vuelve a PENDING), `true` = ambiguo (timeout/5xx/429 —
 * pasa a CHECKOUT_RECONCILIATION_REQUIRED, nunca se reintenta solo).
 */
class FailingMercadoPagoProvider {
  calls = 0;
  constructor(
    private readonly retryable: boolean,
    private readonly statusCode: number,
  ) {}
  isAvailable(): boolean {
    return true;
  }
  createPendingSubscription(): Promise<CreatePendingSubscriptionResult> {
    this.calls += 1;
    return Promise.reject(
      new MercadoPagoSubscriptionError(
        'Mercado Pago caído (simulado)',
        this.retryable,
        this.statusCode,
      ),
    );
  }
}

describe('CheckoutLeadsService.createCheckout (integration)', () => {
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

  async function makePendingLead(
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
        status: CheckoutLeadStatus.PENDING,
        ...overrides,
      },
    });
    createdLeadIds.push(lead.id);
    return lead;
  }

  it('crea el checkout y deja la fila exactamente como se espera', async () => {
    const lead = await makePendingLead({ plan: CheckoutPlan.YEARLY });
    const provider = new FakeMercadoPagoProvider();
    const service = new CheckoutLeadsService(prisma, provider as never);

    const result = await service.createCheckout(lead.id);

    expect(result.status).toBe(CheckoutLeadStatus.CHECKOUT_CREATED);
    expect(result.checkoutUrl).toMatch(/^https:\/\/mp\.test\/checkout\//);

    const row = await prisma.checkoutLead.findUniqueOrThrow({
      where: { id: lead.id },
    });
    expect(row.status).toBe(CheckoutLeadStatus.CHECKOUT_CREATED);
    expect(row.paymentProvider).toBe('MERCADO_PAGO');
    expect(row.externalReference).toBe(lead.id);
    expect(row.providerSubscriptionId).toMatch(/^FAKE-SUB-/);
    expect(row.providerStatus).toBe('pending');
    expect(row.checkoutUrl).toBe(result.checkoutUrl);
    expect(row.checkoutCreatedAt).not.toBeNull();
    expect(row.checkoutClaimedAt).toBeNull();
    expect(row.providerIdempotencyKey).not.toBeNull();

    // El plan que "viajó" al provider fue el del plan real del lead —
    // nunca un monto/moneda/frecuencia propios (esos ya no existen en
    // este flujo, viven del lado del plan de Mercado Pago).
    expect(provider.calls[0].plan).toBe(CheckoutPlan.YEARLY);
    expect(provider.calls[0].checkoutLeadId).toBe(lead.id);
    expect(provider.calls[0].payerEmail).toBe(lead.email);
  });

  /*
    La prueba central de esta tanda: dos requests VERDADERAMENTE
    concurrentes sobre el mismo lead nunca llaman al provider dos veces —
    a diferencia del diseño con Orders API (donde las dos SÍ podían llamar
    a MP, protegidas por compartir la misma idempotency key), acá el
    reclamo de base (`CHECKOUT_CREATING`) es la única garantía, porque
    `/preapproval` no promete deduplicar dos llamadas concurrentes.
  */
  it('dos requests concurrentes sobre el mismo lead: el provider se llama UNA sola vez', async () => {
    const lead = await makePendingLead();
    const provider = new FakeMercadoPagoProvider();
    const serviceA = new CheckoutLeadsService(prisma, provider as never);
    const serviceB = new CheckoutLeadsService(prisma, provider as never);

    const [resultA, resultB] = await Promise.all([
      serviceA.createCheckout(lead.id),
      serviceB.createCheckout(lead.id),
    ]);

    // El punto central: UNA sola llamada real a Mercado Pago entre las dos.
    expect(provider.calls).toHaveLength(1);

    // Y los dos callers reciben el MISMO checkoutUrl — el que perdió el
    // reclamo esperó y releyó el resultado del que ganó, nunca creó el
    // suyo propio.
    expect(resultA.checkoutUrl).toBeDefined();
    expect(resultB.checkoutUrl).toBe(resultA.checkoutUrl);

    const row = await prisma.checkoutLead.findUniqueOrThrow({
      where: { id: lead.id },
    });
    expect(row.status).toBe(CheckoutLeadStatus.CHECKOUT_CREATED);
    expect(row.providerSubscriptionId).toMatch(/^FAKE-SUB-/);
  });

  it('reintento (segunda llamada tras éxito) es un SELECT — no llama de nuevo al provider', async () => {
    const lead = await makePendingLead();
    const provider = new FakeMercadoPagoProvider();
    const service = new CheckoutLeadsService(prisma, provider as never);

    const first = await service.createCheckout(lead.id);
    const second = await service.createCheckout(lead.id);

    expect(second).toEqual(first);
    expect(provider.calls).toHaveLength(1);
  });

  it('rechazo CONFIRMADO de Mercado Pago (400): el lead vuelve a PENDING, nunca queda trabado', async () => {
    const lead = await makePendingLead();
    const provider = new FailingMercadoPagoProvider(false, 400);
    const service = new CheckoutLeadsService(prisma, provider as never);

    await expect(service.createCheckout(lead.id)).rejects.toThrow(
      ServiceUnavailableException,
    );

    const row = await prisma.checkoutLead.findUniqueOrThrow({
      where: { id: lead.id },
    });
    expect(row.status).toBe(CheckoutLeadStatus.PENDING);
    expect(row.checkoutClaimedAt).toBeNull();
    expect(row.providerSubscriptionId).toBeNull();
    expect(provider.calls).toBe(1);

    // Y un reintento posterior, ya sin la falla, sí puede completar.
    const workingProvider = new FakeMercadoPagoProvider();
    const retryService = new CheckoutLeadsService(
      prisma,
      workingProvider as never,
    );
    const result = await retryService.createCheckout(lead.id);
    expect(result.status).toBe(CheckoutLeadStatus.CHECKOUT_CREATED);
  });

  /*
    Test de regresión del incidente 2026-09-30: un resultado AMBIGUO
    (timeout/5xx/429 — no sabemos si Mercado Pago llegó a crear la
    subscription) NUNCA se reconcilia solo. El lead queda en
    CHECKOUT_RECONCILIATION_REQUIRED, y un segundo intento de
    `createCheckout` sobre ese mismo lead tiene que rechazarse SIN volver
    a llamar al provider — antes del incidente, ese "no sé qué pasó" se
    resolvía con un GET de búsqueda que terminó asociando (y cancelando)
    una subscription real ajena.
  */
  it('falla AMBIGUA de Mercado Pago (503): el lead pasa a CHECKOUT_RECONCILIATION_REQUIRED y un reintento NO llama al provider de nuevo', async () => {
    const lead = await makePendingLead();
    const provider = new FailingMercadoPagoProvider(true, 503);
    const service = new CheckoutLeadsService(prisma, provider as never);

    await expect(service.createCheckout(lead.id)).rejects.toThrow(
      ServiceUnavailableException,
    );

    const row = await prisma.checkoutLead.findUniqueOrThrow({
      where: { id: lead.id },
    });
    expect(row.status).toBe(
      CheckoutLeadStatus.CHECKOUT_RECONCILIATION_REQUIRED,
    );
    expect(row.providerSubscriptionId).toBeNull();
    expect(provider.calls).toBe(1);

    // Un segundo intento — mismo lead, mismo provider que SÍ funcionaría
    // ahora — nunca debe volver a llamarlo: el estado exige revisión
    // manual, no un reintento automático.
    await expect(service.createCheckout(lead.id)).rejects.toThrow(
      ConflictException,
    );
    expect(provider.calls).toBe(1);

    // Ni siquiera con un provider distinto que SÍ funcionaría.
    const workingProvider = new FakeMercadoPagoProvider();
    const anotherService = new CheckoutLeadsService(
      prisma,
      workingProvider as never,
    );
    await expect(anotherService.createCheckout(lead.id)).rejects.toThrow(
      ConflictException,
    );
    expect(workingProvider.calls).toHaveLength(0);
  });

  /*
    Test de regresión del incidente 2026-09-30, a nivel de base real:
    aunque exista OTRO CheckoutLead con una subscription ya asociada
    (simulando "Mercado Pago tiene una subscription ajena"), crear el
    checkout de un lead nuevo nunca la toca, nunca la lee, nunca la
    persiste contra el lead equivocado.
  */
  it('con otro CheckoutLead ya CHECKOUT_CREATED en la base, uno nuevo nunca toca su subscription', async () => {
    const ajeno = await makePendingLead();
    const ajenoProvider = new FakeMercadoPagoProvider();
    const ajenoService = new CheckoutLeadsService(
      prisma,
      ajenoProvider as never,
    );
    await ajenoService.createCheckout(ajeno.id);
    const ajenoRow = await prisma.checkoutLead.findUniqueOrThrow({
      where: { id: ajeno.id },
    });

    const lead = await makePendingLead();
    const provider = new FakeMercadoPagoProvider();
    const service = new CheckoutLeadsService(prisma, provider as never);
    const result = await service.createCheckout(lead.id);

    const row = await prisma.checkoutLead.findUniqueOrThrow({
      where: { id: lead.id },
    });
    // El lead nuevo tiene SU PROPIA subscription, nunca la del ajeno.
    expect(row.providerSubscriptionId).not.toBe(
      ajenoRow.providerSubscriptionId,
    );
    expect(row.checkoutUrl).not.toBe(ajenoRow.checkoutUrl);
    expect(result.checkoutUrl).toBe(row.checkoutUrl);

    // Y el lead ajeno queda exactamente como estaba — nadie lo releyó ni
    // lo modificó de nuevo.
    const ajenoRowAfter = await prisma.checkoutLead.findUniqueOrThrow({
      where: { id: ajeno.id },
    });
    expect(ajenoRowAfter).toEqual(ajenoRow);
  });

  it('PAID: ConflictException contra la base real, provider nunca llamado', async () => {
    const lead = await makePendingLead({ status: CheckoutLeadStatus.PAID });
    const provider = new FakeMercadoPagoProvider();
    const service = new CheckoutLeadsService(prisma, provider as never);

    await expect(service.createCheckout(lead.id)).rejects.toThrow(
      ConflictException,
    );
    expect(provider.calls).toHaveLength(0);
  });

  it('FAILED: ConflictException', async () => {
    const lead = await makePendingLead({ status: CheckoutLeadStatus.FAILED });
    const provider = new FakeMercadoPagoProvider();
    const service = new CheckoutLeadsService(prisma, provider as never);

    await expect(service.createCheckout(lead.id)).rejects.toThrow(
      ConflictException,
    );
  });

  it('EXPIRED: ConflictException', async () => {
    const lead = await makePendingLead({ status: CheckoutLeadStatus.EXPIRED });
    const provider = new FakeMercadoPagoProvider();
    const service = new CheckoutLeadsService(prisma, provider as never);

    await expect(service.createCheckout(lead.id)).rejects.toThrow(
      ConflictException,
    );
  });

  it('lead inexistente: NotFoundException', async () => {
    const provider = new FakeMercadoPagoProvider();
    const service = new CheckoutLeadsService(prisma, provider as never);

    await expect(service.createCheckout(randomUUID())).rejects.toThrow(
      NotFoundException,
    );
  });

  it('sin MERCADO_PAGO_ACCESS_TOKEN: 503, y el lead queda intacto en PENDING', async () => {
    const lead = await makePendingLead();
    const provider = new UnavailableMercadoPagoProvider();
    const service = new CheckoutLeadsService(prisma, provider as never);

    await expect(service.createCheckout(lead.id)).rejects.toThrow(
      ServiceUnavailableException,
    );

    const row = await prisma.checkoutLead.findUniqueOrThrow({
      where: { id: lead.id },
    });
    expect(row.status).toBe(CheckoutLeadStatus.PENDING);
    expect(row.providerSubscriptionId).toBeNull();
  });
});
