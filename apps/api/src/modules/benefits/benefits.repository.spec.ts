import { BenefitType } from '@prisma/client';
import { BenefitsRepository } from './benefits.repository';

// Builds a fake Prisma whose $transaction just runs the callback with `tx`.
function makePrisma() {
  const tx = {
    benefit: {
      findFirst: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'new' }),
      update: jest.fn().mockResolvedValue({ id: 'b1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    benefit: tx.benefit,
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  return { prisma, tx };
}

describe('BenefitsRepository single-active invariant', () => {
  it('create deactivates other active benefits when active=true', async () => {
    const { prisma, tx } = makePrisma();
    const repo = new BenefitsRepository(prisma as never);

    await repo.create('biz-1', {
      type: BenefitType.gift,
      title: 'Café gratis',
      active: true,
    });

    expect(tx.benefit.updateMany).toHaveBeenCalledWith({
      where: { businessId: 'biz-1', active: true },
      data: { active: false },
    });
    expect(tx.benefit.create).toHaveBeenCalled();
  });

  it('create does not deactivate others when active=false', async () => {
    const { prisma, tx } = makePrisma();
    const repo = new BenefitsRepository(prisma as never);

    await repo.create('biz-1', {
      type: BenefitType.gift,
      title: 'Café gratis',
      active: false,
    });

    expect(tx.benefit.updateMany).not.toHaveBeenCalled();
  });

  it('setActive(true) deactivates every other active benefit except the target', async () => {
    const { prisma, tx } = makePrisma();
    tx.benefit.findFirst.mockResolvedValue({ id: 'b1' });
    const repo = new BenefitsRepository(prisma as never);

    await repo.setActive('biz-1', 'b1', true);

    expect(tx.benefit.updateMany).toHaveBeenCalledWith({
      where: { businessId: 'biz-1', active: true, id: { not: 'b1' } },
      data: { active: false },
    });
    expect(tx.benefit.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { active: true },
    });
  });

  it('setActive returns null when the benefit is not the tenant’s', async () => {
    const { prisma, tx } = makePrisma();
    tx.benefit.findFirst.mockResolvedValue(null);
    const repo = new BenefitsRepository(prisma as never);

    const result = await repo.setActive('biz-1', 'foreign', true);

    expect(result).toBeNull();
    expect(tx.benefit.update).not.toHaveBeenCalled();
  });
});
