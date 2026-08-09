import {
  ExperienceVersion,
  Prisma,
  RetentionAssignmentStatus,
  RetentionObjective,
  RetentionStrategyType,
} from '@prisma/client';
import { CustomerSegment } from '@prisma/client';
import { RetentionV2SendService } from './retention-v2-send.service';

const NOW = new Date('2026-09-02T15:00:00.000Z'); // Wednesday, 12:00 Montevideo

const DEFAULT_SETTINGS = {
  automaticCampaignsEnabled: true,
  minimumDaysBetweenRetentionMessages: 14,
  maximumRetentionMessagesPer30Days: 2,
  sendingHourStart: 10,
  sendingHourEnd: 20,
  allowedSendingDays: [1, 2, 3, 4, 5, 6],
};

function assignmentFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'assign-1',
    businessId: 'biz-1',
    customerId: 'cust-1',
    experimentId: 'exp-1',
    variantId: 'var-1',
    status: RetentionAssignmentStatus.PENDING,
    assignedAt: new Date('2026-09-01T12:00:00.000Z'),
    segmentAtAssignment: CustomerSegment.AT_RISK,
    business: {
      id: 'biz-1',
      name: 'Café Uno',
      isActive: true,
      timezone: 'America/Montevideo',
      experienceVersion: ExperienceVersion.CHECKIN_V2,
      retentionEngineV2Enabled: true,
    },
    customer: {
      id: 'cust-1',
      name: 'Ana Pérez',
      isActive: true,
      optedOut: false,
      phoneE164: '+59891111111',
    },
    experiment: { id: 'exp-1', objective: RetentionObjective.AT_RISK_RECOVERY },
    variant: {
      id: 'var-1',
      strategyType: RetentionStrategyType.REMINDER,
      incentiveDefinitionId: null,
      incentiveDefinition: null,
    },
    ...overrides,
  };
}

