import { BenefitType, Prisma } from '@prisma/client';
import { IncentiveIssuerService } from './incentive-issuer.service';
import { RetentionBudgetService } from './retention-budget.service';

const NOW = new Date('2026-09-01T12:00:00.000Z'); // Tuesday, Montevideo local

// A generous, always-safe budget for tests that are not about the budget
// itself — nothing here is meant to hit either cap.
const PERMISSIVE_SETTINGS = {
  maxAutomatedIncentivesPerMonth: 1000,
  maxEstimatedIncentiveCostPerMonth: null,
};

function definition(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inc-1',
    name: '10% OFF',
    description: 'Descuento de bienvenida',
    conditions: 'No acumulable',
    type: BenefitType.discount,
    expiresInDays: 7,
    active: true,
    automationEligible: true,
    maxRedemptionsPerCustomer: null,
    maxTotalRedemptions: null,
    validDays: [],
    estimatedCost: null,
    ...overrides,
  };
}

function assignmentFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'assign-1',
    businessId: 'biz-1',
    customerId: 'cust-1',
    benefitParticipationId: null,
    business: {
      timezone: 'America/Montevideo',
      retentionSettings: PERMISSIVE_SETTINGS,
    },
    variant: {
      id: 'var-1',
      issuedBenefitId: null,
      incentiveDefinition: definition(),
    },
    ...overrides,
  };
}

function makePrisma(
  options: {
    assignment?: unknown;
    participationsThisMonth?: unknown[];
  } = {},
) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    benefitParticipation: {
      findMany: jest
        .fn()
        .mockResolvedValue(options.participationsThisMonth ?? []),
      upsert: jest.fn().mockResolvedValue({
        id: 'part-1',
        redemptionCode: 'ABCD1234',
        expiresAt: new Date('2026-09-08T12:00:00.000Z'),
      }),
    },
    retentionAssignment: { update: jest.fn().mockResolvedValue({}) },
  };

  const assignment =
    options.assignment === undefined ? assignmentFixture() : options.assignment;

  return {
    retentionAssignment: {
      findUnique: jest.fn().mockResolvedValue(assignment),
      update: jest.fn(),
    },
    retentionVariant: { update: jest.fn().mockResolvedValue({}) },
    benefit: { create: jest.fn().mockResolvedValue({ id: 'benefit-1' }) },
    benefitParticipation: { count: jest.fn().mockResolvedValue(0) },
    $transaction: jest.fn((cb: (t: typeof tx) => unknown): unknown =>
      cb(tx),
    ) as jest.Mock,
    tx,
  };
}

// Default "nunca bloqueado" — el gate de trial de Beneficios tiene su propio
// describe block más abajo.
function makePlans(overrides: { isBenefitsBlocked?: boolean } = {}) {
  return {
    isBenefitsBlocked: jest
      .fn()
      .mockResolvedValue(overrides.isBenefitsBlocked ?? false),
  };
}

function makeService(
  prisma: ReturnType<typeof makePrisma>,
  plans: ReturnType<typeof makePlans> = makePlans(),
) {
  return new IncentiveIssuerService(
    prisma as never,
    new RetentionBudgetService(prisma as never),
    plans as never,
  );
}

