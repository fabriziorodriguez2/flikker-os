import { BadRequestException, NotFoundException } from '@nestjs/common';
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
    benefitsCatalogEnabled?: boolean;
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
    benefitParticipation: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    customer: { findMany: jest.fn().mockResolvedValue(customers) },
    business: {
      findUnique: jest.fn().mockResolvedValue({ name: 'Café Test' }),
    },
    // El lote de emisiones de una promoción se emite dentro de una sola
    // transacción — el mock solo necesita invocar el callback con un `tx`
    // cualquiera, ya que `issueBenefit` está mockeado directamente.
    $transaction: jest.fn(
      (cb: (tx: unknown) => unknown): Promise<unknown> =>
        Promise.resolve(cb({})),
    ),
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
  // Cada llamada devuelve una fila con `id` distinto — así los tests pueden
  // confirmar que cada destinatario recibe SU PROPIA emisión (pedido
  // explícito: nunca reabre ni reusa una fila existente).
  let issueCounter = 0;
  const benefits = {
    registerParticipation: jest.fn().mockResolvedValue({}),
    issueBenefit: jest.fn(() => {
      issueCounter++;
      return Promise.resolve({ id: `part-${issueCounter}` });
    }),
    // Cualquier Benefit real del catálogo (scopeado al negocio) es válido
    // para una promoción — ya NO tiene que ser el `active` del check-in.
    // `getOne` tira NotFoundException si no existe para este negocio,
    // igual que la implementación real.
    getOne: jest.fn((_businessId: string, id: string) => {
      if (options.benefit && options.benefit.id === id) {
        return Promise.resolve(options.benefit);
      }
      return Promise.reject(new NotFoundException('Benefit not found'));
    }),
    isRedeemable: jest.fn().mockReturnValue(true),
    assertBenefitsCatalogEnabled: jest.fn(() =>
      options.benefitsCatalogEnabled === false
        ? Promise.reject(
            new BadRequestException(
              'Beneficios está apagado para este negocio.',
            ),
          )
        : Promise.resolve(undefined),
    ),
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

    expect(deps.benefits.issueBenefit).not.toHaveBeenCalled();
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
    expect(deps.benefits.issueBenefit).not.toHaveBeenCalled();
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

  it('con beneficio emite una emisión NUEVA por cliente (nunca reabre ni reusa una existente)', async () => {
    const deps = makeDeps({ benefit: { id: 'ben-1', title: 'Café gratis' } });

    const result = await service(deps).send('biz-1', 'user-1', {
      message: 'Te esperamos.',
      audience: 'todos',
      benefitId: 'ben-1',
    });

    // Uno por destinatario, siempre `issueBenefit` (nunca `ensureRedemptionCode`),
    // dentro de la transacción del lote (segundo argumento = el `tx`).
    expect(deps.benefits.issueBenefit).toHaveBeenCalledTimes(3);
    expect(deps.benefits.issueBenefit).toHaveBeenCalledWith(
      {
        businessId: 'biz-1',
        benefitId: 'ben-1',
        customerId: 'c1',
        source: 'PROMOTION',
      },
      expect.anything(),
    );
    expect(deps.prisma.$transaction).toHaveBeenCalledTimes(1);
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
   * El punto del fix (pedido explícito): el cliente recibe un link ÚNICO de
   * Flikker a SU propia emisión, no un código técnico suelto ni el acceso
   * genérico del negocio. `campaignId` se completa después de mandar
   * (`prisma.benefitParticipation.updateMany`), para trazabilidad.
   */
  it('cada destinatario recibe el link de SU propia emisión (`{link}` por-contacto, no un link compartido)', async () => {
    const deps = makeDeps({ benefit: { id: 'ben-1', title: 'Café gratis' } });

    await service(deps).send('biz-1', 'user-1', {
      message: 'Te esperamos.',
      audience: 'todos',
      benefitId: 'ben-1',
    });

    const { messageBody, recipients } = deps.campaigns.sendManual.mock
      .calls[0][2] as {
      messageBody: string;
      recipients: { customerId: string; link?: string }[];
    };

    // El mensaje compartido lleva el placeholder, no un link fijo.
    expect(messageBody).toContain('{link}');
    // Cada destinatario tiene su propio link, a su propia emisión.
    const byCustomer = new Map(recipients.map((r) => [r.customerId, r.link]));
    expect(byCustomer.get('c1')).toBe('http://localhost:3001/beneficio/part-1');
    expect(byCustomer.get('c2')).toBe('http://localhost:3001/beneficio/part-2');
    expect(byCustomer.get('c3')).toBe('http://localhost:3001/beneficio/part-3');
    // Nunca el link genérico del check-in ni un código técnico pegado.
    expect(messageBody).not.toContain('check-in/tok-principal');
  });

  it('marca cada emisión con la campaña que la mandó, una vez que se conoce el id real', async () => {
    const deps = makeDeps({ benefit: { id: 'ben-1', title: 'Café gratis' } });

    await service(deps).send('biz-1', 'user-1', {
      message: 'Hola',
      audience: 'todos',
      benefitId: 'ben-1',
    });

    expect(deps.prisma.benefitParticipation.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['part-1', 'part-2', 'part-3'] } },
      data: { campaignId: 'camp-1' },
    });
  });

  /**
   * Auditoría (pedido explícito): "evitar emisiones PROMOTION huérfanas sin
   * campaña asociada" si el envío falla a mitad de camino. El lote entero
   * se emite dentro de `prisma.$transaction` — si falla, nada quedó
   * creado, y `sendManual` nunca se llega a invocar (no se manda un
   * mensaje prometiendo emisiones que no existen).
   */
  it('si la emisión falla a mitad del lote, no queda nada creado ni se manda la campaña', async () => {
    const deps = makeDeps({ benefit: { id: 'ben-1', title: 'Café gratis' } });
    deps.prisma.$transaction.mockRejectedValue(
      new Error('db down a mitad de lote'),
    );

    await expect(
      service(deps).send('biz-1', 'user-1', {
        message: 'Hola',
        audience: 'todos',
        benefitId: 'ben-1',
      }),
    ).rejects.toThrow('db down a mitad de lote');

    expect(deps.campaigns.sendManual).not.toHaveBeenCalled();
    expect(deps.prisma.benefitParticipation.updateMany).not.toHaveBeenCalled();
  });

  /**
   * Auditoría (pedido explícito): si la promoción YA se mandó pero el
   * `updateMany` que asocia `campaignId` falla después (metadata de
   * trazabilidad, no el beneficio en sí), el envío no debe reportarse como
   * fallido al dueño — el cliente sí recibió su beneficio real.
   */
  it('si falla asociar campaignId después de enviar, el envío sigue reportándose OK', async () => {
    const deps = makeDeps({ benefit: { id: 'ben-1', title: 'Café gratis' } });
    deps.prisma.benefitParticipation.updateMany.mockRejectedValue(
      new Error('db hiccup'),
    );

    const result = await service(deps).send('biz-1', 'user-1', {
      message: 'Hola',
      audience: 'todos',
      benefitId: 'ben-1',
    });

    expect(result.benefitTitle).toBe('Café gratis');
    expect(deps.campaigns.sendManual).toHaveBeenCalled();
  });

  /**
   * El punto del fix (pedido explícito): una promoción manual puede elegir
   * CUALQUIER Benefit real del catálogo, no solo el `active` del check-in
   * — con 3 Benefits reales, antes solo 1 podía ofrecerse. El cliente lo ve
   * igual en su espacio personal vía `otherBenefits`
   * (`checkin.service.ts#buildPersonalSpace`), sin importar cuál sea hoy
   * el activo.
   */
  it('un beneficio del catálogo que NO es el activo del check-in también se puede promocionar', async () => {
    const deps = makeDeps({
      benefit: { id: 'no-es-el-activo', title: '2x1' },
    });

    const result = await service(deps).send('biz-1', 'user-1', {
      message: 'Hola',
      audience: 'todos',
      benefitId: 'no-es-el-activo',
    });

    expect(deps.campaigns.sendManual).toHaveBeenCalled();
    expect(deps.benefits.issueBenefit).toHaveBeenCalledTimes(3);
    expect(result.benefitTitle).toBe('2x1');
  });

  it('un benefitId que no existe en este negocio falla sin enviar nada (tenancy vía getOne)', async () => {
    const deps = makeDeps({ benefit: { id: 'ben-1', title: 'X' } });

    await expect(
      service(deps).send('biz-1', 'user-1', {
        message: 'Hola',
        audience: 'todos',
        benefitId: 'no-existe-en-este-negocio',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(deps.campaigns.sendManual).not.toHaveBeenCalled();
    expect(deps.benefits.issueBenefit).not.toHaveBeenCalled();
  });

  it('no depende de automationEligible — eso es autorización de reactivación, otra cosa', async () => {
    // El mock de `getOne` ni siquiera expone `automationEligible`: si el
    // código lo necesitara, esto fallaría por otro motivo (undefined).
    const deps = makeDeps({ benefit: { id: 'ben-1', title: 'X' } });

    await service(deps).send('biz-1', 'user-1', {
      message: 'Hola',
      audience: 'todos',
      benefitId: 'ben-1',
    });

    expect(deps.campaigns.sendManual).toHaveBeenCalled();
  });

  it('el beneficio se resuelve SIEMPRE scopeado al negocio', async () => {
    const deps = makeDeps({ benefit: { id: 'ben-1', title: 'X' } });

    await service(deps).send('biz-1', 'user-1', {
      message: 'Hola',
      audience: 'todos',
      benefitId: 'ben-1',
    });

    expect(deps.benefits.getOne).toHaveBeenCalledWith('biz-1', 'ben-1');
  });

  /**
   * Sorteo/ninguno: sin código para canjear, sin pantalla de emisión propia
   * — sigue usando el registro de participación de siempre y el link
   * genérico del acceso del negocio (nada nuevo para este caso).
   */
  it('un beneficio no canjeable (sorteo) no emite códigos, usa el link genérico del negocio', async () => {
    const deps = makeDeps({ benefit: { id: 'ben-1', title: 'Sorteo' } });
    deps.benefits.isRedeemable.mockReturnValue(false);

    await service(deps).send('biz-1', 'user-1', {
      message: 'Hola',
      audience: 'todos',
      benefitId: 'ben-1',
    });

    expect(deps.benefits.issueBenefit).not.toHaveBeenCalled();
    expect(deps.benefits.registerParticipation).toHaveBeenCalledTimes(3);
    expect(deps.campaigns.sendManual).toHaveBeenCalled();
    // `ensureDefaultSource` es idempotente: reusa el que ya existe.
    expect(deps.visitSources.ensureDefaultSource).toHaveBeenCalledWith('biz-1');
    const body = (
      deps.campaigns.sendManual.mock.calls[0][2] as { messageBody: string }
    ).messageBody;
    expect(body).toContain('https://flikker.site/check-in/tok-principal');
  });

  /**
   * Edge case auditado (pedido explícito): si Beneficios está apagado
   * globalmente, una promoción no puede prometer algo que el cliente
   * después no va a poder ver/canjear (mismo toggle que bloquea
   * `getOtherAvailableBenefits`). Coherente con el gate de plan ya
   * existente (`assertBenefitsProActionAllowed`), solo que este es el de
   * `RetentionSettings.benefitsEnabled`.
   */
  it('con Beneficios apagado globalmente, una promoción CON beneficio se bloquea', async () => {
    const deps = makeDeps({
      benefit: { id: 'ben-1', title: 'Café gratis' },
      benefitsCatalogEnabled: false,
    });

    await expect(
      service(deps).send('biz-1', 'user-1', {
        message: 'Te esperamos.',
        audience: 'todos',
        benefitId: 'ben-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(deps.benefits.issueBenefit).not.toHaveBeenCalled();
    expect(deps.campaigns.sendManual).not.toHaveBeenCalled();
  });

  it('con Beneficios apagado globalmente, una promoción SIN beneficio sigue funcionando (nunca pasa por el guard)', async () => {
    const deps = makeDeps({ benefitsCatalogEnabled: false });

    await service(deps).send('biz-1', 'user-1', {
      message: 'Este viernes 2x1.',
      audience: 'todos',
    });

    expect(deps.benefits.assertBenefitsCatalogEnabled).not.toHaveBeenCalled();
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
