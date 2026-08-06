import {
  ExperienceVersion,
  RetentionAssignmentStatus,
  VisitAttributionType,
} from '@prisma/client';
import { RetentionOutcomeService } from './retention-outcome.service';

const NOW = new Date('2026-09-10T12:00:00.000Z');

function assignmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'assign-1',
    businessId: 'biz-1',
    experimentId: 'exp-1',
    variantId: 'var-1',
    customerId: 'cust-1',
    exposedAt: new Date('2026-09-01T12:00:00.000Z'),
    benefitParticipationId: null,
    experiment: { attributionWindowDays: 7 },
    benefitParticipation: null,
    ...overrides,
  };
}

function makePrisma(
  options: {
    dueAssignments?: unknown[];
    visit?: unknown;
    existingOutcome?: unknown;
  } = {},
) {
  return {
    retentionAssignment: {
      findMany: jest
        .fn()
        .mockResolvedValue(options.dueAssignments ?? [assignmentRow()]),
    },
    visit: {
      findFirst: jest.fn().mockResolvedValue(options.visit ?? null),
    },
    retentionOutcome: {
      findUnique: jest.fn().mockResolvedValue(options.existingOutcome ?? null),
      upsert: jest.fn().mockResolvedValue({ id: 'outcome-1' }),
    },
  };
}

function makeDecisions() {
  return { record: jest.fn().mockResolvedValue(undefined) };
}

describe('RetentionOutcomeService — assignment selection', () => {
  it('only sweeps businesses this engine owns', async () => {
    const prisma = makePrisma();
    const decisions = makeDecisions();
    const service = new RetentionOutcomeService(
      prisma as never,
      decisions as never,
    );

    await service.runOnce(NOW);

    expect(prisma.retentionAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: [
              RetentionAssignmentStatus.OBSERVING,
              RetentionAssignmentStatus.SENT,
            ],
          },
          exposedAt: { not: null },
          business: {
            isActive: true,
            experienceVersion: ExperienceVersion.CHECKIN_V2,
            retentionEngineV2Enabled: true,
          },
        }),
      }),
    );
  });
});

describe('RetentionOutcomeService — detecting a return', () => {
  it('writes returned=true for the first qualifying visit and logs OUTCOME_RETURNED', async () => {
    const visit = {
      id: 'visit-1',
      occurredAt: new Date('2026-09-03T12:00:00.000Z'),
      attributionType: VisitAttributionType.organic,
    };
    const prisma = makePrisma({ visit });
    const decisions = makeDecisions();
    const service = new RetentionOutcomeService(
      prisma as never,
      decisions as never,
    );

    const result = await service.runOnce(NOW);

    expect(result.returned).toBe(1);
    expect(prisma.retentionOutcome.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { assignmentId: 'assign-1' },
        create: expect.objectContaining({
          returned: true,
          returnVisitId: 'visit-1',
        }),
      }),
    );
    expect(decisions.record).toHaveBeenCalledWith(
      expect.objectContaining({ decisionCode: 'OUTCOME_RETURNED' }),
    );
  });

  it('CONTROL is measured exactly the same way as any exposed variant', async () => {
    const visit = {
      id: 'visit-1',
      occurredAt: new Date('2026-09-03T12:00:00.000Z'),
      attributionType: VisitAttributionType.organic,
    };
    const prisma = makePrisma({
      dueAssignments: [assignmentRow({ variantId: 'var-control' })],
      visit,
    });
    const decisions = makeDecisions();
    const service = new RetentionOutcomeService(
      prisma as never,
      decisions as never,
    );

    const result = await service.runOnce(NOW);

    expect(result.returned).toBe(1);
  });

  it('confirms via redemption and logs OUTCOME_CONFIRMED instead of OUTCOME_RETURNED', async () => {
    const visit = {
      id: 'visit-1',
      occurredAt: new Date('2026-09-03T12:00:00.000Z'),
      attributionType: VisitAttributionType.post_campaign_checkin,
    };
    const prisma = makePrisma({
      dueAssignments: [
        assignmentRow({
          benefitParticipationId: 'part-1',
          benefitParticipation: {
            redeemedAt: new Date('2026-09-03T13:00:00.000Z'),
          },
        }),
      ],
      visit,
    });
    const decisions = makeDecisions();
    const service = new RetentionOutcomeService(
      prisma as never,
      decisions as never,
    );

    const result = await service.runOnce(NOW);

    expect(result.confirmed).toBe(1);
    expect(decisions.record).toHaveBeenCalledWith(
      expect.objectContaining({ decisionCode: 'OUTCOME_CONFIRMED' }),
    );
  });

  it('does not confirm on a redemption that happens after the observation window', async () => {
    const visit = {
      id: 'visit-1',
      occurredAt: new Date('2026-09-03T12:00:00.000Z'),
      attributionType: VisitAttributionType.post_campaign_checkin,
    };
    const prisma = makePrisma({
      dueAssignments: [
        assignmentRow({
          benefitParticipationId: 'part-1',
          // Redeemed well after NOW, which is itself already past the window.
          benefitParticipation: {
            redeemedAt: new Date('2026-09-20T00:00:00.000Z'),
          },
        }),
      ],
      visit,
    });
    const decisions = makeDecisions();
    const service = new RetentionOutcomeService(
      prisma as never,
      decisions as never,
    );

    const result = await service.runOnce(NOW);

    expect(result.returned).toBe(1);
    expect(result.confirmed).toBe(0);
  });
});