describe('IncentiveIssuerService — reuses the existing benefit system', () => {
  it('creates the carrier Benefit as INACTIVE so the QR single-active slot stays free', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);

    await service.issueForAssignment('assign-1', NOW);

    const data = (
      prisma.benefit.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      }
    ).data;
    expect(data.active).toBe(false);
    expect(data.businessId).toBe('biz-1');
    expect(data.title).toBe('10% OFF');
  });

  it('issues a BenefitParticipation with a code and a per-issue expiry', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);

    const result = await service.issueForAssignment('assign-1', NOW);

    expect(result.status).toBe('issued');
    if (result.status !== 'issued') throw new Error('expected issued');
    expect(result.code).toBe('ABCD1234');
    // 7 days after issuing, not a window shared by everyone.
    expect(result.expiresAt).toEqual(new Date('2026-09-08T12:00:00.000Z'));
  });

  it('links the reward to the assignment, which is what makes retries safe', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);

    await service.issueForAssignment('assign-1', NOW);

    expect(prisma.tx.retentionAssignment.update).toHaveBeenCalledWith({
      where: { id: 'assign-1' },
      data: { benefitParticipationId: 'part-1' },
    });
  });

  it('never issues twice for the same assignment', async () => {
    const prisma = makePrisma({
      assignment: assignmentFixture({
        benefitParticipationId: 'part-existing',
      }),
    });
    const service = makeService(prisma);

    const result = await service.issueForAssignment('assign-1', NOW);

    expect(result).toEqual({
      status: 'already_issued',
      participationId: 'part-existing',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.benefit.create).not.toHaveBeenCalled();
  });

  it('recovers from a concurrent duplicate (P2002) instead of failing', async () => {
    const prisma = makePrisma();
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    prisma.retentionAssignment.findUnique
      .mockResolvedValueOnce(assignmentFixture())
      .mockResolvedValueOnce({ benefitParticipationId: 'part-raced' });
    const service = makeService(prisma);

    const result = await service.issueForAssignment('assign-1', NOW);

    expect(result).toEqual({
      status: 'already_issued',
      participationId: 'part-raced',
    });
  });

  it('reuses the variant’s carrier Benefit once it exists', async () => {
    const prisma = makePrisma({
      assignment: assignmentFixture({
        id: 'assign-2',
        customerId: 'cust-2',
        variant: {
          id: 'var-1',
          issuedBenefitId: 'benefit-1',
          incentiveDefinition: definition(),
        },
      }),
    });
    const service = makeService(prisma);

    await service.issueForAssignment('assign-2', NOW);

    expect(prisma.benefit.create).not.toHaveBeenCalled();
  });
});

