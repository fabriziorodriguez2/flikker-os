import {
  CustomerSegment,
  ExperienceVersion,
  RetentionObjective,
  RetentionStrategyType,
} from '@prisma/client';
import { RetentionV2EvaluateService } from './retention-v2-evaluate.service';
import {
  objectiveForSegment,
  RetentionExperimentService,
} from './retention-experiment.service';
import { pickVariant } from './allocation';

const NOW = new Date('2026-09-02T15:00:00.000Z');

/** A customer whose visits are `every` days apart, last one `ago` days back. */
function visits(every: number, count: number, ago: number) {
  const out: { occurredAt: Date }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    out.push({
      occurredAt: new Date(NOW.getTime() - (ago + i * every) * 86_400_000),
    });
  }
  return out;
}

const AT_RISK_EXPERIMENT = {
  id: 'exp-atrisk',
  objective: RetentionObjective.AT_RISK_RECOVERY,
  segment: null,
  variants: [
    {
      id: 'v-c',
      strategyType: RetentionStrategyType.CONTROL,
      allocationPercent: 15,
      active: true,
    },
    {
      id: 'v-r',
      strategyType: RetentionStrategyType.REMINDER,
      allocationPercent: 85,
      active: true,
    },
  ],
};

function makeDeps(
  options: {
    businesses?: unknown[];
    customers?: unknown[];
    experiments?: unknown[];
    dryRunEnabled?: boolean;
  } = {},
) {
  const prisma = {
    business: {
      findMany: jest.fn().mockResolvedValue(
        options.businesses ?? [
          {
            id: 'biz-1',
            isActive: true,
            experienceVersion: ExperienceVersion.CHECKIN_V2,
            retentionEngineV2Enabled: true,
          },
        ],
      ),
    },
    customer: {
      findMany: jest.fn().mockResolvedValue(options.customers ?? []),
    },
    retentionAssignment: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  const settings = {
    getOrCreate: jest.fn().mockResolvedValue({
      automaticCampaignsEnabled: true,
      minimumDaysBetweenRetentionMessages: 14,
      maximumRetentionMessagesPer30Days: 2,
      dryRunEnabled: options.dryRunEnabled ?? false,
    }),
  };
  // The real resolver is used — segment→objective mapping is the logic under test.
  const realExperiments = new RetentionExperimentService({} as never);
  const experiments = {
    findUsableRunning: jest
      .fn()
      .mockResolvedValue(options.experiments ?? [AT_RISK_EXPERIMENT]),
    resolveApplicable: realExperiments.resolveApplicable.bind(realExperiments),
  };
  const assignments = {
    assign: jest.fn().mockResolvedValue({
      status: 'assigned',
      assignmentId: 'assign-1',
      strategyType: RetentionStrategyType.REMINDER,
    }),
  };
  const decisions = { record: jest.fn().mockResolvedValue(undefined) };
  return { prisma, settings, experiments, assignments, decisions };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new RetentionV2EvaluateService(
    deps.prisma as never,
    deps.settings as never,
    deps.experiments as never,
    deps.assignments as never,
    deps.decisions as never,
  );
}

function customer(id: string, visitList: { occurredAt: Date }[]) {
  return {
    id,
    name: 'Ana',
    isActive: true,
    optedOut: false,
    phoneE164: '+59891111111',
    visits: visitList,
  };
}

describe('objectiveForSegment', () => {
  it('maps the recruitable segments to their objective', () => {
    expect(objectiveForSegment(CustomerSegment.NEW)).toBe(
      RetentionObjective.SECOND_VISIT,
    );
    expect(objectiveForSegment(CustomerSegment.AT_RISK)).toBe(
      RetentionObjective.AT_RISK_RECOVERY,
    );
    expect(objectiveForSegment(CustomerSegment.INACTIVE)).toBe(
      RetentionObjective.INACTIVE_RECOVERY,
    );
  });

  it('never targets healthy or just-recovered customers', () => {
    expect(objectiveForSegment(CustomerSegment.REPEAT)).toBeNull();
    expect(objectiveForSegment(CustomerSegment.FREQUENT)).toBeNull();
    // RECOVERED must not be pulled straight into another recovery campaign.
    expect(objectiveForSegment(CustomerSegment.RECOVERED)).toBeNull();
  });
});

describe('RetentionV2EvaluateService — business selection', () => {
  it('only sweeps businesses this engine owns', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.runDaily(NOW);

    expect(deps.prisma.business.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          experienceVersion: ExperienceVersion.CHECKIN_V2,
          retentionEngineV2Enabled: true,
        },
      }),
    );
  });

  it('does nothing when the owner turned automatic campaigns off', async () => {
    const deps = makeDeps({ customers: [customer('c1', visits(7, 5, 20))] });
    deps.settings.getOrCreate.mockResolvedValue({
      automaticCampaignsEnabled: false,
      minimumDaysBetweenRetentionMessages: 14,
      maximumRetentionMessagesPer30Days: 2,
    });
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(result.assigned).toBe(0);
    expect(deps.assignments.assign).not.toHaveBeenCalled();
  });

  it('does nothing when there is no running experiment', async () => {
    const deps = makeDeps({
      customers: [customer('c1', visits(7, 5, 20))],
      experiments: [],
    });
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(result.assigned).toBe(0);
    expect(deps.assignments.assign).not.toHaveBeenCalled();
  });

  it('keeps sweeping other businesses when one fails', async () => {
    const deps = makeDeps({
      businesses: [
        {
          id: 'biz-bad',
          isActive: true,
          experienceVersion: ExperienceVersion.CHECKIN_V2,
          retentionEngineV2Enabled: true,
        },
        {
          id: 'biz-ok',
          isActive: true,
          experienceVersion: ExperienceVersion.CHECKIN_V2,
          retentionEngineV2Enabled: true,
        },
      ],
    });
    deps.settings.getOrCreate
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({
        automaticCampaignsEnabled: true,
        minimumDaysBetweenRetentionMessages: 14,
        maximumRetentionMessagesPer30Days: 2,
      });
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(result.businesses).toBe(2);
    expect(deps.settings.getOrCreate).toHaveBeenCalledTimes(2);
  });
});

