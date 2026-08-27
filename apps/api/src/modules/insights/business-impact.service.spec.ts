import { BusinessImpactService } from './business-impact.service';

const NOW = new Date('2026-08-31T12:00:00.000Z');
const ONBOARDING_COMPLETED_AT = new Date('2026-08-01T09:00:00.000Z');

function emptyFunnel(overrides: Record<string, unknown> = {}) {
  return {
    overall: {
      contacted: 0,
      returned: 0,
      recoveryRate: 0,
      averageDaysToReturn: null,
      evidenceState: 'INSUFFICIENT_DATA' as const,
      ...overrides,
    },
    byArm: null,
  };
}

function makeDeps() {
  const prisma = {
    business: {
      findUnique: jest.fn().mockResolvedValue({
        onboardingCompletedAt: ONBOARDING_COMPLETED_AT,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
      }),
    },
  };
  const loyalty = {
    list: jest.fn().mockResolvedValue({
      total: 71,
      kpis: { volvieron: 18, nuevos: 5, activos: 10, windowDays: 30 },
    }),
  };
  const rewardProgram = {
    getOverview: jest.fn().mockResolvedValue({
      stats: {
        customersParticipating: 30,
        cardsInProgress: 12,
        unlockedTotal: 8,
        redeemedTotal: 6,
      },
    }),
  };
  const reactivationFunnel = {
    forBusiness: jest.fn().mockResolvedValue(emptyFunnel({ returned: 4 })),
    countRecoveredInRange: jest.fn().mockResolvedValue(1),
  };
  const benefits = {
    countRedeemed: jest.fn().mockResolvedValue(6),
  };
  const insightsRepository = {
    countNewCustomersInRange: jest.fn().mockResolvedValue(9),
    countReturningCustomersInRange: jest.fn().mockResolvedValue(3),
    countReviewsInRange: jest.fn().mockResolvedValue(2),
    countReviewsSinceFlikker: jest.fn().mockResolvedValue(20),
    getBenefitIssuanceStats: jest.fn().mockResolvedValue([
      { source: 'REWARD_GOAL', issued: 10, redeemed: 6 },
      { source: 'PROMOTION', issued: 4, redeemed: 0 },
    ]),
  };
  return {
    prisma,
    loyalty,
    rewardProgram,
    reactivationFunnel,
    benefits,
    insightsRepository,
  };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new BusinessImpactService(
    deps.prisma as never,
    deps.loyalty as never,
    deps.rewardProgram as never,
    deps.reactivationFunnel as never,
    deps.benefits as never,
    deps.insightsRepository as never,
  );
}

describe('BusinessImpactService.getImpact', () => {
  it('usa onboardingCompletedAt como ancla de "sinceFlikker" cuando existe', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const impact = await service.getImpact('biz-1', NOW);

    expect(impact.sinceFlikker.anchor).toBe('onboarding');
    expect(impact.sinceFlikker.windowStart).toEqual(ONBOARDING_COMPLETED_AT);
    expect(
      deps.insightsRepository.countNewCustomersInRange,
    ).toHaveBeenCalledWith('biz-1', ONBOARDING_COMPLETED_AT, NOW);
  });

  it('cae a createdAt cuando el negocio nunca completó onboarding', async () => {
    const deps = makeDeps();
    const createdAt = new Date('2026-07-01T00:00:00.000Z');
    deps.prisma.business.findUnique.mockResolvedValue({
      onboardingCompletedAt: null,
      createdAt,
    });
    const service = makeService(deps);

    const impact = await service.getImpact('biz-1', NOW);

    expect(impact.sinceFlikker.anchor).toBe('created');
    expect(impact.sinceFlikker.windowStart).toEqual(createdAt);
  });

  it('lifetime.benefitsRedeemed viene del método canónico BenefitsRepository.countRedeemed, nunca de una suma propia', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const impact = await service.getImpact('biz-1', NOW);

    expect(deps.benefits.countRedeemed).toHaveBeenCalledWith('biz-1');
    expect(impact.lifetime.benefitsRedeemed).toBe(6);
  });

  it('lifetime.benefitsIssued suma getBenefitIssuanceStats sin recalcular la regla de negocio', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const impact = await service.getImpact('biz-1', NOW);

    expect(impact.lifetime.benefitsIssued).toBe(14); // 10 + 4
  });

  it('lifetime.cardsInProgress y customersIdentified/Returned vienen de los read-models ya existentes', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const impact = await service.getImpact('biz-1', NOW);

    expect(impact.lifetime.cardsInProgress).toBe(12);
    expect(impact.lifetime.customersIdentified).toBe(71);
    expect(impact.lifetime.customersReturned).toBe(18);
    expect(impact.lifetime.customersReturnedAfterContact).toBe(4);
    expect(impact.lifetime.reviewsSinceFlikker).toBe(20);
  });

  it('hasEnoughRetentionEvidence refleja el evidenceState real del funnel, sin un umbral propio', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const insufficient = await service.getImpact('biz-1', NOW);
    expect(insufficient.hasEnoughRetentionEvidence).toBe(false);

    deps.reactivationFunnel.forBusiness.mockResolvedValue(
      emptyFunnel({ returned: 4, evidenceState: 'ENOUGH_DATA' }),
    );
    const enough = await service.getImpact('biz-1', NOW);
    expect(enough.hasEnoughRetentionEvidence).toBe(true);
  });

  it('last30Days usa exactamente los últimos 30 días terminando ahora', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.getImpact('biz-1', NOW);

    const expectedFrom = new Date(NOW.getTime() - 30 * 86_400_000);
    expect(
      deps.insightsRepository.countNewCustomersInRange,
    ).toHaveBeenCalledWith('biz-1', expectedFrom, NOW);
    expect(deps.benefits.countRedeemed).toHaveBeenCalledWith('biz-1', {
      from: expectedFrom,
    });
  });
});