function makeDeps(assignment: unknown = assignmentFixture()) {
  const tx = {
    message: { create: jest.fn().mockResolvedValue({ id: 'msg-1' }) },
    retentionAssignment: { update: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    retentionAssignment: {
      findUnique: jest.fn().mockResolvedValue(assignment),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({}),
    },
    visit: {
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
    customerRewardGoal: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((cb: (t: typeof tx) => unknown): unknown =>
      cb(tx),
    ) as jest.Mock,
    tx,
  };
  const settings = {
    getOrCreate: jest.fn().mockResolvedValue(DEFAULT_SETTINGS),
    isWithinSendingWindow: jest.fn().mockReturnValue(true),
  };
  const experiments = { isRunning: jest.fn().mockResolvedValue(true) };
  const issuer = { issueForAssignment: jest.fn() };
  const decisions = { record: jest.fn().mockResolvedValue(undefined) };
  // Fase F: AI is disabled by default in every test here — the whole point
  // is that Retention V2's own behaviour (skip reasons, message counts,
  // idempotency) is unaffected by whether AI is on. AI-specific behaviour
  // (fallback, validation, copySource) is covered by retention-ai-copy.service.spec.ts
  // and the dedicated Fase F integration tests below.
  const aiCopy = {
    resolveRetentionMessage: jest.fn().mockResolvedValue({
      text: 'stub deterministic message',
      copySource: 'DETERMINISTIC_DISABLED',
      aiUsageEventId: null,
    }),
  };
  return { prisma, settings, experiments, issuer, decisions, aiCopy };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new RetentionV2SendService(
    deps.prisma as never,
    deps.settings as never,
    deps.experiments as never,
    deps.issuer as never,
    deps.decisions as never,
    deps.aiCopy as never,
  );
}

function loggedCodes(deps: ReturnType<typeof makeDeps>): string[] {
  return deps.decisions.record.mock.calls.map(
    (c) => (c[0] as { decisionCode: string }).decisionCode,
  );
}

describe('RetentionV2SendService — CONTROL', () => {
  const controlAssignment = assignmentFixture({
    variant: {
      id: 'var-control',
      strategyType: RetentionStrategyType.CONTROL,
      incentiveDefinitionId: null,
      incentiveDefinition: null,
    },
  });

  it('never creates a Message', async () => {
    const deps = makeDeps(controlAssignment);
    const service = makeService(deps);

    const result = await service.processAssignment('assign-1', NOW);

    expect(result).toEqual({ status: 'control' });
    expect(deps.prisma.$transaction).not.toHaveBeenCalled();
    expect(deps.prisma.tx.message.create).not.toHaveBeenCalled();
  });

  it('never issues a reward', async () => {
    const deps = makeDeps(controlAssignment);
    const service = makeService(deps);

    await service.processAssignment('assign-1', NOW);

    expect(deps.issuer.issueForAssignment).not.toHaveBeenCalled();
  });

  it('is marked OBSERVING so it stays measurable', async () => {
    const deps = makeDeps(controlAssignment);
    const service = makeService(deps);

    await service.processAssignment('assign-1', NOW);

    expect(deps.prisma.retentionAssignment.update).toHaveBeenCalledWith({
      where: { id: 'assign-1' },
      data: {
        status: RetentionAssignmentStatus.OBSERVING,
        sentAt: null,
        exposedAt: NOW,
      },
    });
    expect(loggedCodes(deps)).toContain('CONTROL_ACTIVE');
  });

  it('never touches the monthly incentive budget', async () => {
    // The budget is enforced inside IncentiveIssuerService, which CONTROL
    // never calls — this is what makes CONTROL a real zero-cost participant.
    const deps = makeDeps(controlAssignment);
    const service = makeService(deps);

    await service.processAssignment('assign-1', NOW);

    expect(deps.issuer.issueForAssignment).not.toHaveBeenCalled();
  });
});

describe('RetentionV2SendService — sending variants', () => {
  it('REMINDER creates exactly one Message and no reward', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const result = await service.processAssignment('assign-1', NOW);

    expect(result).toEqual({
      status: 'sent',
      messageId: 'msg-1',
      benefitIssued: false,
    });
    expect(deps.prisma.tx.message.create).toHaveBeenCalledTimes(1);
    // A REMINDER carries no incentive, so it never reaches the budget check
    // either — a plain nudge never competes with the promotional budget.
    expect(deps.issuer.issueForAssignment).not.toHaveBeenCalled();
    expect(loggedCodes(deps)).toContain('MESSAGE_QUEUED');
  });

  it('stamps exposedAt when the message is actually created (Fase D)', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.processAssignment('assign-1', NOW);

    expect(deps.prisma.tx.retentionAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'assign-1' },
        data: expect.objectContaining({ exposedAt: NOW }),
      }),
    );
  });

  it('a benefit variant issues one reward and one Message', async () => {
    const deps = makeDeps(
      assignmentFixture({
        variant: {
          id: 'var-soft',
          strategyType: RetentionStrategyType.SOFT_BENEFIT,
          incentiveDefinitionId: 'inc-1',
          incentiveDefinition: { name: 'Upgrade gratis', expiresInDays: 7 },
        },
      }),
    );
    deps.issuer.issueForAssignment.mockResolvedValue({
      status: 'issued',
      participationId: 'part-1',
      code: 'ABCD1234',
      expiresAt: new Date(),
    });
    const service = makeService(deps);

    const result = await service.processAssignment('assign-1', NOW);

    expect(result).toEqual({
      status: 'sent',
      messageId: 'msg-1',
      benefitIssued: true,
    });
    expect(deps.issuer.issueForAssignment).toHaveBeenCalledTimes(1);
    expect(deps.prisma.tx.message.create).toHaveBeenCalledTimes(1);
    expect(loggedCodes(deps)).toEqual(
      expect.arrayContaining(['INCENTIVE_ISSUED', 'MESSAGE_QUEUED']),
    );
  });

  it('does not promise an incentive that could not be issued', async () => {
    const deps = makeDeps(
      assignmentFixture({
        variant: {
          id: 'var-soft',
          strategyType: RetentionStrategyType.SOFT_BENEFIT,
          incentiveDefinitionId: 'inc-1',
          incentiveDefinition: { name: '10% OFF', expiresInDays: 7 },
        },
      }),
    );
    deps.issuer.issueForAssignment.mockResolvedValue({
      status: 'skipped',
      reason: 'NOT_VALID_TODAY',
    });
    const service = makeService(deps);

    const result = await service.processAssignment('assign-1', NOW);

    expect(result).toEqual({
      status: 'skipped',
      reasonCode: 'INCENTIVE_NOT_VALID_TODAY',
    });
    expect(deps.prisma.tx.message.create).not.toHaveBeenCalled();
    expect(loggedCodes(deps)).toContain('SKIPPED_INCENTIVE_UNAVAILABLE');
  });

  it('logs the monthly incentive limit distinctly from a generic unavailability', async () => {
    const deps = makeDeps(
      assignmentFixture({
        variant: {
          id: 'var-soft',
          strategyType: RetentionStrategyType.SOFT_BENEFIT,
          incentiveDefinitionId: 'inc-1',
          incentiveDefinition: { name: '10% OFF', expiresInDays: 7 },
        },
      }),
    );
    deps.issuer.issueForAssignment.mockResolvedValue({
      status: 'skipped',
      reason: 'MONTHLY_INCENTIVE_LIMIT',
    });
    const service = makeService(deps);

    expect(await service.processAssignment('assign-1', NOW)).toEqual({
      status: 'skipped',
      reasonCode: 'INCENTIVE_MONTHLY_INCENTIVE_LIMIT',
    });
    expect(loggedCodes(deps)).toContain('SKIPPED_MONTHLY_INCENTIVE_LIMIT');
  });

  it('logs the monthly budget limit distinctly from a generic unavailability', async () => {
    const deps = makeDeps(
      assignmentFixture({
        variant: {
          id: 'var-soft',
          strategyType: RetentionStrategyType.STRONG_BENEFIT,
          incentiveDefinitionId: 'inc-1',
          incentiveDefinition: { name: 'Upgrade gratis', expiresInDays: 7 },
        },
      }),
    );
    deps.issuer.issueForAssignment.mockResolvedValue({
      status: 'skipped',
      reason: 'MONTHLY_BUDGET_LIMIT',
    });
    const service = makeService(deps);

    expect(await service.processAssignment('assign-1', NOW)).toEqual({
      status: 'skipped',
      reasonCode: 'INCENTIVE_MONTHLY_BUDGET_LIMIT',
    });
    expect(loggedCodes(deps)).toContain('SKIPPED_MONTHLY_BUDGET_LIMIT');
  });
});