describe('RetentionV2EvaluateService — recruitment', () => {
  it('recruits an AT_RISK customer into the matching experiment', async () => {
    // Weekly cadence, 20 days out → AT_RISK.
    const deps = makeDeps({ customers: [customer('c1', visits(7, 5, 20))] });
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(result.assigned).toBe(1);
    expect(deps.assignments.assign).toHaveBeenCalledWith(
      expect.objectContaining({
        experimentId: 'exp-atrisk',
        customerId: 'c1',
        segment: CustomerSegment.AT_RISK,
      }),
    );
  });

  it('leaves a healthy FREQUENT customer alone', async () => {
    // Weekly cadence, 3 days out → FREQUENT, no objective, no experiment.
    const deps = makeDeps({ customers: [customer('c1', visits(7, 5, 3))] });
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(result.assigned).toBe(0);
    expect(deps.assignments.assign).not.toHaveBeenCalled();
  });

  it('does not recruit an INACTIVE customer into an AT_RISK experiment', async () => {
    // 60 days out on a weekly cadence → INACTIVE; only AT_RISK is running.
    const deps = makeDeps({ customers: [customer('c1', visits(7, 5, 60))] });
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(result.assigned).toBe(0);
  });

  it('does not re-recruit somebody already in the experiment', async () => {
    const deps = makeDeps({ customers: [customer('c1', visits(7, 5, 20))] });
    deps.prisma.retentionAssignment.findUnique.mockResolvedValue({
      id: 'existing',
    });
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(result.assigned).toBe(0);
    expect(deps.assignments.assign).not.toHaveBeenCalled();
  });

  it('does not spam the audit log with ALREADY_ASSIGNED every day', async () => {
    const deps = makeDeps({ customers: [customer('c1', visits(7, 5, 20))] });
    deps.prisma.retentionAssignment.findUnique.mockResolvedValue({
      id: 'existing',
    });
    const service = makeService(deps);

    await service.runDaily(NOW);

    expect(deps.decisions.record).not.toHaveBeenCalled();
  });

  it('records the decision and the behaviour behind it when recruiting', async () => {
    const deps = makeDeps({ customers: [customer('c1', visits(7, 5, 20))] });
    const service = makeService(deps);

    await service.runDaily(NOW);

    const logged = deps.decisions.record.mock.calls[0][0] as {
      decisionCode: string;
      metadata: Record<string, unknown>;
    };
    expect(logged.decisionCode).toBe('ASSIGNED');
    expect(logged.metadata.segment).toBe(CustomerSegment.AT_RISK);
    expect(logged.metadata.typicalIntervalDays).toBe(7);
    expect(logged.metadata.daysSinceLastVisit).toBe(20);
  });

  it('logs a skip with its reason when the customer is not eligible', async () => {
    const deps = makeDeps({
      customers: [
        {
          ...customer('c1', visits(7, 5, 20)),
          optedOut: true,
        },
      ],
    });
    const service = makeService(deps);

    await service.runDaily(NOW);

    const codes = deps.decisions.record.mock.calls.map(
      (c) => (c[0] as { decisionCode: string }).decisionCode,
    );
    expect(codes).toContain('SKIPPED_OPT_OUT');
    expect(deps.assignments.assign).not.toHaveBeenCalled();
  });
});

