import { BenefitsRepository } from './benefits.repository';

function makePrisma() {
  const tx = {
    benefitParticipation: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const prisma = {
    benefitParticipation: tx.benefitParticipation,
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  return { prisma, tx };
}

describe('BenefitsRepository.consumeRedemption', () => {
  it('returns not_found when no participation holds the code', async () => {
    const { prisma, tx } = makePrisma();
    tx.benefitParticipation.findFirst.mockResolvedValue(null);
    const repo = new BenefitsRepository(prisma as never);

    const result = await repo.consumeRedemption('CODE', 'user-1');

    expect(result).toEqual({ status: 'not_found' });
    expect(tx.benefitParticipation.updateMany).not.toHaveBeenCalled();
  });

  it('never filters by businessId — redemptionCode is globally unique', async () => {
    const { prisma, tx } = makePrisma();
    tx.benefitParticipation.findFirst.mockResolvedValue(null);
    const repo = new BenefitsRepository(prisma as never);

    await repo.consumeRedemption('CODE', 'user-1');

    expect(tx.benefitParticipation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { redemptionCode: 'CODE' } }),
    );
  });

  it('returns already (with businessId) when the code was previously redeemed', async () => {
    const { prisma, tx } = makePrisma();
    tx.benefitParticipation.findFirst.mockResolvedValue({
      id: 'p-1',
      businessId: 'biz-1',
      benefitId: 'b-1',
      customerId: 'c-1',
      redeemedAt: new Date(),
      benefit: { title: 'x', type: 'discount' },
      customer: { name: 'Ana' },
    });
    const repo = new BenefitsRepository(prisma as never);

    const result = await repo.consumeRedemption('CODE', 'user-1');

    expect(result).toEqual({ status: 'already', businessId: 'biz-1' });
    expect(tx.benefitParticipation.updateMany).not.toHaveBeenCalled();
  });

  it('consumes atomically and returns ok (with businessId) on the first winner', async () => {
    const { prisma, tx } = makePrisma();
    tx.benefitParticipation.findFirst.mockResolvedValue({
      id: 'p-1',
      businessId: 'biz-1',
      benefitId: 'b-1',
      customerId: 'c-1',
      redeemedAt: null,
      benefit: { title: '10% off', type: 'discount' },
      customer: { name: 'Ana' },
    });
    tx.benefitParticipation.updateMany.mockResolvedValue({ count: 1 });
    const repo = new BenefitsRepository(prisma as never);

    const result = await repo.consumeRedemption('CODE', 'user-1');

    // Guard: the update only matches rows still un-redeemed.
    expect(tx.benefitParticipation.updateMany).toHaveBeenCalledWith({
      where: { id: 'p-1', redeemedAt: null },
      data: expect.objectContaining({ redeemedByUserId: 'user-1' }),
    });
    expect(result).toMatchObject({
      status: 'ok',
      businessId: 'biz-1',
      participationId: 'p-1',
      benefitId: 'b-1',
      customerId: 'c-1',
    });
  });

  it('returns already when a concurrent redeem won the race (count 0)', async () => {
    const { prisma, tx } = makePrisma();
    tx.benefitParticipation.findFirst.mockResolvedValue({
      id: 'p-1',
      businessId: 'biz-1',
      benefitId: 'b-1',
      customerId: 'c-1',
      redeemedAt: null,
      benefit: { title: 'x', type: 'discount' },
      customer: { name: 'Ana' },
    });
    tx.benefitParticipation.updateMany.mockResolvedValue({ count: 0 });
    const repo = new BenefitsRepository(prisma as never);

    const result = await repo.consumeRedemption('CODE', 'user-1');

    expect(result).toEqual({ status: 'already', businessId: 'biz-1' });
  });

  it('returns expired for a code past its expiresAt, before touching the row', async () => {
    const { prisma, tx } = makePrisma();
    tx.benefitParticipation.findFirst.mockResolvedValue({
      id: 'p-1',
      businessId: 'biz-1',
      benefitId: 'b-1',
      customerId: 'c-1',
      redeemedAt: null,
      expiresAt: new Date('2026-01-01T00:00:00.000Z'),
      benefit: { title: 'x', type: 'discount' },
      customer: { name: 'Ana' },
    });
    const repo = new BenefitsRepository(prisma as never);

    const result = await repo.consumeRedemption(
      'CODE',
      'user-1',
      new Date('2026-06-01T00:00:00.000Z'),
    );

    expect(result).toEqual({ status: 'expired', businessId: 'biz-1' });
    expect(tx.benefitParticipation.updateMany).not.toHaveBeenCalled();
  });

  it('a code with no expiresAt (the plain QR-flow case) is never treated as expired', async () => {
    const { prisma, tx } = makePrisma();
    tx.benefitParticipation.findFirst.mockResolvedValue({
      id: 'p-1',
      businessId: 'biz-1',
      benefitId: 'b-1',
      customerId: 'c-1',
      redeemedAt: null,
      expiresAt: null,
      benefit: { title: 'x', type: 'discount' },
      customer: { name: 'Ana' },
    });
    tx.benefitParticipation.updateMany.mockResolvedValue({ count: 1 });
    const repo = new BenefitsRepository(prisma as never);

    const result = await repo.consumeRedemption('CODE', 'user-1');

    expect(result.status).toBe('ok');
  });
});

describe('BenefitsRepository.previewRedemption', () => {
  it('never mutates — no updateMany, no $transaction', async () => {
    const { prisma } = makePrisma();
    prisma.benefitParticipation.findFirst = jest.fn().mockResolvedValue({
      id: 'p-1',
      businessId: 'biz-1',
      redeemedAt: null,
      expiresAt: null,
      benefit: { title: 'Capuccino gratis' },
      customer: { name: 'Ana' },
    });
    const repo = new BenefitsRepository(prisma as never);

    const result = await repo.previewRedemption('CODE');

    expect(result).toEqual({
      status: 'ok',
      businessId: 'biz-1',
      benefitTitle: 'Capuccino gratis',
      customerName: 'Ana',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('never filters by businessId — redemptionCode is globally unique', async () => {
    const { prisma } = makePrisma();
    prisma.benefitParticipation.findFirst = jest.fn().mockResolvedValue(null);
    const repo = new BenefitsRepository(prisma as never);

    await repo.previewRedemption('CODE');

    expect(prisma.benefitParticipation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { redemptionCode: 'CODE' } }),
    );
  });

  it('returns not_found without exposing any internal id', async () => {
    const { prisma } = makePrisma();
    prisma.benefitParticipation.findFirst = jest.fn().mockResolvedValue(null);
    const repo = new BenefitsRepository(prisma as never);

    const result = await repo.previewRedemption('CODE');

    expect(result).toEqual({ status: 'not_found' });
  });
});
