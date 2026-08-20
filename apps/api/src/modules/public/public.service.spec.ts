import { NotFoundException } from '@nestjs/common';
import { PublicService } from './public.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { BenefitsService } from '../benefits/benefits.service';
import type { PublicMessagingService } from './public-messaging.service';

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
    });
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
