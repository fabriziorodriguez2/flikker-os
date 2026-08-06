import { BenefitsRepository } from './benefits.repository';

function makePrisma() {
  const tx = {
    benefitParticipation: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  return { prisma, tx };
}

describe('BenefitsRepository.consumeRedemption', () => {
  it('returns not_found when no participation holds the code', async () => {
    const { prisma, tx } = makePrisma();
    tx.benefitParticipation.findFirst.mockResolvedValue(null);
    const repo = new BenefitsRepository(prisma as never);

    const result = await repo.consumeRedemption('biz-1', 'CODE', 'user-1');

    expect(result).toEqual({ status: 'not_found' });
    expect(tx.benefitParticipation.updateMany).not.toHaveBeenCalled();
  });

  it('returns already when the code was previously redeemed', async () => {
    const { prisma, tx } = makePrisma();
    tx.benefitParticipation.findFirst.mockResolvedValue({
      id: 'p-1',
      benefitId: 'b-1',
      customerId: 'c-1',
      redeemedAt: new Date(),
      benefit: { title: 'x', type: 'discount' },
      customer: { name: 'Ana' },
    });
    const repo = new BenefitsRepository(prisma as never);

    const result = await repo.consumeRedemption('biz-1', 'CODE', 'user-1');

    expect(result).toEqual({ status: 'already' });
    expect(tx.benefitParticipation.updateMany).not.toHaveBeenCalled();
  });

  it('consumes atomically and returns ok on the first winner', async () => {
    const { prisma, tx } = makePrisma();
    tx.benefitParticipation.findFirst.mockResolvedValue({
      id: 'p-1',
      benefitId: 'b-1',
      customerId: 'c-1',
      redeemedAt: null,
      benefit: { title: '10% off', type: 'discount' },
      customer: { name: 'Ana' },
    });
    tx.benefitParticipation.updateMany.mockResolvedValue({ count: 1 });
    const repo = new BenefitsRepository(prisma as never);

    const result = await repo.consumeRedemption('biz-1', 'CODE', 'user-1');

    // Guard: the update only matches rows still un-redeemed.
    expect(tx.benefitParticipation.updateMany).toHaveBeenCalledWith({
      where: { id: 'p-1', redeemedAt: null },
      data: expect.objectContaining({ redeemedByUserId: 'user-1' }),
    });
    expect(result).toMatchObject({
      status: 'ok',
      participationId: 'p-1',
      benefitId: 'b-1',
      customerId: 'c-1',
    });
  });

  it('returns already when a concurrent redeem won the race (count 0)', async () => {
    const { prisma, tx } = makePrisma();
    tx.benefitParticipation.findFirst.mockResolvedValue({
      id: 'p-1',
      benefitId: 'b-1',
      customerId: 'c-1',
      redeemedAt: null,
      benefit: { title: 'x', type: 'discount' },
      customer: { name: 'Ana' },
    });
    tx.benefitParticipation.updateMany.mockResolvedValue({ count: 0 });
    const repo = new BenefitsRepository(prisma as never);

    const result = await repo.consumeRedemption('biz-1', 'CODE', 'user-1');

    expect(result).toEqual({ status: 'already' });
  });
});
