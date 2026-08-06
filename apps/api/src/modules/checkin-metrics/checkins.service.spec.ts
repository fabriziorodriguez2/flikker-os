import { NotFoundException } from '@nestjs/common';
import { CheckinsService } from './checkins.service';

function makePrisma() {
  return {
    visit: { findMany: jest.fn() },
    benefit: { findMany: jest.fn() },
    customer: { findFirst: jest.fn() },
    customerEvent: { findMany: jest.fn() },
    message: { findMany: jest.fn() },
  };
}

describe('CheckinsService.getTimeline', () => {
  it('throws NotFound for a customer outside the tenant', async () => {
    const prisma = makePrisma();
    prisma.customer.findFirst.mockResolvedValue(null);
    const service = new CheckinsService(prisma as never);

    await expect(
      service.getTimeline('biz-1', 'foreign'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('merges events and message milestones, newest first', async () => {
    const prisma = makePrisma();
    prisma.customer.findFirst.mockResolvedValue({
      id: 'c-1',
      name: 'Ana',
      phoneE164: '+598',
      createdAt: new Date('2026-08-01T10:00:00Z'),
    });
    prisma.customerEvent.findMany.mockResolvedValue([
      {
        type: 'visit_created',
        createdAt: new Date('2026-08-01T10:05:00Z'),
        metadata: { first: true },
      },
      {
        type: 'customer_registered',
        createdAt: new Date('2026-08-01T10:00:00Z'),
        metadata: null,
      },
    ]);
    prisma.message.findMany.mockResolvedValue([
      {
        sentAt: new Date('2026-08-01T11:00:00Z'),
        deliveredAt: null,
        readAt: null,
        clickedAt: new Date('2026-08-01T12:00:00Z'),
      },
    ]);
    const service = new CheckinsService(prisma as never);

    const result = await service.getTimeline('biz-1', 'c-1');

    const labels = result.entries.map((e) => e.label);
    // Newest first: click (12:00) → sent (11:00) → primera visita (10:05) → registro (10:00)
    expect(labels).toEqual([
      'Abrió el link del mensaje',
      'Mensaje enviado',
      'Primera visita',
      'Registro',
    ]);
  });
});

describe('CheckinsService.listVisits', () => {
  it('resolves the benefit title for redemption visits from metadata', async () => {
    const prisma = makePrisma();
    prisma.visit.findMany.mockResolvedValue([
      {
        id: 'v-1',
        occurredAt: new Date('2026-08-01T10:00:00Z'),
        isReturn: true,
        attributionType: 'confirmed_redemption',
        verificationType: 'benefit_redemption',
        metadata: { redemption: { benefitId: 'b-1' } },
        customer: { id: 'c-1', name: 'Ana', phoneE164: '+598' },
        source: { name: 'Mostrador' },
        campaign: null,
      },
    ]);
    prisma.benefit.findMany.mockResolvedValue([
      { id: 'b-1', title: '10% off' },
    ]);
    const service = new CheckinsService(prisma as never);

    const result = await service.listVisits('biz-1', {});

    expect(prisma.benefit.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['b-1'] }, businessId: 'biz-1' },
      select: { id: true, title: true },
    });
    expect(result[0]).toMatchObject({
      id: 'v-1',
      sourceName: 'Mostrador',
      benefitTitle: '10% off',
    });
  });
});
