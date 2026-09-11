import { NotFoundException } from '@nestjs/common';
import { PublicService } from './public.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { BenefitsService } from '../benefits/benefits.service';
import type { PublicMessagingService } from './public-messaging.service';
import type { CustomerPublicUrlService } from './customer-public-url.service';

/**
 * Pantalla del cliente para UNA emisión de Benefit (`/beneficio/{id}`, el
 * link que manda Promociones) — de solo lectura. Lo que importa acá: se
 * resuelve solo por `id` (sin `businessId`, mismo patrón que `/redeem/{code}`
 * o el token de `VisitSource`), nunca expone el título "vivo" del catálogo
 * si el snapshot dice otra cosa, y jamás confirma un canje.
 */
function makePrisma(participation: unknown) {
  return {
    benefitParticipation: {
      findUnique: jest.fn().mockResolvedValue(participation),
    },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new PublicService(
    prisma as unknown as PrismaService,
    {} as unknown as BenefitsService,
    {} as unknown as PublicMessagingService,
    {} as unknown as CustomerPublicUrlService,
  );
}

describe('PublicService.getBenefitIssuance', () => {
  it('devuelve el negocio, el título prometido (snapshot) y el estado de canje', async () => {
    const prisma = makePrisma({
      redemptionCode: 'ABCD1234',
      redeemedAt: null,
      benefitTitleSnapshot: '2x1 (promoción de agosto)',
      benefit: { title: '2x1', description: 'Traé un amigo', terms: null },
      business: { name: 'Café Test' },
    });
    const service = makeService(prisma);

    const result = await service.getBenefitIssuance('part-1');

    expect(result).toEqual({
      businessName: 'Café Test',
      benefitTitle: '2x1 (promoción de agosto)',
      description: 'Traé un amigo',
      terms: null,
      redemptionCode: 'ABCD1234',
      redeemed: false,
      expired: false,
      expiresAt: null,
    });
  });

  /**
   * Un premio vencido no lleva código, igual que uno ya canjeado.
   *
   * Antes esto solo miraba `redeemedAt`: una emisión pasada de `expiresAt`
   * devolvía su `redemptionCode` y la pantalla dibujaba un QR escaneable
   * para algo que `consumeRedemption` ya rechaza — el cliente lo mostraba y
   * el local se lo rebotaba.
   */
  it('vencida: no devuelve código, aunque nunca se haya canjeado', async () => {
    const prisma = makePrisma({
      redemptionCode: 'ABCD1234',
      redeemedAt: null,
      expiresAt: new Date('2026-09-01T00:00:00.000Z'),
      benefitTitleSnapshot: '2x1',
      benefit: { title: '2x1', description: null, terms: null },
      business: { name: 'Café Test' },
    });
    const service = makeService(prisma);

    const result = await service.getBenefitIssuance(
      'part-1',
      new Date('2026-09-10T00:00:00.000Z'),
    );

    expect(result.expired).toBe(true);
    expect(result.redemptionCode).toBeNull();
    expect(result.redeemed).toBe(false);
  });

  it('con vencimiento todavía en el futuro, el código sigue viajando', async () => {
    const prisma = makePrisma({
      redemptionCode: 'ABCD1234',
      redeemedAt: null,
      expiresAt: new Date('2026-09-20T00:00:00.000Z'),
      benefitTitleSnapshot: '2x1',
      benefit: { title: '2x1', description: null, terms: null },
      business: { name: 'Café Test' },
    });
    const service = makeService(prisma);

    const result = await service.getBenefitIssuance(
      'part-1',
      new Date('2026-09-10T00:00:00.000Z'),
    );

    expect(result.expired).toBe(false);
    expect(result.redemptionCode).toBe('ABCD1234');
  });

  it('sin snapshot, usa el título VIGENTE del catálogo', async () => {
    const prisma = makePrisma({
      redemptionCode: 'ABCD1234',
      redeemedAt: null,
      benefitTitleSnapshot: null,
      benefit: { title: '2x1', description: null, terms: null },
      business: { name: 'Café Test' },
    });
    const service = makeService(prisma);

    const result = await service.getBenefitIssuance('part-1');

    expect(result.benefitTitle).toBe('2x1');
  });

  it('ya canjeada: `redeemed: true`, sin confirmar nada', async () => {
    const prisma = makePrisma({
      redemptionCode: 'ABCD1234',
      redeemedAt: new Date('2026-08-01T00:00:00.000Z'),
      benefitTitleSnapshot: '2x1',
      benefit: { title: '2x1', description: null, terms: null },
      business: { name: 'Café Test' },
    });
    const service = makeService(prisma);

    const result = await service.getBenefitIssuance('part-1');

    expect(result.redeemed).toBe(true);
  });

  it('id inexistente: 404, nunca filtra si existe otro negocio', async () => {
    const prisma = makePrisma(null);
    const service = makeService(prisma);

    await expect(
      service.getBenefitIssuance('no-existe'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('se resuelve SOLO por id — nunca pide ni filtra por businessId', async () => {
    const prisma = makePrisma({
      redemptionCode: 'X',
      redeemedAt: null,
      benefitTitleSnapshot: 'X',
      benefit: { title: 'X', description: null, terms: null },
      business: { name: 'Café Test' },
    });
    const service = makeService(prisma);

    await service.getBenefitIssuance('part-1');

    expect(prisma.benefitParticipation.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'part-1' } }),
    );
  });
});

/**
 * Caso crítico del pedido: un QR histórico `/qr/{businessId}` sobre un
 * negocio que ya pasó a Check-in V2 nunca debe ejecutar el flujo legacy —
 * ni `getQrInfo` (que armaría el formulario legacy) ni `captureContact` (que
 * crearía un Customer sin Visit por fuera del flujo V2 real).
 */
describe('PublicService — QR histórico en un negocio Check-in V2', () => {
  function makeQrHarness(experienceVersion: 'LEGACY' | 'CHECKIN_V2') {
    const prisma = {
      business: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'biz-1',
          name: 'Café Test',
          logoUrl: null,
          primaryColor: null,
          googleBusinessProfileUrl: null,
          phone: null,
          experienceVersion,
          campaigns: [],
        }),
      },
      qrCode: { findFirst: jest.fn().mockResolvedValue({ id: 'qr-1' }) },
      customer: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'cust-1' }),
      },
    };
    const benefits = {
      resolveActiveBenefit: jest.fn().mockResolvedValue(null),
    };
    const messaging = {
      sendWelcome: jest.fn().mockResolvedValue(true),
      sendOwnerNotification: jest.fn().mockResolvedValue(undefined),
      enqueueReviewRequest: jest.fn().mockResolvedValue('msg-1'),
    };
    const publicUrls = {
      resolveCheckinPath: jest
        .fn()
        .mockResolvedValue('/check-in/tok-principal'),
    };
    const service = new PublicService(
      prisma as unknown as PrismaService,
      benefits as unknown as BenefitsService,
      messaging as unknown as PublicMessagingService,
      publicUrls as unknown as CustomerPublicUrlService,
    );
    return { prisma, benefits, messaging, publicUrls, service };
  }

  it('V2: getQrInfo devuelve solo la ruta de redirect, nunca los campos de la pantalla legacy', async () => {
    const { service, publicUrls, benefits } = makeQrHarness('CHECKIN_V2');

    const result = await service.getQrInfo('biz-1');

    expect(result).toEqual({ redirectPath: '/check-in/tok-principal' });
    expect(publicUrls.resolveCheckinPath).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'biz-1', experienceVersion: 'CHECKIN_V2' }),
    );
    // Nunca resuelve el beneficio activo — eso es trabajo de la pantalla
    // legacy, que en V2 no se ejecuta.
    expect(benefits.resolveActiveBenefit).not.toHaveBeenCalled();
  });

  it('LEGACY: getQrInfo sigue devolviendo la info de la pantalla de siempre', async () => {
    const { service } = makeQrHarness('LEGACY');

    const result = await service.getQrInfo('biz-1');

    expect(result).toEqual(
      expect.objectContaining({ businessName: 'Café Test' }),
    );
    expect('redirectPath' in result).toBe(false);
  });

  it('V2: captureContact rechaza con 404, nunca crea un Customer sin Visit', async () => {
    const { service, prisma, messaging } = makeQrHarness('CHECKIN_V2');

    await expect(
      service.captureContact('biz-1', 'Ana', '+59891111111'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.customer.findFirst).not.toHaveBeenCalled();
    expect(messaging.sendWelcome).not.toHaveBeenCalled();
  });

  it('LEGACY: captureContact sigue funcionando igual', async () => {
    const { service, messaging } = makeQrHarness('LEGACY');

    const result = await service.captureContact('biz-1', 'Ana', '+59891111111');

    expect(result).toEqual({ ok: true });
    expect(messaging.sendWelcome).toHaveBeenCalled();
  });
});
