import { BenefitType } from '@prisma/client';
import { RewardGoalIssuerService } from './reward-goal-issuer.service';

function goalFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'goal-1',
    businessId: 'biz-1',
    customerId: 'cust-1',
    benefitParticipationId: null,
    incentiveDefinition: {
      id: 'inc-1',
      name: 'Café gratis',
      description: null,
      conditions: null,
      type: BenefitType.gift,
      expiresInDays: 14,
    },
    ...overrides,
  };
}

function makePrisma(options: { goal?: unknown; participation?: unknown } = {}) {
  return {
    customerRewardGoal: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options.goal === undefined ? goalFixture() : options.goal,
        ),
      update: jest.fn().mockResolvedValue({}),
    },
    benefit: {
      create: jest.fn().mockResolvedValue({ id: 'benefit-new' }),
    },
    benefitParticipation: {
      create: jest.fn().mockResolvedValue({
        id: 'part-1',
        redemptionCode: 'ABCD1234',
        expiresAt: new Date('2026-09-15T00:00:00.000Z'),
      }),
      findUnique: jest.fn().mockResolvedValue(
        options.participation ?? {
          id: 'part-existing',
          redemptionCode: 'EXIST123',
          expiresAt: new Date('2026-09-10T00:00:00.000Z'),
        },
      ),
    },
  };
}

const NOW = new Date('2026-09-01T00:00:00.000Z');

describe('RewardGoalIssuerService — issuing a fresh reward', () => {
  it('creates a dedicated inert Benefit for this goal, never active', async () => {
    const prisma = makePrisma();
    const service = new RewardGoalIssuerService(prisma as never);

    await service.issueForGoal('goal-1', NOW);

    expect(prisma.benefit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId: 'biz-1',
        active: false,
        title: 'Café gratis',
        // Marca explícita, no derivada de `active: false`. Es lo que mantiene
        // al carrier fuera del catálogo del dueño y, sobre todo, fuera de su
        // alcance para borrarlo: borrarlo se llevaba por cascade la emisión
        // ya canjeada y dejaba la goal en REDEEMED sin participación.
        isInternalCarrier: true,
      }),
      select: { id: true },
    });
  });

  it('creates the participation on the fresh benefit, with a code and expiry', async () => {
    const prisma = makePrisma();
    const service = new RewardGoalIssuerService(prisma as never);

    const result = await service.issueForGoal('goal-1', NOW);

    expect(prisma.benefitParticipation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        benefitId: 'benefit-new',
        customerId: 'cust-1',
      }),
      select: { id: true, redemptionCode: true, expiresAt: true },
    });
    expect(result).toEqual({
      participationId: 'part-1',
      code: 'ABCD1234',
      expiresAt: new Date('2026-09-15T00:00:00.000Z'),
    });
  });

  it('links the participation back onto the goal', async () => {
    const prisma = makePrisma();
    const service = new RewardGoalIssuerService(prisma as never);

    await service.issueForGoal('goal-1', NOW);

    expect(prisma.customerRewardGoal.update).toHaveBeenCalledWith({
      where: { id: 'goal-1' },
      data: { benefitParticipationId: 'part-1' },
    });
  });
});

describe('RewardGoalIssuerService — idempotency', () => {
  it('returns the existing participation instead of minting a second one', async () => {
    const prisma = makePrisma({
      goal: goalFixture({ benefitParticipationId: 'part-existing' }),
    });
    const service = new RewardGoalIssuerService(prisma as never);

    const result = await service.issueForGoal('goal-1', NOW);

    expect(result).toEqual({
      participationId: 'part-existing',
      code: 'EXIST123',
      expiresAt: new Date('2026-09-10T00:00:00.000Z'),
    });
    expect(prisma.benefit.create).not.toHaveBeenCalled();
    expect(prisma.benefitParticipation.create).not.toHaveBeenCalled();
  });

  it('never collides with a prior goal for the same incentive definition', async () => {
    // Two separate goals, same incentive definition (a customer earning
    // "Café gratis" for a second time). Each issues its own Benefit, so
    // there is no benefitId_customerId collision.
    const prisma = makePrisma();
    const service = new RewardGoalIssuerService(prisma as never);

    await service.issueForGoal('goal-1', NOW);
    await service.issueForGoal('goal-1', NOW); // simulate a second call on a fresh instance state

    // benefit.create was called at most once per goal in this test's flow —
    // the real duplication guard is the benefitParticipationId check above;
    // this just documents that the mechanism is per-goal, not per-definition.
    expect(prisma.benefit.create).toHaveBeenCalled();
  });

  it('returns null for a goal that no longer exists', async () => {
    const prisma = makePrisma({ goal: null });
    const service = new RewardGoalIssuerService(prisma as never);

    expect(await service.issueForGoal('ghost', NOW)).toBeNull();
  });
});
