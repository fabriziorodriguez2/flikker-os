import { RetentionBudgetService } from './retention-budget.service';

const NOW = new Date('2026-09-15T12:00:00.000Z');

function makeService(participations: unknown[] = []) {
  const prisma = {
    benefitParticipation: {
      findMany: jest.fn().mockResolvedValue(participations),
    },
  };
  return new RetentionBudgetService(prisma as never);
}

describe('RetentionBudgetService.headroom — Fase G §14: advisory, read-only', () => {
  it('reports near-limit when neither cap is configured (deny-by-default already blocks issuance)', async () => {
    const service = makeService();
    const result = await service.headroom({
      businessId: 'biz-1',
      timezone: 'America/Montevideo',
      now: NOW,
      caps: {
        maxAutomatedIncentivesPerMonth: null,
        maxEstimatedIncentiveCostPerMonth: null,
      },
      averageTicketAmount: 1000,
      incentiveActive: true,
    });
    expect(result).toEqual({ nearLimit: true, reasonCode: 'NOT_CONFIGURED' });
  });

  it('reports near-limit when the incentive itself is inactive', async () => {
    const service = makeService();
    const result = await service.headroom({
      businessId: 'biz-1',
      timezone: 'America/Montevideo',
      now: NOW,
      caps: {
        maxAutomatedIncentivesPerMonth: 100,
        maxEstimatedIncentiveCostPerMonth: null,
      },
      averageTicketAmount: 1000,
      incentiveActive: false,
    });
    expect(result).toEqual({
      nearLimit: true,
      reasonCode: 'INCENTIVE_INACTIVE',
    });
  });

  it('reports plenty of headroom well under both caps', async () => {
    const service = makeService([]);
    const result = await service.headroom({
      businessId: 'biz-1',
      timezone: 'America/Montevideo',
      now: NOW,
      caps: {
        maxAutomatedIncentivesPerMonth: 100,
        maxEstimatedIncentiveCostPerMonth: 10_000,
      },
      averageTicketAmount: 1000,
      incentiveActive: true,
    });
    expect(result).toEqual({ nearLimit: false, reasonCode: null });
  });

  it('reports near the count limit once 80% of the monthly count cap is used', async () => {
    const participations = Array.from({ length: 81 }, () => ({
      createdAt: NOW,
      retentionAssignment: {
        variant: {
          incentiveDefinition: {
            estimatedCost: null,
            percentageValue: null,
            fixedValue: null,
          },
        },
      },
    }));
    const service = makeService(participations);
    const result = await service.headroom({
      businessId: 'biz-1',
      timezone: 'America/Montevideo',
      now: NOW,
      caps: {
        maxAutomatedIncentivesPerMonth: 100,
        maxEstimatedIncentiveCostPerMonth: null,
      },
      averageTicketAmount: 1000,
      incentiveActive: true,
    });
    expect(result).toEqual({ nearLimit: true, reasonCode: 'NEAR_COUNT_LIMIT' });
  });

  it('reports near the cost limit once 80% of the monthly cost cap is spent', async () => {
    const participations = [
      {
        createdAt: NOW,
        retentionAssignment: {
          variant: {
            incentiveDefinition: {
              estimatedCost: 850,
              percentageValue: null,
              fixedValue: null,
            },
          },
        },
      },
    ];
    const service = makeService(participations);
    const result = await service.headroom({
      businessId: 'biz-1',
      timezone: 'America/Montevideo',
      now: NOW,
      caps: {
        maxAutomatedIncentivesPerMonth: null,
        maxEstimatedIncentiveCostPerMonth: 1000,
      },
      averageTicketAmount: 1000,
      incentiveActive: true,
    });
    expect(result).toEqual({ nearLimit: true, reasonCode: 'NEAR_COST_LIMIT' });
  });
});
