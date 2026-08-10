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
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    retentionIncentiveDefinition: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'def-1' }),
      update: jest.fn().mockResolvedValue({ id: 'def-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    benefit: tx.benefit,
    retentionIncentiveDefinition: tx.retentionIncentiveDefinition,
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

describe('BenefitsRepository — pre-piloto #2: solo remove() desautoriza el bridge', () => {
  it('setActive(false) no toca el bridge — varios beneficios pueden quedar autorizados aunque solo uno esté activo', async () => {
    const { prisma, tx } = makePrisma();
    tx.benefit.findFirst.mockResolvedValue({ id: 'b1' });
    const repo = new BenefitsRepository(prisma as never);

    await repo.setActive('biz-1', 'b1', false);

    expect(tx.retentionIncentiveDefinition.updateMany).not.toHaveBeenCalled();
  });

  it('update(active: false) tampoco desautoriza el bridge', async () => {
    const { prisma, tx } = makePrisma();
    tx.benefit.findFirst.mockResolvedValue({ id: 'b1' });
    const repo = new BenefitsRepository(prisma as never);

    await repo.update('biz-1', 'b1', { active: false });

    expect(tx.retentionIncentiveDefinition.updateMany).not.toHaveBeenCalled();
  });

  it('remove (borrado real) sí deauthorizes the bridge before deleting the Benefit', async () => {
    const { prisma, tx } = makePrisma();
    const repo = new BenefitsRepository(prisma as never);

    const callOrder: string[] = [];
    tx.retentionIncentiveDefinition.updateMany.mockImplementation(() => {
      callOrder.push('deauthorize');
      return Promise.resolve({ count: 1 });
    });
    tx.benefit.deleteMany.mockImplementation(() => {
      callOrder.push('delete');
      return Promise.resolve({ count: 1 });
    });

    const result = await repo.remove('biz-1', 'b1');

    expect(result).toBe(true);
    expect(callOrder).toEqual(['deauthorize', 'delete']);
    expect(tx.retentionIncentiveDefinition.updateMany).toHaveBeenCalledWith({
      where: { benefitId: 'b1' },
      data: { automationEligible: false, rewardGoalEligible: false },
    });
  });
});

describe('BenefitsRepository.setRetentionBridge', () => {
  it('returns null when the benefit is not the tenant’s', async () => {
    const { prisma, tx } = makePrisma();
    tx.benefit.findFirst.mockResolvedValue(null);
    const repo = new BenefitsRepository(prisma as never);

    const result = await repo.setRetentionBridge('biz-1', 'foreign', {
      automationEligible: true,
      estimatedCost: 50,
    });

    expect(result).toBeNull();
    expect(tx.retentionIncentiveDefinition.create).not.toHaveBeenCalled();
  });

  it('creates the bridge definition on first activation, snapshotting name/type from the Benefit', async () => {
    const { prisma, tx } = makePrisma();
    tx.benefit.findFirst.mockResolvedValue({
      id: 'b1',
      type: BenefitType.gift,
      title: 'Capuccino gratis',
    });
    tx.retentionIncentiveDefinition.findUnique.mockResolvedValue(null);
    tx.retentionIncentiveDefinition.create.mockResolvedValue({
      id: 'def-1',
      automationEligible: false,
      rewardGoalEligible: false,
    });
    const repo = new BenefitsRepository(prisma as never);

    await repo.setRetentionBridge('biz-1', 'b1', {
      automationEligible: true,
      estimatedCost: 50,
    });

    expect(tx.retentionIncentiveDefinition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          businessId: 'biz-1',
          benefitId: 'b1',
          name: 'Capuccino gratis',
          type: BenefitType.gift,
          active: true,
        },
      }),
    );
  });

  it('the created bridge is immediately findable by Retention V2 and Reward Goals', async () => {
    // Both `RetentionIncentivesService.list()` and the Reward Goal engine's
    // `findEligibleIncentiveIds` query `retentionIncentiveDefinition` scoped
    // only by `businessId` (+ `active`/`rewardGoalEligible` for the latter) —
    // neither filters on `benefitId`, so a bridge-created row needs no
    // special-casing on their side. This asserts the row this repository
    // creates already satisfies both: scoped to the right business, active.
    const { prisma, tx } = makePrisma();
    tx.benefit.findFirst.mockResolvedValue({
      id: 'b1',
      type: BenefitType.gift,
      title: 'Capuccino gratis',
    });
    tx.retentionIncentiveDefinition.findUnique.mockResolvedValue(null);
    tx.retentionIncentiveDefinition.create.mockResolvedValue({
      id: 'def-1',
      automationEligible: false,
      rewardGoalEligible: false,
    });
    const repo = new BenefitsRepository(prisma as never);

    await repo.setRetentionBridge('biz-1', 'b1', { rewardGoalEligible: true });

    const created = (
      tx.retentionIncentiveDefinition.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      }
    ).data;
    expect(created.businessId).toBe('biz-1');
    expect(created.active).toBe(true);
  });

  it('never duplicates: reuses the existing definition found by benefitId', async () => {
    const { prisma, tx } = makePrisma();
    tx.benefit.findFirst.mockResolvedValue({
      id: 'b1',
      type: BenefitType.gift,
      title: 'Capuccino gratis',
    });
    tx.retentionIncentiveDefinition.findUnique.mockResolvedValue({
      id: 'def-1',
      automationEligible: false,
      rewardGoalEligible: false,
    });
    const repo = new BenefitsRepository(prisma as never);

    await repo.setRetentionBridge('biz-1', 'b1', { rewardGoalEligible: true });

    expect(tx.retentionIncentiveDefinition.create).not.toHaveBeenCalled();
    expect(tx.retentionIncentiveDefinition.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'def-1' },
        data: { rewardGoalEligible: true },
      }),
    );
  });

  it('does not create a bridge just to turn everything off (no-op when none exists)', async () => {
    const { prisma, tx } = makePrisma();
    tx.benefit.findFirst.mockResolvedValue({
      id: 'b1',
      type: BenefitType.gift,
      title: 'Capuccino gratis',
    });
    tx.retentionIncentiveDefinition.findUnique.mockResolvedValue(null);
    const repo = new BenefitsRepository(prisma as never);

    const result = await repo.setRetentionBridge('biz-1', 'b1', {
      automationEligible: false,
    });

    expect(result).toBeNull();
    expect(tx.retentionIncentiveDefinition.create).not.toHaveBeenCalled();
  });
});