describe('RetentionV2SendService — re-validation right before sending', () => {
  it('skips when the engine was switched off after recruitment', async () => {
    const deps = makeDeps(
      assignmentFixture({
        business: {
          id: 'biz-1',
          name: 'Café Uno',
          isActive: true,
          timezone: 'America/Montevideo',
          experienceVersion: ExperienceVersion.CHECKIN_V2,
          retentionEngineV2Enabled: false,
        },
      }),
    );
    const service = makeService(deps);

    const result = await service.processAssignment('assign-1', NOW);

    expect(result).toEqual({
      status: 'skipped',
      reasonCode: 'ENGINE_DISABLED',
    });
    expect(deps.prisma.tx.message.create).not.toHaveBeenCalled();
    expect(loggedCodes(deps)).toContain('SKIPPED_ENGINE_DISABLED');
  });

  it('kill switch: skips when the owner turned automatic campaigns off after recruitment', async () => {
    const deps = makeDeps();
    deps.settings.getOrCreate.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      automaticCampaignsEnabled: false,
    });
    const service = makeService(deps);

    const result = await service.processAssignment('assign-1', NOW);

    expect(result).toEqual({
      status: 'skipped',
      reasonCode: 'AUTOMATION_DISABLED',
    });
    expect(deps.prisma.tx.message.create).not.toHaveBeenCalled();
    expect(loggedCodes(deps)).toContain('SKIPPED_ENGINE_DISABLED');
  });

  it('skips a business flipped back to LEGACY', async () => {
    const deps = makeDeps(
      assignmentFixture({
        business: {
          id: 'biz-1',
          name: 'Café Uno',
          isActive: true,
          timezone: 'America/Montevideo',
          experienceVersion: ExperienceVersion.LEGACY,
          retentionEngineV2Enabled: true,
        },
      }),
    );
    const service = makeService(deps);

    expect(await service.processAssignment('assign-1', NOW)).toEqual({
      status: 'skipped',
      reasonCode: 'NOT_CHECKIN_V2',
    });
  });

  it('skips when the experiment is no longer RUNNING', async () => {
    const deps = makeDeps();
    deps.experiments.isRunning.mockResolvedValue(false);
    const service = makeService(deps);

    const result = await service.processAssignment('assign-1', NOW);

    expect(result).toEqual({
      status: 'skipped',
      reasonCode: 'EXPERIMENT_NOT_RUNNING',
    });
    expect(loggedCodes(deps)).toContain('SKIPPED_EXPERIMENT_NOT_RUNNING');
  });

  it('skips when the customer already came back', async () => {
    const deps = makeDeps();
    deps.prisma.visit.findFirst.mockResolvedValue({ id: 'visit-1' });
    const service = makeService(deps);

    const result = await service.processAssignment('assign-1', NOW);

    expect(result).toEqual({
      status: 'skipped',
      reasonCode: 'ALREADY_RETURNED',
    });
    expect(deps.prisma.tx.message.create).not.toHaveBeenCalled();
    expect(loggedCodes(deps)).toContain('SKIPPED_RETURNED');
  });

  it('skips an opt-out that happened after recruitment', async () => {
    const deps = makeDeps(
      assignmentFixture({
        customer: {
          id: 'cust-1',
          name: 'Ana',
          isActive: true,
          optedOut: true,
          phoneE164: '+59891111111',
        },
      }),
    );
    const service = makeService(deps);

    expect(await service.processAssignment('assign-1', NOW)).toEqual({
      status: 'skipped',
      reasonCode: 'OPTED_OUT',
    });
    expect(loggedCodes(deps)).toContain('SKIPPED_OPT_OUT');
  });

  it('skips while the cooldown is running', async () => {
    const deps = makeDeps();
    deps.prisma.retentionAssignment.findFirst.mockResolvedValue({
      sentAt: new Date('2026-08-30T12:00:00.000Z'), // 3 days ago, cooldown 14
    });
    const service = makeService(deps);

    expect(await service.processAssignment('assign-1', NOW)).toEqual({
      status: 'skipped',
      reasonCode: 'COOLDOWN_ACTIVE',
    });
    expect(loggedCodes(deps)).toContain('SKIPPED_COOLDOWN');
  });

  it('skips at the monthly cap', async () => {
    const deps = makeDeps();
    deps.prisma.retentionAssignment.count.mockResolvedValue(2);
    const service = makeService(deps);

    expect(await service.processAssignment('assign-1', NOW)).toEqual({
      status: 'skipped',
      reasonCode: 'MONTHLY_LIMIT_REACHED',
    });
    expect(loggedCodes(deps)).toContain('SKIPPED_LIMIT');
  });

  it('leaves the assignment PENDING outside the sending window', async () => {
    const deps = makeDeps();
    deps.settings.isWithinSendingWindow.mockReturnValue(false);
    const service = makeService(deps);

    const result = await service.processAssignment('assign-1', NOW);

    expect(result).toEqual({
      status: 'skipped',
      reasonCode: 'OUTSIDE_SENDING_WINDOW',
    });
    // Not marked SKIPPED: the next run should still be able to send it.
    expect(deps.prisma.retentionAssignment.update).not.toHaveBeenCalled();
    expect(loggedCodes(deps)).toContain('SKIPPED_OUTSIDE_WINDOW');
  });
});