describe('RetentionExperimentService.resolveApplicable', () => {
  const service = new RetentionExperimentService({} as never);
  const open = {
    id: 'open',
    objective: RetentionObjective.AT_RISK_RECOVERY,
    segment: null,
  };
  const targeted = {
    id: 'targeted',
    objective: RetentionObjective.AT_RISK_RECOVERY,
    segment: CustomerSegment.AT_RISK,
  };

  it('prefers a segment-targeted experiment over an open one', () => {
    expect(
      service.resolveApplicable([open, targeted], CustomerSegment.AT_RISK)?.id,
    ).toBe('targeted');
  });

  it('falls back to the open experiment', () => {
    expect(service.resolveApplicable([open], CustomerSegment.AT_RISK)?.id).toBe(
      'open',
    );
  });

  it('returns null when no experiment matches the objective', () => {
    expect(
      service.resolveApplicable([open], CustomerSegment.INACTIVE),
    ).toBeNull();
  });

  it('returns null for segments that are never targeted', () => {
    expect(
      service.resolveApplicable([open], CustomerSegment.FREQUENT),
    ).toBeNull();
  });
});

describe('RetentionV2EvaluateService — dry run (Fase C.5 §8)', () => {
  it('never creates a real RetentionAssignment while observing', async () => {
    const deps = makeDeps({
      customers: [customer('c1', visits(7, 5, 20))],
      dryRunEnabled: true,
    });
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(deps.assignments.assign).not.toHaveBeenCalled();
    expect(result.assigned).toBe(0);
    expect(result.dryRunCandidates).toBe(1);
  });

  it('logs the exact variant the deterministic allocator would have picked', async () => {
    const deps = makeDeps({
      customers: [customer('c1', visits(7, 5, 20))],
      dryRunEnabled: true,
    });
    const service = makeService(deps);

    await service.runDaily(NOW);

    const expectedVariant = pickVariant(
      'exp-atrisk',
      'c1',
      AT_RISK_EXPERIMENT.variants,
    )!;
    const logged = deps.decisions.record.mock.calls[0][0] as {
      decisionCode: string;
      metadata: Record<string, unknown>;
    };
    expect(logged.metadata.variantId).toBe(expectedVariant.id);
    expect(logged.decisionCode).toBe(
      expectedVariant.strategyType === RetentionStrategyType.CONTROL
        ? 'DRY_RUN_WOULD_CONTROL'
        : 'DRY_RUN_WOULD_SEND',
    );
  });

  it('still respects eligibility — an opted-out customer is not a dry-run candidate either', async () => {
    const deps = makeDeps({
      customers: [{ ...customer('c1', visits(7, 5, 20)), optedOut: true }],
      dryRunEnabled: true,
    });
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(result.dryRunCandidates).toBe(0);
    expect(
      deps.decisions.record.mock.calls.map(
        (c) => (c[0] as { decisionCode: string }).decisionCode,
      ),
    ).toContain('SKIPPED_OPT_OUT');
  });

  it('leaves the door open to recruit for real once dry run is switched off', async () => {
    // Same experiment/customer, dry run off this time — the exact same
    // deterministic slot is still free because dry run never touched it.
    const deps = makeDeps({ customers: [customer('c1', visits(7, 5, 20))] });
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(result.assigned).toBe(1);
    expect(deps.assignments.assign).toHaveBeenCalledTimes(1);
  });
});
