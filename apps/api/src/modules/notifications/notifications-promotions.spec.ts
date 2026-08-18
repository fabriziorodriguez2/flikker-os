import { BadRequestException } from '@nestjs/common';
import { NotificationsPromotionsService } from './notifications-promotions.service';
import type { CustomerLoyaltyService } from '../customers/loyalty/customer-loyalty.service';
import type { CampaignsService } from '../campaigns/campaigns.service';
import type { BenefitsService } from '../benefits/benefits.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { VisitSourcesService } from '../visit-sources/visit-sources.service';
import type { PlansService } from '../plans/plans.service';
import type { LifecycleEmailsService } from '../../jobs/lifecycle-emails.service';

/**
 * Promociones: lo que el dueño manda a mano.
 *
 * Lo que se prueba acá es que la audiencia elegida en pantalla sea la que
 * realmente recibe el mensaje, y que un beneficio nunca se invente ni se tome
 * de otro negocio.
 */

const AUDIENCE_ROWS = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];

function makeDeps(
  options: {
    audienceRows?: { id: string }[];
    customers?: {
      id: string;
      name: string;
      phoneE164: string;
      email?: string | null;
    }[];
    benefit?: { id: string; title: string; type?: string } | null;
    hasProAccess?: boolean;
  } = {},
) {
  const customers = options.customers ?? [
    { id: 'c1', name: 'Ana', phoneE164: '+59891111111', email: null },
    { id: 'c2', name: 'Beto', phoneE164: '+59892222222', email: null },
    { id: 'c3', name: 'Caro', phoneE164: '+59893333333', email: null },
  ];

  const prisma = {
    benefit: {
      findFirst: jest.fn().mockResolvedValue(options.benefit ?? null),
    },
    customer: { findMany: jest.fn().mockResolvedValue(customers) },
    business: {
      findUnique: jest.fn().mockResolvedValue({ name: 'Café Test' }),
    },
  };
  const loyalty = {
    list: jest
      .fn()
      .mockResolvedValue({ data: options.audienceRows ?? AUDIENCE_ROWS }),
  };
  const campaigns = {
    sendManual: jest
      .fn()
      .mockResolvedValue({ campaignId: 'camp-1', sent: 3, failed: 0 }),
  };
  const benefits = {
    registerParticipation: jest.fn().mockResolvedValue({}),
    ensureRedemptionCode: jest.fn().mockResolvedValue({ redemptionCode: 'X1' }),
    // El beneficio que el cliente REALMENTE puede abrir desde el check-in.
    resolveActiveBenefit: jest.fn().mockResolvedValue(options.benefit ?? null),
    isRedeemable: jest.fn().mockReturnValue(true),
  };
  const visitSources = {
    ensureDefaultSource: jest
      .fn()
      .mockResolvedValue({ token: 'tok-principal' }),
    buildCheckinUrl: jest.fn(
      (token: string) => `https://flikker.site/check-in/${token}`,
    ),
  };
  // Default "nunca bloqueado" — el gate de trial de Beneficios tiene su
  // propio describe block más abajo.
  const plans = {
    assertBenefitsProActionAllowed: jest.fn().mockResolvedValue(undefined),
    hasProAccess: jest.fn().mockResolvedValue(options.hasProAccess ?? false),
  };
  const lifecycleEmails = { sendOnce: jest.fn().mockResolvedValue('sent') };
  return {
    prisma,
    loyalty,
    campaigns,
    benefits,
    visitSources,
    plans,
    lifecycleEmails,
  };
}

const service = (d: ReturnType<typeof makeDeps>) =>
  new NotificationsPromotionsService(
    d.prisma as unknown as PrismaService,
    d.loyalty as unknown as CustomerLoyaltyService,
    d.campaigns as unknown as CampaignsService,
    d.benefits as unknown as BenefitsService,
    d.visitSources as unknown as VisitSourcesService,
    d.plans as unknown as PlansService,
    d.lifecycleEmails as unknown as LifecycleEmailsService,
  );