describe('IncentiveIssuerService — authorization is re-checked at issue time', () => {
  it('refuses an incentive the owner deactivated', async () => {
    const prisma = makePrisma({
      assignment: assignmentFixture({
        variant: {
          id: 'var-1',
          issuedBenefitId: null,
          incentiveDefinition: definition({ active: false }),
        },
      }),
    });
    const service = makeService(prisma);

    expect(await service.issueForAssignment('assign-1', NOW)).toEqual({
      status: 'skipped',
      reason: 'NOT_AUTHORIZED',
    });
  });

  it('refuses an incentive not authorized for automation', async () => {
    const prisma = makePrisma({
      assignment: assignmentFixture({
        variant: {
          id: 'var-1',
          issuedBenefitId: null,
          incentiveDefinition: definition({ automationEligible: false }),
        },
      }),
    });
    const service = makeService(prisma);

    expect(await service.issueForAssignment('assign-1', NOW)).toEqual({
      status: 'skipped',
      reason: 'NOT_AUTHORIZED',
    });
  });

  it('refuses a NEW issue once el trial de Beneficios venció (sin Pro)', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma, makePlans({ isBenefitsBlocked: true }));

    expect(await service.issueForAssignment('assign-1', NOW)).toEqual({
      status: 'skipped',
      reason: 'NOT_AUTHORIZED',
    });
    expect(prisma.tx.benefitParticipation.upsert).not.toHaveBeenCalled();
  });

  it('un assignment YA emitido antes del vencimiento nunca se toca — sigue "already_issued"', async () => {
    const prisma = makePrisma({
      assignment: assignmentFixture({ benefitParticipationId: 'part-old' }),
    });
    const service = makeService(prisma, makePlans({ isBenefitsBlocked: true }));

    expect(await service.issueForAssignment('assign-1', NOW)).toEqual({
      status: 'already_issued',
      participationId: 'part-old',
    });
  });

  it('refuses when the variant carries no incentive at all', async () => {
    const prisma = makePrisma({
      assignment: assignmentFixture({
        variant: {
          id: 'var-1',
          issuedBenefitId: null,
          incentiveDefinition: null,
        },
      }),
    });
    const service = makeService(prisma);

    expect(await service.issueForAssignment('assign-1', NOW)).toEqual({
      status: 'skipped',
      reason: 'NOT_AUTHORIZED',
    });
  });

  it('respects the total redemption cap', async () => {
    const prisma = makePrisma({
      assignment: assignmentFixture({
        variant: {
          id: 'var-1',
          issuedBenefitId: 'benefit-1',
          incentiveDefinition: definition({ maxTotalRedemptions: 50 }),
        },
      }),
    });
    prisma.benefitParticipation.count.mockResolvedValue(50);
    const service = makeService(prisma);

    expect(await service.issueForAssignment('assign-1', NOW)).toEqual({
      status: 'skipped',
      reason: 'LIMIT_REACHED',
    });
  });

  it('respects the per-customer cap', async () => {
    const prisma = makePrisma({
      assignment: assignmentFixture({
        variant: {
          id: 'var-1',
          issuedBenefitId: 'benefit-1',
          incentiveDefinition: definition({ maxRedemptionsPerCustomer: 1 }),
        },
      }),
    });
    prisma.benefitParticipation.count.mockResolvedValue(1);
    const service = makeService(prisma);

    expect(await service.issueForAssignment('assign-1', NOW)).toEqual({
      status: 'skipped',
      reason: 'LIMIT_REACHED',
    });
  });

  it('refuses to issue on a weekday the incentive does not allow', async () => {
    // NOW is a Tuesday (2026-09-01) in Montevideo; the incentive is weekend-only.
    const prisma = makePrisma({
      assignment: assignmentFixture({
        variant: {
          id: 'var-1',
          issuedBenefitId: 'benefit-1',
          incentiveDefinition: definition({ validDays: [6, 7] }),
        },
      }),
    });
    const service = makeService(prisma);

    expect(await service.issueForAssignment('assign-1', NOW)).toEqual({
      status: 'skipped',
      reason: 'NOT_VALID_TODAY',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('issues on a weekday the incentive allows', async () => {
    const prisma = makePrisma({
      assignment: assignmentFixture({
        variant: {
          id: 'var-1',
          issuedBenefitId: 'benefit-1',
          incentiveDefinition: definition({ validDays: [2] }), // Tuesday
        },
      }),
    });
    const service = makeService(prisma);

    expect((await service.issueForAssignment('assign-1', NOW)).status).toBe(
      'issued',
    );
  });

  it('skips a nonexistent assignment instead of throwing', async () => {
    const prisma = makePrisma({ assignment: null });
    const service = makeService(prisma);

    expect(await service.issueForAssignment('ghost', NOW)).toEqual({
      status: 'skipped',
      reason: 'NOT_AUTHORIZED',
    });
  });
});

describe('IncentiveIssuerService — monthly budget caps (Fase C.5)', () => {
  it('takes the advisory lock before checking or writing anything', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);

    await service.issueForAssignment('assign-1', NOW);

    const lockCallOrder = prisma.tx.$executeRaw.mock.invocationCallOrder[0];
    const findManyCallOrder =
      prisma.tx.benefitParticipation.findMany.mock.invocationCallOrder[0];
    const upsertCallOrder =
      prisma.tx.benefitParticipation.upsert.mock.invocationCallOrder[0];
    expect(lockCallOrder).toBeLessThan(findManyCallOrder);
    expect(findManyCallOrder).toBeLessThan(upsertCallOrder);
  });

  it('refuses to issue when the owner never configured either cap', async () => {
    const prisma = makePrisma({
      assignment: assignmentFixture({
        business: {
          timezone: 'America/Montevideo',
          retentionSettings: {
            maxAutomatedIncentivesPerMonth: null,
            maxEstimatedIncentiveCostPerMonth: null,
          },
        },
      }),
    });
    const service = makeService(prisma);

    expect(await service.issueForAssignment('assign-1', NOW)).toEqual({
      status: 'skipped',
      reason: 'MONTHLY_INCENTIVE_LIMIT',
    });
    expect(prisma.tx.benefitParticipation.upsert).not.toHaveBeenCalled();
  });

  it('refuses when a business with no RetentionSettings row at all requests an incentive', async () => {
    // getOrCreate always creates a default row for reads through
    // RetentionSettingsService, but the issuer reads through the assignment's
    // include, which can legitimately be null before that ever runs.
    const prisma = makePrisma({
      assignment: assignmentFixture({
        business: { timezone: 'America/Montevideo', retentionSettings: null },
      }),
    });
    const service = makeService(prisma);

    expect(await service.issueForAssignment('assign-1', NOW)).toEqual({
      status: 'skipped',
      reason: 'MONTHLY_INCENTIVE_LIMIT',
    });
  });

  it('refuses once the monthly count cap is reached', async () => {
    const prisma = makePrisma({
      assignment: assignmentFixture({
        business: {
          timezone: 'America/Montevideo',
          retentionSettings: {
            maxAutomatedIncentivesPerMonth: 2,
            maxEstimatedIncentiveCostPerMonth: null,
          },
        },
      }),
      participationsThisMonth: [
        {
          createdAt: NOW,
          retentionAssignment: {
            variant: { incentiveDefinition: definition() },
          },
        },
        {
          createdAt: NOW,
          retentionAssignment: {
            variant: { incentiveDefinition: definition() },
          },
        },
      ],
    });
    const service = makeService(prisma);

    expect(await service.issueForAssignment('assign-1', NOW)).toEqual({
      status: 'skipped',
      reason: 'MONTHLY_INCENTIVE_LIMIT',
    });
  });

  it('allows issuing while strictly under the monthly count cap', async () => {
    const prisma = makePrisma({
      assignment: assignmentFixture({
        business: {
          timezone: 'America/Montevideo',
          retentionSettings: {
            maxAutomatedIncentivesPerMonth: 2,
            maxEstimatedIncentiveCostPerMonth: null,
          },
        },
      }),
      participationsThisMonth: [
        {
          createdAt: NOW,
          retentionAssignment: {
            variant: { incentiveDefinition: definition() },
          },
        },
      ],
    });
    const service = makeService(prisma);

    expect((await service.issueForAssignment('assign-1', NOW)).status).toBe(
      'issued',
    );
  });

  it('refuses once the monthly cost cap would be exceeded', async () => {
    const prisma = makePrisma({
      assignment: assignmentFixture({
        business: {
          timezone: 'America/Montevideo',
          retentionSettings: {
            maxAutomatedIncentivesPerMonth: null,
            maxEstimatedIncentiveCostPerMonth: new Prisma.Decimal(100),
          },
        },
        variant: {
          id: 'var-1',
          issuedBenefitId: 'benefit-1',
          incentiveDefinition: definition({
            estimatedCost: new Prisma.Decimal(20),
          }),
        },
      }),
      participationsThisMonth: [
        {
          createdAt: NOW,
          retentionAssignment: {
            variant: {
              incentiveDefinition: definition({
                estimatedCost: new Prisma.Decimal(90),
              }),
            },
          },
        },
      ],
    });
    const service = makeService(prisma);

    // 90 already spent + 20 for this one = 110 > 100.
    expect(await service.issueForAssignment('assign-1', NOW)).toEqual({
      status: 'skipped',
      reason: 'MONTHLY_BUDGET_LIMIT',
    });
  });

  it('allows issuing while strictly under the monthly cost cap', async () => {
    const prisma = makePrisma({
      assignment: assignmentFixture({
        business: {
          timezone: 'America/Montevideo',
          retentionSettings: {
            maxAutomatedIncentivesPerMonth: null,
            maxEstimatedIncentiveCostPerMonth: new Prisma.Decimal(100),
          },
        },
        variant: {
          id: 'var-1',
          issuedBenefitId: 'benefit-1',
          incentiveDefinition: definition({
            estimatedCost: new Prisma.Decimal(20),
          }),
        },
      }),
      participationsThisMonth: [
        {
          createdAt: NOW,
          retentionAssignment: {
            variant: {
              incentiveDefinition: definition({
                estimatedCost: new Prisma.Decimal(50),
              }),
            },
          },
        },
      ],
    });
    const service = makeService(prisma);

    expect((await service.issueForAssignment('assign-1', NOW)).status).toBe(
      'issued',
    );
  });

  it('does not carry a percentage-only incentive’s cost into the cost cap', async () => {
    // No estimatedCost declared and no average ticket lookup here: it counts
    // toward the count cap but contributes 0 to the cost cap, by design.
    const prisma = makePrisma({
      assignment: assignmentFixture({
        business: {
          timezone: 'America/Montevideo',
          retentionSettings: {
            maxAutomatedIncentivesPerMonth: null,
            maxEstimatedIncentiveCostPerMonth: new Prisma.Decimal(10),
          },
        },
        variant: {
          id: 'var-1',
          issuedBenefitId: 'benefit-1',
          incentiveDefinition: definition({ estimatedCost: null }),
        },
      }),
      participationsThisMonth: [
        {
          createdAt: NOW,
          retentionAssignment: {
            variant: {
              incentiveDefinition: definition({ estimatedCost: null }),
            },
          },
        },
      ],
    });
    const service = makeService(prisma);

    expect((await service.issueForAssignment('assign-1', NOW)).status).toBe(
      'issued',
    );
  });

  it('only counts participations from the current local calendar month', async () => {
    const prisma = makePrisma({
      assignment: assignmentFixture({
        business: {
          timezone: 'America/Montevideo',
          retentionSettings: {
            maxAutomatedIncentivesPerMonth: 1,
            maxEstimatedIncentiveCostPerMonth: null,
          },
        },
      }),
      participationsThisMonth: [
        // 2026-09-01T02:00 UTC is 2026-08-31 23:00 local — August, not
        // September, even though it is inside the naive 35-day DB window.
        {
          createdAt: new Date('2026-09-01T02:00:00.000Z'),
          retentionAssignment: {
            variant: { incentiveDefinition: definition() },
          },
        },
      ],
    });
    const service = makeService(prisma);

    // Cap is 1 per month; the one prior participation belongs to August, so
    // September still has room for this one.
    expect((await service.issueForAssignment('assign-1', NOW)).status).toBe(
      'issued',
    );
  });

  it('evaluates the month in the business timezone, not UTC', async () => {
    // NOW itself is right at a UTC/local month boundary: 2026-10-01T01:00 UTC
    // is 2026-09-30T22:00 local — still September locally.
    const nowAtBoundary = new Date('2026-10-01T01:00:00.000Z');
    const prisma = makePrisma({
      assignment: assignmentFixture({
        business: {
          timezone: 'America/Montevideo',
          retentionSettings: {
            maxAutomatedIncentivesPerMonth: 1,
            maxEstimatedIncentiveCostPerMonth: null,
          },
        },
      }),
      participationsThisMonth: [
        // Issued earlier the same local day (September 30th local).
        {
          createdAt: new Date('2026-09-30T14:00:00.000Z'),
          retentionAssignment: {
            variant: { incentiveDefinition: definition() },
          },
        },
      ],
    });
    const service = makeService(prisma);

    expect(await service.issueForAssignment('assign-1', nowAtBoundary)).toEqual(
      { status: 'skipped', reason: 'MONTHLY_INCENTIVE_LIMIT' },
    );
  });
});

