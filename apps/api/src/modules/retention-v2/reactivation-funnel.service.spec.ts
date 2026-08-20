import { RetentionStrategyType } from '@prisma/client';
import { ReactivationFunnelService } from './reactivation-funnel.service';

function makePrisma(
  assignments: {
    strategyType: RetentionStrategyType;
    outcome: { returned: boolean; daysToReturn: number | null } | null;
  }[],
  minimumSampleSizeForRecommendations = 1,
) {
  return {
    retentionSettings: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ minimumSampleSizeForRecommendations }),
    },
    retentionAssignment: {
      findMany: jest.fn().mockResolvedValue(
        assignments.map((a) => ({
          variant: { strategyType: a.strategyType },
          outcome: a.outcome,
        })),
      ),
    },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new ReactivationFunnelService(prisma as never);
}

describe('ReactivationFunnelService — query scoping', () => {
  it('only queries assignments already filtered to EXPOSED_STATUSES, recovery objectives, and non-CONTROL — the where clause the DB enforces', async () => {
    const prisma = makePrisma([]);
    const service = makeService(prisma);

    await service.forBusiness('biz-1');

    expect(prisma.retentionAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: 'biz-1',
          status: { in: ['OBSERVING', 'SENT'] },
          experiment: {
            objective: {
              in: ['SECOND_VISIT', 'AT_RISK_RECOVERY', 'INACTIVE_RECOVERY'],
            },
          },
          variant: { strategyType: { not: 'CONTROL' } },
        }),
      }),
    );
  });

  it('requires the real Message state to actually have left the building — queued/sending/failed never count as contacted', async () => {
    // `RetentionAssignment.status` es intention-to-treat (se fija en SENT al
    // crear el Message, nunca se sincroniza con el resultado real del
    // dispatch — ver exposure.ts). Este KPI necesita algo más estricto: el
    // filtro real vive en la relación `message`, no en `status`.
    const prisma = makePrisma([]);
    const service = makeService(prisma);

    await service.forBusiness('biz-1');

    expect(prisma.retentionAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          message: { status: { in: ['sent', 'delivered', 'read'] } },
        }),
      }),
    );
  });
});

describe('ReactivationFunnelService — aggregation', () => {
  it('counts contacted/returned overall and splits reminder-only vs with-benefit', async () => {
    const prisma = makePrisma([
      {
        strategyType: RetentionStrategyType.REMINDER,
        outcome: { returned: true, daysToReturn: 3 },
      },
      { strategyType: RetentionStrategyType.REMINDER, outcome: null }, // still pending
      {
        strategyType: RetentionStrategyType.SOFT_BENEFIT,
        outcome: { returned: true, daysToReturn: 5 },
      },
      {
        strategyType: RetentionStrategyType.STRONG_BENEFIT,
        outcome: { returned: false, daysToReturn: null },
      },
    ]);
    const service = makeService(prisma);

    const result = await service.forBusiness('biz-1');

    expect(result.overall).toMatchObject({ contacted: 4, returned: 2 });
    expect(result.byArm).not.toBeNull();
    expect(result.byArm?.reminderOnly).toMatchObject({
      contacted: 2,
      returned: 1,
      averageDaysToReturn: 3,
    });
    expect(result.byArm?.withBenefit).toMatchObject({
      contacted: 2,
      returned: 1,
      averageDaysToReturn: 5,
    });
  });

  it('falls back to the default minimum sample size when RetentionSettings has none', async () => {
    const prisma = makePrisma([]);
    prisma.retentionSettings.findUnique.mockResolvedValue(null);
    const service = makeService(prisma);

    const result = await service.forBusiness('biz-1');

    expect(result.overall.evidenceState).toBe('INSUFFICIENT_DATA');
  });
});
