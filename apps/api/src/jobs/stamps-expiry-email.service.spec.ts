import { ExperienceVersion, RewardGoalStatus } from '@prisma/client';
import { StampsExpiryEmailService } from './stamps-expiry-email.service';

const NOW = new Date('2026-09-01T12:00:00.000Z');

function goalFixture(overrides: Record<string, unknown> = {}) {
  return {
    customerId: 'cust-1',
    customer: { name: 'Cliente Test', email: 'cliente@test.com' },
    incentiveDefinition: { name: 'Café gratis' },
    benefitParticipation: {
      id: 'part-1',
      redemptionCode: 'ABC123',
      expiresAt: new Date('2026-09-02T12:00:00.000Z'),
    },
    ...overrides,
  };
}

function makeDeps(options: { businesses?: unknown[]; goals?: unknown[] } = {}) {
  const prisma = {
    business: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          options.businesses ?? [{ id: 'biz-1', name: 'Café Test' }],
        ),
    },
    customerRewardGoal: {
      findMany: jest.fn().mockResolvedValue(options.goals ?? [goalFixture()]),
    },
  };
  const lifecycleEmails = { sendOnce: jest.fn().mockResolvedValue('sent') };
  return { prisma, lifecycleEmails };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new StampsExpiryEmailService(
    deps.prisma as never,
    deps.lifecycleEmails as never,
  );
}

describe('StampsExpiryEmailService — business ownership', () => {
  it('only sweeps CHECKIN_V2 businesses with reward goals AND the stamps-expiry toggle on', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.runDaily(NOW);

    expect(deps.prisma.business.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          experienceVersion: ExperienceVersion.CHECKIN_V2,
          retentionSettings: {
            rewardGoalsEnabled: true,
            stampsExpiryEmailEnabled: true,
          },
        },
      }),
    );
  });
});

describe('StampsExpiryEmailService — eligibility window', () => {
  it('only looks at UNLOCKED goals with an unredeemed, soon-expiring benefit', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.runDaily(NOW);

    expect(deps.prisma.customerRewardGoal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: 'biz-1',
          status: RewardGoalStatus.UNLOCKED,
          benefitParticipationId: { not: null },
          benefitParticipation: expect.objectContaining({
            redeemedAt: null,
          }),
        }),
      }),
    );
  });

  it('sends the email with the real redemption code and rounded days remaining', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(deps.lifecycleEmails.sendOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'biz-1',
        customerId: 'cust-1',
        kind: 'stamps_expiry',
        dedupeKey: 'part-1',
        to: 'cliente@test.com',
      }),
    );
    expect(result).toEqual({ businesses: 1, evaluated: 1, sent: 1 });
  });

  it('skips a goal whose benefit has no expiresAt or redemption code, without crashing', async () => {
    const deps = makeDeps({
      goals: [
        goalFixture({
          benefitParticipation: {
            id: 'part-2',
            redemptionCode: null,
            expiresAt: null,
          },
        }),
      ],
    });
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(deps.lifecycleEmails.sendOnce).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
  });
});

describe('StampsExpiryEmailService — multi-business', () => {
  it('sweeps every eligible business independently', async () => {
    const deps = makeDeps({
      businesses: [
        { id: 'biz-1', name: 'Café Test' },
        { id: 'biz-2', name: 'Bar Test' },
      ],
    });
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(deps.prisma.customerRewardGoal.findMany).toHaveBeenCalledTimes(2);
    expect(result.businesses).toBe(2);
  });
});