describe('RetentionV2SendService — idempotency', () => {
  it.each([
    RetentionAssignmentStatus.SENT,
    RetentionAssignmentStatus.OBSERVING,
    RetentionAssignmentStatus.SKIPPED,
  ])('does not reprocess an assignment already in %s', async (status) => {
    const deps = makeDeps(assignmentFixture({ status }));
    const service = makeService(deps);

    const result = await service.processAssignment('assign-1', NOW);

    expect(result).toEqual({ status: 'already_processed' });
    expect(deps.prisma.$transaction).not.toHaveBeenCalled();
    expect(deps.issuer.issueForAssignment).not.toHaveBeenCalled();
  });

  it('a concurrent duplicate resolves to the winner’s message', async () => {
    const deps = makeDeps();
    deps.prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    deps.prisma.retentionAssignment.findUnique
      .mockResolvedValueOnce(assignmentFixture())
      .mockResolvedValueOnce({ messageId: 'msg-winner' });
    const service = makeService(deps);

    const result = await service.processAssignment('assign-1', NOW);

    expect(result).toEqual({
      status: 'sent',
      messageId: 'msg-winner',
      benefitIssued: false,
    });
  });

  it('records MESSAGE_FAILED and does not throw when the insert fails', async () => {
    const deps = makeDeps();
    deps.prisma.$transaction.mockRejectedValue(new Error('db down'));
    const service = makeService(deps);

    const result = await service.processAssignment('assign-1', NOW);

    expect(result).toEqual({ status: 'skipped', reasonCode: 'MESSAGE_FAILED' });
    expect(loggedCodes(deps)).toContain('MESSAGE_FAILED');
  });

  it('skips a nonexistent assignment', async () => {
    const deps = makeDeps(null);
    const service = makeService(deps);

    expect(await service.processAssignment('ghost', NOW)).toEqual({
      status: 'skipped',
      reasonCode: 'NOT_FOUND',
    });
  });
});

