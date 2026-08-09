import { BenefitType } from '@prisma/client';
import { RetentionIncentivesService } from './retention-incentives.service';

function makePrisma(
  options: { definition?: unknown; usedByVariant?: unknown } = {},
) {
  return {
    retentionIncentiveDefinition: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.definition === undefined
            ? { id: 'inc-1', businessId: 'biz-1', name: '10% OFF' }
            : options.definition,
        ),
      create: jest.fn().mockResolvedValue({ id: 'inc-new' }),
      update: jest.fn().mockResolvedValue({ id: 'inc-1', active: false }),
      delete: jest.fn().mockResolvedValue({ id: 'inc-1' }),
    },
    retentionVariant: {
      findFirst: jest.fn().mockResolvedValue(options.usedByVariant ?? null),
    },
  };
}

describe('RetentionIncentivesService — tenant scoping', () => {
  it('list is scoped to the business', async () => {
    const prisma = makePrisma();
    const service = new RetentionIncentivesService(prisma as never);

    await service.list('biz-1');

    expect(prisma.retentionIncentiveDefinition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { businessId: 'biz-1' } }),
    );
  });

  it('getOne 404s instead of leaking another tenant’s row', async () => {
    const prisma = makePrisma({ definition: null });
    const service = new RetentionIncentivesService(prisma as never);

    await expect(service.getOne('biz-1', 'inc-other-tenant')).rejects.toThrow(
      'Incentive not found',
    );
  });
});

describe('RetentionIncentivesService.create', () => {
  it('defaults automationEligible to false — automation is always opt-in', async () => {
    const prisma = makePrisma();
    const service = new RetentionIncentivesService(prisma as never);

    await service.create('biz-1', {
      name: '10% OFF',
      type: BenefitType.discount,
    });

    const data = (
      prisma.retentionIncentiveDefinition.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      }
    ).data;
    expect(data.automationEligible).toBe(false);
    expect(data.rewardGoalEligible).toBe(false);
    expect(data.businessId).toBe('biz-1');
  });

  it('accepts rewardGoalEligible independently of automationEligible (Fase E §1)', async () => {
    const prisma = makePrisma();
    const service = new RetentionIncentivesService(prisma as never);

    await service.create('biz-1', {
      name: 'Café gratis',
      type: BenefitType.gift,
      rewardGoalEligible: true,
      // No percentage/fixed value, and automation stays off — a gift reward
      // goal never needs one, unlike a retention campaign incentive.
    });

    const data = (
      prisma.retentionIncentiveDefinition.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      }
    ).data;
    expect(data.rewardGoalEligible).toBe(true);
    expect(data.automationEligible).toBe(false);
  });

  it('rejects automation without a concrete value to grant', async () => {
    const prisma = makePrisma();
    const service = new RetentionIncentivesService(prisma as never);

    await expect(
      service.create('biz-1', {
        name: 'Upgrade gratis',
        type: BenefitType.gift,
        automationEligible: true,
      }),
    ).rejects.toThrow(
      'An incentive authorized for automation needs a percentageValue, a fixedValue, or an estimatedCost',
    );
    expect(prisma.retentionIncentiveDefinition.create).not.toHaveBeenCalled();
  });

  it('accepts automation with only an estimatedCost — a gift has no percentage/fixed value', async () => {
    const prisma = makePrisma();
    const service = new RetentionIncentivesService(prisma as never);

    await service.create('biz-1', {
      name: 'Capuccino gratis',
      type: BenefitType.gift,
      automationEligible: true,
      estimatedCost: 50,
    });

    expect(prisma.retentionIncentiveDefinition.create).toHaveBeenCalledTimes(1);
  });

  it('rejects combining a percentage and a fixed value', async () => {
    const prisma = makePrisma();
    const service = new RetentionIncentivesService(prisma as never);

    await expect(
      service.create('biz-1', {
        name: 'Mixed',
        type: BenefitType.discount,
        automationEligible: true,
        percentageValue: 10,
        fixedValue: 100,
      }),
    ).rejects.toThrow(
      'An incentive cannot combine percentageValue and fixedValue',
    );
  });

  it('accepts automation with a percentage value', async () => {
    const prisma = makePrisma();
    const service = new RetentionIncentivesService(prisma as never);

    await service.create('biz-1', {
      name: '10% OFF',
      type: BenefitType.discount,
      automationEligible: true,
      percentageValue: 10,
    });

    expect(prisma.retentionIncentiveDefinition.create).toHaveBeenCalledTimes(1);
  });
});

describe('RetentionIncentivesService.update', () => {
  it('re-validates the merged configuration, not just the patch', async () => {
    // Existing row already has percentageValue; the patch only flips
    // automationEligible on — the merge must still see the existing value.
    const prisma = makePrisma({
      definition: {
        id: 'inc-1',
        businessId: 'biz-1',
        percentageValue: 10,
        fixedValue: null,
        automationEligible: false,
      },
    });
    const service = new RetentionIncentivesService(prisma as never);

    await service.update('biz-1', 'inc-1', { automationEligible: true });

    expect(prisma.retentionIncentiveDefinition.update).toHaveBeenCalledWith({
      where: { id: 'inc-1' },
      data: { automationEligible: true },
    });
  });

  it('rejects turning automation on when no value is set anywhere', async () => {
    const prisma = makePrisma({
      definition: {
        id: 'inc-1',
        businessId: 'biz-1',
        percentageValue: null,
        fixedValue: null,
        automationEligible: false,
      },
    });
    const service = new RetentionIncentivesService(prisma as never);

    await expect(
      service.update('biz-1', 'inc-1', { automationEligible: true }),
    ).rejects.toThrow(
      'An incentive authorized for automation needs a percentageValue, a fixedValue, or an estimatedCost',
    );
  });

  it('scopes the lookup to the business before writing anything', async () => {
    const prisma = makePrisma({ definition: null });
    const service = new RetentionIncentivesService(prisma as never);

    await expect(
      service.update('biz-1', 'inc-other-tenant', { name: 'Hijacked' }),
    ).rejects.toThrow('Incentive not found');
    expect(prisma.retentionIncentiveDefinition.update).not.toHaveBeenCalled();
  });
});

describe('RetentionIncentivesService.remove — Fase C.5 §3', () => {
  it('hard-deletes an incentive that was never used by any variant', async () => {
    const prisma = makePrisma({
      definition: { id: 'inc-1', businessId: 'biz-1' },
      usedByVariant: null,
    });
    const service = new RetentionIncentivesService(prisma as never);

    await service.remove('biz-1', 'inc-1');

    expect(prisma.retentionIncentiveDefinition.delete).toHaveBeenCalledWith({
      where: { id: 'inc-1' },
    });
  });

  it('never hard-deletes an incentive an experiment already used', async () => {
    const prisma = makePrisma({
      definition: { id: 'inc-1', businessId: 'biz-1' },
      usedByVariant: { id: 'var-1' },
    });
    const service = new RetentionIncentivesService(prisma as never);

    await expect(service.remove('biz-1', 'inc-1')).rejects.toThrow(
      'already used by an experiment',
    );
    expect(prisma.retentionIncentiveDefinition.delete).not.toHaveBeenCalled();
    expect(prisma.retentionIncentiveDefinition.update).toHaveBeenCalledWith({
      where: { id: 'inc-1' },
      data: { active: false },
    });
  });
});
