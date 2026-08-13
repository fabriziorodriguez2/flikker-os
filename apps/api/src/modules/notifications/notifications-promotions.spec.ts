import { BadRequestException } from '@nestjs/common';
import { NotificationsPromotionsService } from './notifications-promotions.service';
import type { CustomerLoyaltyService } from '../customers/loyalty/customer-loyalty.service';
import type { CampaignsService } from '../campaigns/campaigns.service';
import type { BenefitsService } from '../benefits/benefits.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { VisitSourcesService } from '../visit-sources/visit-sources.service';

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
    customers?: { id: string; name: string; phoneE164: string }[];
    benefit?: { id: string; title: string; type?: string } | null;
  } = {},
) {
  const customers = options.customers ?? [
    { id: 'c1', name: 'Ana', phoneE164: '+59891111111' },
    { id: 'c2', name: 'Beto', phoneE164: '+59892222222' },
    { id: 'c3', name: 'Caro', phoneE164: '+59893333333' },
  ];

  const prisma = {
    benefit: {
      findFirst: jest.fn().mockResolvedValue(options.benefit ?? null),
    },
    customer: { findMany: jest.fn().mockResolvedValue(customers) },
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
  return { prisma, loyalty, campaigns, benefits, visitSources };
}

const service = (d: ReturnType<typeof makeDeps>) =>
  new NotificationsPromotionsService(
    d.prisma as unknown as PrismaService,
    d.loyalty as unknown as CustomerLoyaltyService,
    d.campaigns as unknown as CampaignsService,
    d.benefits as unknown as BenefitsService,
    d.visitSources as unknown as VisitSourcesService,
  );

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
