import { Prisma } from '@prisma/client';
import { DomainEventClaimService } from './domain-event-claim.service';

/**
 * El primitivo de idempotencia real detrás de REGISTRATION_COMPLETED y
 * SUBSCRIPTION_PAID (Parte 5) — mockea Prisma; la garantía de concurrencia
 * REAL (dos claims simultáneos contra la misma fila) la prueba Postgres,
 * no este archivo — ver los specs de integración de los dos eventos.
 */
describe('DomainEventClaimService', () => {
  function makePrisma() {
    return {
      domainEvent: {
        create: jest.fn(),
      },
    };
  }

  it('primera vez: crea la fila y devuelve true', async () => {
    const prisma = makePrisma();
    prisma.domainEvent.create.mockResolvedValue({ id: 'evt-1' });
    const service = new DomainEventClaimService(prisma as never);

    const claimed = await service.claimOnce('REGISTRATION_COMPLETED', 'biz-1');

    expect(claimed).toBe(true);
    expect(prisma.domainEvent.create).toHaveBeenCalledWith({
      data: { eventType: 'REGISTRATION_COMPLETED', entityId: 'biz-1' },
    });
  });

  it('ya reclamado (P2002 del índice único): devuelve false, nunca tira', async () => {
    const prisma = makePrisma();
    const p2002 = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: '0.0.0',
    });
    prisma.domainEvent.create.mockRejectedValue(p2002);
    const service = new DomainEventClaimService(prisma as never);

    const claimed = await service.claimOnce('SUBSCRIPTION_PAID', 'lead-1');

    expect(claimed).toBe(false);
  });

  it('error inesperado (no P2002): se propaga, nunca se trata como "ya reclamado"', async () => {
    const prisma = makePrisma();
    prisma.domainEvent.create.mockRejectedValue(new Error('DB caída'));
    const service = new DomainEventClaimService(prisma as never);

    await expect(
      service.claimOnce('SUBSCRIPTION_PAID', 'lead-1'),
    ).rejects.toThrow('DB caída');
  });
});