describe('RetentionV2SendService — PROGRESS_REMINDER (Fase E §25-27)', () => {
  const progressReminderAssignment = assignmentFixture({
    variant: {
      id: 'var-progress',
      strategyType: RetentionStrategyType.PROGRESS_REMINDER,
      incentiveDefinitionId: null,
      incentiveDefinition: null,
    },
  });

  it('skips when no ACTIVE reward goal exists — never sends a stale reminder', async () => {
    const deps = makeDeps(progressReminderAssignment);
    deps.prisma.customerRewardGoal.findFirst.mockResolvedValue(null);
    const service = makeService(deps);

    const result = await service.processAssignment('assign-1', NOW);

    expect(result).toEqual({
      status: 'skipped',
      reasonCode: 'NO_ACTIVE_REWARD_GOAL',
    });
    expect(loggedCodes(deps)).toContain('SKIPPED_NO_ACTIVE_REWARD_GOAL');
    expect(deps.prisma.tx.message.create).not.toHaveBeenCalled();
  });

  it('sends the progress message and never touches the incentive issuer or budget', async () => {
    const deps = makeDeps(progressReminderAssignment);
    deps.prisma.customerRewardGoal.findFirst.mockResolvedValue({
      activatedAt: new Date('2026-08-25T00:00:00.000Z'),
      targetAdditionalVisits: 3,
      incentiveDefinition: { name: 'Upgrade gratis' },
    });
    deps.prisma.visit.count.mockResolvedValue(2); // 1 remaining
    const service = makeService(deps);

    const result = await service.processAssignment('assign-1', NOW);

    expect(result).toEqual({
      status: 'sent',
      messageId: 'msg-1',
      benefitIssued: false,
    });
    expect(deps.issuer.issueForAssignment).not.toHaveBeenCalled();
    expect(deps.prisma.tx.message.create).toHaveBeenCalledTimes(1);
    expect(loggedCodes(deps)).toContain('MESSAGE_QUEUED');
  });

  it('never checks the sending window differently — still respects it', async () => {
    const deps = makeDeps(progressReminderAssignment);
    deps.settings.isWithinSendingWindow.mockReturnValue(false);
    deps.prisma.customerRewardGoal.findFirst.mockResolvedValue({
      activatedAt: new Date('2026-08-25T00:00:00.000Z'),
      targetAdditionalVisits: 1,
      incentiveDefinition: { name: 'Upgrade gratis' },
    });
    const service = makeService(deps);

    const result = await service.processAssignment('assign-1', NOW);

    expect(result).toEqual({
      status: 'skipped',
      reasonCode: 'OUTSIDE_SENDING_WINDOW',
    });
  });

  it('still re-validates the same eligibility rules (opt-out, cooldown, etc.)', async () => {
    const deps = makeDeps(
      assignmentFixture({
        variant: {
          id: 'var-progress',
          strategyType: RetentionStrategyType.PROGRESS_REMINDER,
          incentiveDefinitionId: null,
          incentiveDefinition: null,
        },
        customer: {
          id: 'cust-1',
          name: 'Ana',
          isActive: true,
          optedOut: true,
          phoneE164: '+59891111111',
        },
      }),
    );
    const service = makeService(deps);

    expect(await service.processAssignment('assign-1', NOW)).toEqual({
      status: 'skipped',
      reasonCode: 'OPTED_OUT',
    });
  });

  it('regression (pre-piloto fix §1/§2): a REWARD_GOAL_PROGRESS assignment for a NEW/REPEAT/FREQUENT/RECOVERED customer is NOT rejected as SEGMENT_NOT_TARGETABLE — recruitment for this objective never gated on segment in the first place', async () => {
    // The exact combination REWARD_GOAL_PROGRESS recruitment actually
    // produces: segmentAtAssignment is whatever the customer's real segment
    // was (here REPEAT — never AT_RISK/INACTIVE, since Reward Goals are
    // never created for those), but the objective is REWARD_GOAL_PROGRESS.
    const deps = makeDeps(
      assignmentFixture({
        segmentAtAssignment: CustomerSegment.REPEAT,
        experiment: {
          id: 'exp-1',
          objective: RetentionObjective.REWARD_GOAL_PROGRESS,
        },
        variant: {
          id: 'var-progress',
          strategyType: RetentionStrategyType.PROGRESS_REMINDER,
          incentiveDefinitionId: null,
          incentiveDefinition: null,
        },
      }),
    );
    deps.prisma.customerRewardGoal.findFirst.mockResolvedValue({
      activatedAt: new Date('2026-08-25T00:00:00.000Z'),
      targetAdditionalVisits: 2,
      incentiveDefinition: { name: 'Upgrade gratis' },
    });
    deps.prisma.visit.count.mockResolvedValue(1);
    const service = makeService(deps);

    const result = await service.processAssignment('assign-1', NOW);

    expect(result).toEqual({
      status: 'sent',
      messageId: 'msg-1',
      benefitIssued: false,
    });
    expect(loggedCodes(deps)).not.toContain('SKIPPED_ENGINE_DISABLED');
  });

  it('regression: a non-REWARD_GOAL_PROGRESS PROGRESS_REMINDER (historical AT_RISK_RECOVERY combination) keeps validating its real segment exactly as before', async () => {
    const deps = makeDeps(
      assignmentFixture({
        segmentAtAssignment: CustomerSegment.REPEAT, // hypothetically drifted — must still be rejected for this objective
        experiment: {
          id: 'exp-1',
          objective: RetentionObjective.AT_RISK_RECOVERY,
        },
        variant: {
          id: 'var-progress',
          strategyType: RetentionStrategyType.PROGRESS_REMINDER,
          incentiveDefinitionId: null,
          incentiveDefinition: null,
        },
      }),
    );
    const service = makeService(deps);

    expect(await service.processAssignment('assign-1', NOW)).toEqual({
      status: 'skipped',
      reasonCode: 'SEGMENT_NOT_TARGETABLE',
    });
  });
});