/** El envío de email es fire-and-forget — deja correr los microtasks pendientes. */
async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('Promociones — audiencia', () => {
  /**
   * La audiencia sale del MISMO servicio que pinta la lista de Clientes. Si
   * la pantalla dice "Hace tiempo que no vienen: 12", la promoción le llega a
   * esas 12 — no a una definición paralela que se puede desincronizar.
   */
  it.each([
    ['todos', 'todos'],
    ['volvieron', 'volvieron'],
    ['ausentes', 'ausentes'],
    ['cerca', 'cerca'],
  ])('la audiencia "%s" usa el filtro real "%s" de Clientes', async (a, f) => {
    const deps = makeDeps();

    await service(deps).send('biz-1', 'user-1', {
      message: 'Este viernes 2x1 en medialunas.',
      audience: a as 'todos',
    });

    expect(deps.loyalty.list).toHaveBeenCalledWith(
      'biz-1',
      expect.objectContaining({ filter: f }),
    );
  });

  it('envía a los destinatarios de esa audiencia y a nadie más', async () => {
    const deps = makeDeps();

    await service(deps).send('biz-1', 'user-1', {
      message: 'Hola',
      audience: 'volvieron',
    });

    expect(deps.campaigns.sendManual).toHaveBeenCalledWith(
      'biz-1',
      'user-1',
      expect.objectContaining({
        recipients: [
          { customerId: 'c1', name: 'Ana', phoneE164: '+59891111111' },
          { customerId: 'c2', name: 'Beto', phoneE164: '+59892222222' },
          { customerId: 'c3', name: 'Caro', phoneE164: '+59893333333' },
        ],
      }),
    );
  });

  /** Quien pidió no recibir mensajes queda afuera, y no es configurable. */
  it('excluye a los que se dieron de baja', async () => {
    const deps = makeDeps();

    await service(deps).send('biz-1', 'user-1', {
      message: 'Hola',
      audience: 'todos',
    });

    expect(deps.prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          optedOut: false,
          businessId: 'biz-1',
        }),
      }),
    );
  });

  it('una audiencia vacía falla en vez de enviar nada', async () => {
    const deps = makeDeps({ audienceRows: [], customers: [] });

    await expect(
      service(deps).send('biz-1', 'user-1', {
        message: 'Hola',
        audience: 'cerca',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(deps.campaigns.sendManual).not.toHaveBeenCalled();
  });

  it('el preview cuenta los mismos destinatarios que después reciben', async () => {
    const deps = makeDeps();

    const preview = await service(deps).preview('biz-1', 'volvieron');

    expect(preview).toEqual({ audience: 'volvieron', recipientCount: 3 });
  });
});

describe('Promociones — beneficio', () => {
  it('sin beneficio manda solo el mensaje', async () => {
    const deps = makeDeps();

    await service(deps).send('biz-1', 'user-1', {
      message: 'Este viernes 2x1.',
      audience: 'todos',
    });

    expect(deps.benefits.ensureRedemptionCode).not.toHaveBeenCalled();
    expect(deps.campaigns.sendManual).toHaveBeenCalledWith(
      'biz-1',
      'user-1',
      expect.objectContaining({ messageBody: 'Este viernes 2x1.' }),
    );
  });

  it('con el trial de Beneficios vencido, una promoción CON beneficio se bloquea', async () => {
    const deps = makeDeps({ benefit: { id: 'ben-1', title: 'Café gratis' } });
    deps.plans.assertBenefitsProActionAllowed.mockRejectedValue(
      new Error('Tu prueba de 30 días terminó.'),
    );

    await expect(
      service(deps).send('biz-1', 'user-1', {
        message: 'Te esperamos.',
        audience: 'todos',
        benefitId: 'ben-1',
      }),
    ).rejects.toThrow(/prueba de 30 días/);
    expect(deps.benefits.ensureRedemptionCode).not.toHaveBeenCalled();
    expect(deps.campaigns.sendManual).not.toHaveBeenCalled();
  });

  it('con el trial vencido, una promoción SIN beneficio sigue funcionando (nunca pasa por el guard)', async () => {
    const deps = makeDeps();
    deps.plans.assertBenefitsProActionAllowed.mockRejectedValue(
      new Error('Tu prueba de 30 días terminó.'),
    );

    await service(deps).send('biz-1', 'user-1', {
      message: 'Este viernes 2x1.',
      audience: 'todos',
    });

    expect(deps.plans.assertBenefitsProActionAllowed).not.toHaveBeenCalled();
    expect(deps.campaigns.sendManual).toHaveBeenCalled();
  });

  it('con beneficio emite un código por cliente y lo suma al mensaje', async () => {
    const deps = makeDeps({ benefit: { id: 'ben-1', title: 'Café gratis' } });

    const result = await service(deps).send('biz-1', 'user-1', {
      message: 'Te esperamos.',
      audience: 'todos',
      benefitId: 'ben-1',
    });

    // Uno por destinatario, con el helper idempotente que ya existía.
    expect(deps.benefits.ensureRedemptionCode).toHaveBeenCalledTimes(3);
    expect(result.benefitTitle).toBe('Café gratis');
    expect(deps.campaigns.sendManual).toHaveBeenCalledWith(
      'biz-1',
      'user-1',
      expect.objectContaining({
        messageBody: expect.stringContaining('Café gratis'),
      }),
    );
  });

  /**
   * El punto del fix: prometer un beneficio sin darle al cliente cómo abrirlo
   * es peor que no prometerlo. El mensaje lleva el link del acceso de siempre
   * del negocio, que es donde el check-in le muestra el beneficio con su
   * código.
   */
  it('el mensaje incluye el link del acceso, no un código técnico suelto', async () => {
    const deps = makeDeps({ benefit: { id: 'ben-1', title: 'Café gratis' } });

    await service(deps).send('biz-1', 'user-1', {
      message: 'Te esperamos.',
      audience: 'todos',
      benefitId: 'ben-1',
    });

    const body = (
      deps.campaigns.sendManual.mock.calls[0][2] as { messageBody: string }
    ).messageBody;

    expect(body).toContain('https://flikker.site/check-in/tok-principal');
    // El código de canje NO va pegado en el WhatsApp.
    expect(body).not.toContain('X1');
  });

  it('el link es el acceso principal del negocio, no uno nuevo', async () => {
    const deps = makeDeps({ benefit: { id: 'ben-1', title: 'X' } });

    await service(deps).send('biz-1', 'user-1', {
      message: 'Hola',
      audience: 'todos',
      benefitId: 'ben-1',
    });

    // `ensureDefaultSource` es idempotente: reusa el que ya existe.
    expect(deps.visitSources.ensureDefaultSource).toHaveBeenCalledWith('biz-1');
    expect(deps.visitSources.buildCheckinUrl).toHaveBeenCalledWith(
      'tok-principal',
    );
  });

  /**
   * Solo se puede ofrecer el beneficio ACTIVO, porque es el único que el
   * cliente puede ver desde el check-in. Ofrecer cualquier otro sería
   * prometer algo que no tiene dónde abrirse.
   */
  it('un beneficio que no es el activo falla sin enviar nada', async () => {
    const deps = makeDeps({ benefit: { id: 'el-activo', title: 'El activo' } });

    await expect(
      service(deps).send('biz-1', 'user-1', {
        message: 'Hola',
        audience: 'todos',
        benefitId: 'otro-distinto',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(deps.campaigns.sendManual).not.toHaveBeenCalled();
    expect(deps.benefits.ensureRedemptionCode).not.toHaveBeenCalled();
  });

  it('sin ningún beneficio activo, pedir uno falla', async () => {
    const deps = makeDeps({ benefit: null });

    await expect(
      service(deps).send('biz-1', 'user-1', {
        message: 'Hola',
        audience: 'todos',
        benefitId: 'cualquiera',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el beneficio se resuelve SIEMPRE scopeado al negocio', async () => {
    const deps = makeDeps({ benefit: { id: 'ben-1', title: 'X' } });

    await service(deps).send('biz-1', 'user-1', {
      message: 'Hola',
      audience: 'todos',
      benefitId: 'ben-1',
    });

    expect(deps.benefits.resolveActiveBenefit).toHaveBeenCalledWith('biz-1');
  });

  it('un beneficio no canjeable (sorteo) no emite códigos', async () => {
    const deps = makeDeps({ benefit: { id: 'ben-1', title: 'Sorteo' } });
    deps.benefits.isRedeemable.mockReturnValue(false);

    await service(deps).send('biz-1', 'user-1', {
      message: 'Hola',
      audience: 'todos',
      benefitId: 'ben-1',
    });

    expect(deps.benefits.ensureRedemptionCode).not.toHaveBeenCalled();
    expect(deps.campaigns.sendManual).toHaveBeenCalled();
  });

  it('NUNCA crea un Benefit desde una promoción', async () => {
    const deps = makeDeps({ benefit: { id: 'ben-1', title: 'X' } });

    await service(deps).send('biz-1', 'user-1', {
      message: 'Hola',
      audience: 'todos',
      benefitId: 'ben-1',
    });

    expect(deps.prisma.benefit).not.toHaveProperty('create');
  });
});

describe('Promociones — email adicional (Pro)', () => {
  it('manda el email a los destinatarios con email cuando el negocio es Pro', async () => {
    const deps = makeDeps({
      hasProAccess: true,
      customers: [
        {
          id: 'c1',
          name: 'Ana',
          phoneE164: '+59891111111',
          email: 'ana@test.com',
        },
        { id: 'c2', name: 'Beto', phoneE164: '+59892222222', email: null },
      ],
    });

    await service(deps).send('biz-1', 'user-1', {
      message: 'Este viernes 2x1.',
      audience: 'todos',
    });
    await flush();

    expect(deps.lifecycleEmails.sendOnce).toHaveBeenCalledTimes(1);
    expect(deps.lifecycleEmails.sendOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'biz-1',
        customerId: 'c1',
        kind: 'promotion',
        dedupeKey: 'camp-1:c1',
        to: 'ana@test.com',
      }),
    );
  });

  it('nunca manda email si el negocio es Free, aunque haya destinatarios con email', async () => {
    const deps = makeDeps({
      hasProAccess: false,
      customers: [
        {
          id: 'c1',
          name: 'Ana',
          phoneE164: '+59891111111',
          email: 'ana@test.com',
        },
      ],
    });

    await service(deps).send('biz-1', 'user-1', {
      message: 'Este viernes 2x1.',
      audience: 'todos',
    });
    await flush();

    expect(deps.lifecycleEmails.sendOnce).not.toHaveBeenCalled();
  });

  it('nunca manda email si ningún destinatario tiene email, aunque el negocio sea Pro', async () => {
    const deps = makeDeps({ hasProAccess: true });

    await service(deps).send('biz-1', 'user-1', {
      message: 'Hola',
      audience: 'todos',
    });
    await flush();

    expect(deps.lifecycleEmails.sendOnce).not.toHaveBeenCalled();
  });

  it('el email sigue funcionando cuando la promoción es un beneficio', async () => {
    const deps = makeDeps({
      hasProAccess: true,
      benefit: { id: 'ben-1', title: 'Café gratis' },
      customers: [
        {
          id: 'c1',
          name: 'Ana',
          phoneE164: '+59891111111',
          email: 'ana@test.com',
        },
      ],
    });

    await service(deps).send('biz-1', 'user-1', {
      message: 'Te esperamos.',
      audience: 'todos',
      benefitId: 'ben-1',
    });
    await flush();

    expect(deps.lifecycleEmails.sendOnce).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'promotion', to: 'ana@test.com' }),
    );
  });

  it('un fallo del email no afecta el envío por WhatsApp de la promoción', async () => {
    const deps = makeDeps({
      hasProAccess: true,
      customers: [
        {
          id: 'c1',
          name: 'Ana',
          phoneE164: '+59891111111',
          email: 'ana@test.com',
        },
      ],
    });
    deps.plans.hasProAccess.mockRejectedValue(new Error('db down'));

    const result = await service(deps).send('biz-1', 'user-1', {
      message: 'Hola',
      audience: 'todos',
    });
    await flush();

    expect(deps.campaigns.sendManual).toHaveBeenCalled();
    expect(result.campaignId).toBe('camp-1');
  });
});
