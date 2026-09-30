import { randomUUID } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { CheckoutLeadStatus, CheckoutPlan } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CheckoutLeadsService } from './checkout-leads.service';
import { CreateCheckoutIntentDto } from './dto/create-checkout-intent.dto';
import { MercadoPagoSubscriptionProvider } from './mercado-pago-subscription.provider';

/**
 * El formulario de la landing, contra Postgres real.
 *
 * Contra base real y no con mocks porque dos de las cosas que más importan
 * viven en la base y no en el código: que la idempotency key deduplique de
 * verdad (índice único parcial escrito a mano), y que crear un lead NO
 * arrastre la creación de ninguna otra entidad.
 */
describe('CheckoutLeadsService (integration)', () => {
  let prisma: PrismaService;
  let service: CheckoutLeadsService;
  const created: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    // Este spec cubre `createIntent` (Parte 2), no `createCheckout` (Parte
    // 3) — un stub sin `MERCADO_PAGO_ACCESS_TOKEN` alcanza; nunca se
    // ejercita en estos tests.
    service = new CheckoutLeadsService(
      prisma,
      new MercadoPagoSubscriptionProvider(),
    );
  });

  afterAll(async () => {
    if (created.length > 0) {
      await prisma.checkoutLead.deleteMany({ where: { id: { in: created } } });
    }
    await prisma.$disconnect();
  });

  /** Un formulario válido; cada test pisa lo que necesita. */
  function payload(
    overrides: Partial<CreateCheckoutIntentDto> = {},
  ): CreateCheckoutIntentDto {
    return {
      name: 'Juan Pérez',
      businessName: 'Café Ejemplo',
      phone: '099123456',
      email: 'Juan.Perez@Ejemplo.COM',
      plan: CheckoutPlan.YEARLY,
      ...overrides,
    };
  }

  async function create(
    dto: CreateCheckoutIntentDto = payload(),
    key?: string,
  ) {
    const result = await service.createIntent(dto, key);
    created.push(result.id);
    return result;
  }

  // ── creación ────────────────────────────────────────────────────────

  it('crea la intención en PENDING y devuelve solo id y status', async () => {
    const result = await create();

    expect(result.status).toBe(CheckoutLeadStatus.PENDING);
    // La respuesta no lleva nada de lo que la persona escribió: es un
    // endpoint público sin auth, y un id no debería confirmar un email.
    expect(Object.keys(result).sort()).toEqual(['id', 'status']);
  });

  it('acepta los dos planes y solo esos', async () => {
    const monthly = await create(payload({ plan: CheckoutPlan.MONTHLY }));
    const yearly = await create(payload({ plan: CheckoutPlan.YEARLY }));

    const rows = await prisma.checkoutLead.findMany({
      where: { id: { in: [monthly.id, yearly.id] } },
      select: { plan: true },
    });
    expect(rows.map((r) => r.plan).sort()).toEqual(['MONTHLY', 'YEARLY']);
  });

  // ── normalización ───────────────────────────────────────────────────

  it('normaliza el email a minúsculas y sin espacios', async () => {
    const { id } = await create(
      payload({ email: '  Juan.Perez@Ejemplo.COM ' }),
    );

    const lead = await prisma.checkoutLead.findUniqueOrThrow({
      where: { id },
      select: { email: true },
    });
    expect(lead.email).toBe('juan.perez@ejemplo.com');
  });

  it('normaliza el teléfono a E.164 uruguayo', async () => {
    const { id } = await create(payload({ phone: '099 123 456' }));

    const lead = await prisma.checkoutLead.findUniqueOrThrow({
      where: { id },
      select: { phoneE164: true },
    });
    expect(lead.phoneE164).toBe('+59899123456');
  });

  it('respeta un teléfono que ya viene en formato internacional', async () => {
    const { id } = await create(payload({ phone: '+5491123456789' }));

    const lead = await prisma.checkoutLead.findUniqueOrThrow({
      where: { id },
      select: { phoneE164: true },
    });
    expect(lead.phoneE164).toBe('+5491123456789');
  });

  it('recorta espacios del nombre y del negocio', async () => {
    const { id } = await create(
      payload({ name: '  Juan Pérez  ', businessName: '  Café Ejemplo ' }),
    );

    const lead = await prisma.checkoutLead.findUniqueOrThrow({
      where: { id },
      select: { name: true, businessName: true },
    });
    expect(lead.name).toBe('Juan Pérez');
    expect(lead.businessName).toBe('Café Ejemplo');
  });

  // ── rechazos ────────────────────────────────────────────────────────

  it('rechaza un email con formato inválido', async () => {
    await expect(
      service.createIntent(payload({ email: 'juan@sin-tld' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza un teléfono demasiado corto', async () => {
    await expect(
      service.createIntent(payload({ phone: '123' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('no persiste nada cuando la validación falla', async () => {
    const before = await prisma.checkoutLead.count();
    await expect(
      service.createIntent(payload({ email: 'roto' })),
    ).rejects.toThrow();
    expect(await prisma.checkoutLead.count()).toBe(before);
  });

  // ── idempotencia ────────────────────────────────────────────────────

  describe('idempotencia', () => {
    it('la misma key devuelve el MISMO lead, sin crear una segunda fila', async () => {
      const key = randomUUID();
      const first = await create(payload(), key);
      const second = await service.createIntent(payload(), key);

      expect(second.id).toBe(first.id);
      expect(
        await prisma.checkoutLead.count({ where: { idempotencyKey: key } }),
      ).toBe(1);
    });

    /*
      El caso real del doble click: los dos requests llegan casi juntos y
      ninguno ve todavía la fila del otro. Un check-then-act pierde acá; el
      índice único es lo que resuelve.
    */
    it('dos requests concurrentes con la misma key crean un solo lead', async () => {
      const key = randomUUID();
      const results = await Promise.all([
        service.createIntent(payload(), key),
        service.createIntent(payload(), key),
      ]);
      created.push(...results.map((r) => r.id));

      expect(results[0].id).toBe(results[1].id);
      expect(
        await prisma.checkoutLead.count({ where: { idempotencyKey: key } }),
      ).toBe(1);
    });

    it('una key distinta es una intención nueva y legítima', async () => {
      const first = await create(payload(), randomUUID());
      const second = await create(payload(), randomUUID());

      expect(second.id).not.toBe(first.id);
    });

    /*
      Sin key cada POST es una intención nueva. El unique es PARCIAL
      justamente por esto: con un unique común, el segundo lead sin key
      colisionaría contra el primero.
    */
    it('sin key, dos envíos crean dos leads — nunca se deduplica por email', async () => {
      const email = `repetido-${randomUUID()}@ejemplo.com`;
      const first = await create(payload({ email }));
      const second = await create(payload({ email }));

      expect(second.id).not.toBe(first.id);
      expect(await prisma.checkoutLead.count({ where: { email } })).toBe(2);
    });

    it('la misma persona puede volver y cambiar de plan', async () => {
      const email = `cambia-plan-${randomUUID()}@ejemplo.com`;
      await create(payload({ email, plan: CheckoutPlan.MONTHLY }));
      await create(payload({ email, plan: CheckoutPlan.YEARLY }));

      const rows = await prisma.checkoutLead.findMany({
        where: { email },
        select: { plan: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(rows.map((r) => r.plan)).toEqual(['MONTHLY', 'YEARLY']);
    });
  });

  // ── lo que NO debe pasar ────────────────────────────────────────────

  /*
    La regla central de esta tanda: un formulario es una intención, no un
    cliente. Crear entidades acá llenaría el panel de negocios fantasma y
    haría que las métricas cuenten formularios en vez de clientes.
  */
  it('no crea User, Business, Membership, Subscription ni FlikkerAccount', async () => {
    const before = {
      users: await prisma.user.count(),
      businesses: await prisma.business.count(),
      memberships: await prisma.membership.count(),
      subscriptions: await prisma.subscription.count(),
      accounts: await prisma.flikkerAccount.count(),
      customers: await prisma.customer.count(),
    };

    await create();

    expect({
      users: await prisma.user.count(),
      businesses: await prisma.business.count(),
      memberships: await prisma.membership.count(),
      subscriptions: await prisma.subscription.count(),
      accounts: await prisma.flikkerAccount.count(),
      customers: await prisma.customer.count(),
    }).toEqual(before);
  });

  /*
    El precio lo decide el backend (Parte 3), nunca el formulario. Hoy esos
    campos no existen en el modelo; el día que exista un monto tiene que
    venir del plan, no del request.
  */
  it('no guarda ningún monto: el lead solo registra el plan elegido', async () => {
    const { id } = await create();

    const lead = await prisma.checkoutLead.findUniqueOrThrow({ where: { id } });
    expect(lead).not.toHaveProperty('amount');
    expect(lead).not.toHaveProperty('currency');
    expect(lead).not.toHaveProperty('price');
  });

  it('los campos de Mercado Pago quedan vacíos en esta tanda', async () => {
    const { id } = await create();

    const lead = await prisma.checkoutLead.findUniqueOrThrow({ where: { id } });
    expect(lead.paymentProvider).toBeNull();
    expect(lead.externalReference).toBeNull();
    expect(lead.checkoutCreatedAt).toBeNull();
    expect(lead.paidAt).toBeNull();
    expect(lead.status).toBe(CheckoutLeadStatus.PENDING);
  });

  /*
    El `id` es lo que en la Parte 3 va a viajar como `external_reference` de
    Mercado Pago: el hilo que une el formulario con el pago aprobado sin
    tener que reconciliar por email.
  */
  it('el id es un uuid servible como external_reference', async () => {
    const { id } = await create();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