describe('IncentiveIssuerService — percentage cost estimation (Fase D §19)', () => {
  it('a percentage incentive with no estimatedCost now counts toward the cost cap', async () => {
    const prisma = makePrisma({
      assignment: assignmentFixture({
        business: {
          timezone: 'America/Montevideo',
          retentionSettings: {
            maxAutomatedIncentivesPerMonth: null,
            maxEstimatedIncentiveCostPerMonth: new Prisma.Decimal(40),
            averageTicketAmount: new Prisma.Decimal(500),
          },
        },
        variant: {
          id: 'var-1',
          issuedBenefitId: 'benefit-1',
          // 10% of a $500 ticket = $50, which alone already exceeds the $40 cap.
          incentiveDefinition: definition({
            percentageValue: 10,
            estimatedCost: null,
          }),
        },
      }),
    });
    const service = makeService(prisma);

    expect(await service.issueForAssignment('assign-1', NOW)).toEqual({
      status: 'skipped',
      reason: 'MONTHLY_BUDGET_LIMIT',
    });
  });

  it('the same percentage incentive is allowed once the cap covers the estimate', async () => {
    const prisma = makePrisma({
      assignment: assignmentFixture({
        business: {
          timezone: 'America/Montevideo',
          retentionSettings: {
            maxAutomatedIncentivesPerMonth: null,
            maxEstimatedIncentiveCostPerMonth: new Prisma.Decimal(100),
            averageTicketAmount: new Prisma.Decimal(500),
          },
        },
        variant: {
          id: 'var-1',
          issuedBenefitId: 'benefit-1',
          incentiveDefinition: definition({
            percentageValue: 10,
            estimatedCost: null,
          }),
        },
      }),
    });
    const service = makeService(prisma);

    expect((await service.issueForAssignment('assign-1', NOW)).status).toBe(
      'issued',
    );
  });

  it('without an average ticket, a percentage incentive still cannot be cost-estimated — count cap is what protects it', async () => {
    const prisma = makePrisma({
      assignment: assignmentFixture({
        business: {
          timezone: 'America/Montevideo',
          retentionSettings: {
            maxAutomatedIncentivesPerMonth: null,
            maxEstimatedIncentiveCostPerMonth: new Prisma.Decimal(1),
            averageTicketAmount: null,
          },
        },
        variant: {
          id: 'var-1',
          issuedBenefitId: 'benefit-1',
          incentiveDefinition: definition({
            percentageValue: 10,
            estimatedCost: null,
          }),
        },
      }),
    });
    const service = makeService(prisma);

    // Estimated cost contributes 0 (unknown), so even a $1 cap does not block it.
    expect((await service.issueForAssignment('assign-1', NOW)).status).toBe(
      'issued',
    );
  });
});