describe('RetentionOutcomeService — elevating an existing outcome', () => {
  it('upgrades an unconfirmed return once a redemption appears, and logs OUTCOME_CONFIRMED', async () => {
    const visit = {
      id: 'visit-1',
      occurredAt: new Date('2026-09-03T12:00:00.000Z'),
      attributionType: VisitAttributionType.post_campaign_checkin,
    };
    const prisma = makePrisma({
      dueAssignments: [
        assignmentRow({
          benefitParticipationId: 'part-1',
          benefitParticipation: {
            redeemedAt: new Date('2026-09-05T00:00:00.000Z'),
          },
        }),
      ],
      visit,
      existingOutcome: { confirmedByRedemption: false },
    });
    const decisions = makeDecisions();
    const service = new RetentionOutcomeService(
      prisma as never,
      decisions as never,
    );

    await service.runOnce(NOW);

    expect(prisma.retentionOutcome.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ confirmedByRedemption: true }),
      }),
    );
    expect(decisions.record).toHaveBeenCalledWith(
      expect.objectContaining({ decisionCode: 'OUTCOME_CONFIRMED' }),
    );
  });

  it('does not re-log an unconfirmed return that stays unconfirmed', async () => {
    const visit = {
      id: 'visit-1',
      occurredAt: new Date('2026-09-03T12:00:00.000Z'),
      attributionType: VisitAttributionType.organic,
    };
    const prisma = makePrisma({
      visit,
      existingOutcome: { confirmedByRedemption: false },
    });
    const decisions = makeDecisions();
    const service = new RetentionOutcomeService(
      prisma as never,
      decisions as never,
    );

    await service.runOnce(NOW);

    expect(decisions.record).not.toHaveBeenCalled();
  });
});

describe('RetentionOutcomeService — closing an expired window', () => {
  it('writes returned=false once the window has closed with no visit, and logs OUTCOME_WINDOW_CLOSED', async () => {
    const prisma = makePrisma({ visit: null });
    const decisions = makeDecisions();
    const service = new RetentionOutcomeService(
      prisma as never,
      decisions as never,
    );

    const result = await service.runOnce(NOW);

    expect(result.closedNoReturn).toBe(1);
    expect(prisma.retentionOutcome.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          returned: false,
          observedWithinWindow: false,
        }),
      }),
    );
    expect(decisions.record).toHaveBeenCalledWith(
      expect.objectContaining({ decisionCode: 'OUTCOME_WINDOW_CLOSED' }),
    );
  });

  it('never re-opens a closed outcome — findDueAssignments would not select it again', async () => {
    // This is really a contract test on the query itself: a `returned: false`
    // outcome is excluded from both OR branches (`outcome: null` and
    // `outcome: { returned: true, ... }`), so it can never be reprocessed.
    const prisma = makePrisma();
    const decisions = makeDecisions();
    const service = new RetentionOutcomeService(
      prisma as never,
      decisions as never,
    );

    await service.runOnce(NOW);

    const where = prisma.retentionAssignment.findMany.mock.calls[0][0]
      .where as {
      OR: unknown[];
    };
    expect(where.OR).toEqual([
      { outcome: null },
      expect.objectContaining({
        outcome: { returned: true, confirmedByRedemption: false },
      }),
    ]);
  });

  it('leaves an assignment untouched while its window is still open', async () => {
    const prisma = makePrisma({
      dueAssignments: [
        assignmentRow({ exposedAt: new Date('2026-09-09T00:00:00.000Z') }), // 1 day old, 7-day window
      ],
      visit: null,
    });
    const decisions = makeDecisions();
    const service = new RetentionOutcomeService(
      prisma as never,
      decisions as never,
    );

    const result = await service.runOnce(NOW);

    expect(result.stillOpen).toBe(1);
    expect(prisma.retentionOutcome.upsert).not.toHaveBeenCalled();
    expect(decisions.record).not.toHaveBeenCalled();
  });
});

describe('RetentionOutcomeService — experiment lifecycle (Fase D §27/§28)', () => {
  it('keeps measuring already-exposed assignments after the experiment is COMPLETED', async () => {
    // The selection query never looks at experiment.status at all — it only
    // cares whether the assignment itself was exposed. Recruitment (which
    // does check status) is what actually stops for COMPLETED/PAUSED.
    const visit = {
      id: 'visit-1',
      occurredAt: new Date('2026-09-03T12:00:00.000Z'),
      attributionType: VisitAttributionType.organic,
    };
    const prisma = makePrisma({ visit });
    const decisions = makeDecisions();
    const service = new RetentionOutcomeService(
      prisma as never,
      decisions as never,
    );

    const result = await service.runOnce(NOW);

    expect(result.returned).toBe(1);
    const where = prisma.retentionAssignment.findMany.mock.calls[0][0]
      .where as Record<string, unknown>;
    expect(where).not.toHaveProperty('experiment');
  });
});

describe('RetentionOutcomeService — resilience', () => {
  it('keeps processing other assignments when one throws', async () => {
    const prisma = makePrisma({
      dueAssignments: [
        assignmentRow({ id: 'assign-bad' }),
        assignmentRow({ id: 'assign-ok' }),
      ],
      visit: null,
    });
    prisma.visit.findFirst
      .mockRejectedValueOnce(new Error('db hiccup'))
      .mockResolvedValueOnce(null);
    const decisions = makeDecisions();
    const service = new RetentionOutcomeService(
      prisma as never,
      decisions as never,
    );

    const result = await service.runOnce(NOW);

    expect(result.processed).toBe(2);
    expect(result.closedNoReturn).toBe(1);
  });
});
