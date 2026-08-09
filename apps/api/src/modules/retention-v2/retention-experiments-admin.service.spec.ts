import {
  ExperienceVersion,
  RetentionExperimentStatus,
  RetentionObjective,
  RetentionStrategyType,
} from '@prisma/client';
import { RetentionExperimentsAdminService } from './retention-experiments-admin.service';

function variant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'var-1',
    name: 'Recordatorio',
    strategyType: RetentionStrategyType.REMINDER,
    allocationPercent: 85,
    active: true,
    incentiveDefinitionId: null,
    incentiveDefinition: null,
    ...overrides,
  };
}

function experiment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exp-1',
    businessId: 'biz-1',
    name: 'At-risk recovery',
    objective: RetentionObjective.AT_RISK_RECOVERY,
    segment: null,
    status: RetentionExperimentStatus.DRAFT,
    variants: [
      variant({
        id: 'var-control',
        strategyType: RetentionStrategyType.CONTROL,
        allocationPercent: 15,
      }),
      variant(),
    ],
    ...overrides,
  };
}

function makePrisma(
  options: {
    experiment?: unknown;
    business?: unknown;
    incentiveDefinition?: unknown;
  } = {},
) {
  return {
    retentionExperiment: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.experiment === undefined ? experiment() : options.experiment,
        ),
      create: jest.fn().mockResolvedValue({ id: 'exp-new' }),
      update: jest
        .fn()
        .mockImplementation((args: { data: unknown }) =>
          Promise.resolve({ id: 'exp-1', ...(args.data as object) }),
        ),
    },
    retentionVariant: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'var-new' }),
      update: jest.fn().mockResolvedValue({ id: 'var-1' }),
    },
    retentionIncentiveDefinition: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.incentiveDefinition === undefined
            ? { id: 'inc-1' }
            : options.incentiveDefinition,
        ),
    },
    business: {
      findUnique: jest.fn().mockResolvedValue(
        options.business === undefined
          ? {
              experienceVersion: ExperienceVersion.CHECKIN_V2,
              retentionEngineV2Enabled: true,
            }
          : options.business,
      ),
    },
  };
}

describe('RetentionExperimentsAdminService — tenant scoping', () => {
  it('getOne 404s instead of leaking another tenant’s experiment', async () => {
    const prisma = makePrisma({ experiment: null });
    const service = new RetentionExperimentsAdminService(prisma as never);

    await expect(service.getOne('biz-1', 'exp-other-tenant')).rejects.toThrow(
      'Experiment not found',
    );
  });
});

describe('RetentionExperimentsAdminService — DRAFT is the only editable state', () => {
  it('allows editing while DRAFT', async () => {
    const prisma = makePrisma();
    const service = new RetentionExperimentsAdminService(prisma as never);

    await service.update('biz-1', 'exp-1', { name: 'Renamed' });

    expect(prisma.retentionExperiment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'Renamed' } }),
    );
  });

  it('freezes structure once RUNNING', async () => {
    const prisma = makePrisma({
      experiment: experiment({ status: RetentionExperimentStatus.RUNNING }),
    });
    const service = new RetentionExperimentsAdminService(prisma as never);

    await expect(
      service.update('biz-1', 'exp-1', { name: 'Renamed' }),
    ).rejects.toThrow('structure is frozen');
    expect(prisma.retentionExperiment.update).not.toHaveBeenCalled();
  });

  it('refuses to add a variant once RUNNING', async () => {
    const prisma = makePrisma({
      experiment: experiment({ status: RetentionExperimentStatus.RUNNING }),
    });
    const service = new RetentionExperimentsAdminService(prisma as never);

    await expect(
      service.addVariant('biz-1', 'exp-1', {
        name: 'New arm',
        strategyType: RetentionStrategyType.REMINDER,
        allocationPercent: 10,
      }),
    ).rejects.toThrow('structure is frozen');
  });
});

describe('RetentionExperimentsAdminService — variant/incentive consistency', () => {
  it('rejects a CONTROL variant carrying an incentive', async () => {
    const prisma = makePrisma();
    const service = new RetentionExperimentsAdminService(prisma as never);

    await expect(
      service.addVariant('biz-1', 'exp-1', {
        name: 'Bad control',
        strategyType: RetentionStrategyType.CONTROL,
        incentiveDefinitionId: 'inc-1',
        allocationPercent: 15,
      }),
    ).rejects.toThrow('cannot carry an incentive');
  });

  it('requires an incentiveDefinitionId for a benefit-bearing variant', async () => {
    const prisma = makePrisma();
    const service = new RetentionExperimentsAdminService(prisma as never);

    await expect(
      service.addVariant('biz-1', 'exp-1', {
        name: 'Soft benefit',
        strategyType: RetentionStrategyType.SOFT_BENEFIT,
        allocationPercent: 40,
      }),
    ).rejects.toThrow('require an incentiveDefinitionId');
  });

  it('rejects an incentiveDefinitionId belonging to another business', async () => {
    const prisma = makePrisma({ incentiveDefinition: null });
    const service = new RetentionExperimentsAdminService(prisma as never);

    await expect(
      service.addVariant('biz-1', 'exp-1', {
        name: 'Soft benefit',
        strategyType: RetentionStrategyType.SOFT_BENEFIT,
        incentiveDefinitionId: 'inc-other-tenant',
        allocationPercent: 40,
      }),
    ).rejects.toThrow('does not belong to this business');
  });

  it('accepts a benefit variant pointing at an incentive it owns', async () => {
    const prisma = makePrisma();
    const service = new RetentionExperimentsAdminService(prisma as never);

    await service.addVariant('biz-1', 'exp-1', {
      name: 'Soft benefit',
      strategyType: RetentionStrategyType.SOFT_BENEFIT,
      incentiveDefinitionId: 'inc-1',
      allocationPercent: 40,
    });

    expect(prisma.retentionVariant.create).toHaveBeenCalledTimes(1);
  });
});

describe('RetentionExperimentsAdminService — PROGRESS_REMINDER/REWARD_GOAL_PROGRESS pairing (pre-piloto fix)', () => {
  it('rejects PROGRESS_REMINDER on a non-REWARD_GOAL_PROGRESS experiment', async () => {
    const prisma = makePrisma({
      experiment: experiment({
        objective: RetentionObjective.AT_RISK_RECOVERY,
      }),
    });
    const service = new RetentionExperimentsAdminService(prisma as never);

    await expect(
      service.addVariant('biz-1', 'exp-1', {
        name: 'Progress',
        strategyType: RetentionStrategyType.PROGRESS_REMINDER,
        allocationPercent: 70,
      }),
    ).rejects.toThrow('only allowed in a REWARD_GOAL_PROGRESS experiment');
  });

  it('rejects a SOFT_BENEFIT variant on a REWARD_GOAL_PROGRESS experiment', async () => {
    const prisma = makePrisma({
      experiment: experiment({
        objective: RetentionObjective.REWARD_GOAL_PROGRESS,
      }),
    });
    const service = new RetentionExperimentsAdminService(prisma as never);

    await expect(
      service.addVariant('biz-1', 'exp-1', {
        name: 'Soft benefit',
        strategyType: RetentionStrategyType.SOFT_BENEFIT,
        incentiveDefinitionId: 'inc-1',
        allocationPercent: 40,
      }),
    ).rejects.toThrow('only allows CONTROL and PROGRESS_REMINDER variants');
  });

  it('accepts CONTROL and PROGRESS_REMINDER on a REWARD_GOAL_PROGRESS experiment', async () => {
    const prisma = makePrisma({
      experiment: experiment({
        objective: RetentionObjective.REWARD_GOAL_PROGRESS,
      }),
    });
    const service = new RetentionExperimentsAdminService(prisma as never);

    await service.addVariant('biz-1', 'exp-1', {
      name: 'Progress',
      strategyType: RetentionStrategyType.PROGRESS_REMINDER,
      allocationPercent: 70,
    });

    expect(prisma.retentionVariant.create).toHaveBeenCalledTimes(1);
  });

  it('does not retroactively break an existing PROGRESS_REMINDER variant under AT_RISK_RECOVERY when updating an unrelated field', async () => {
    // Historical/Simulation Center experiments may already have this
    // combination (§5 — never migrated destructively). The check only fires
    // when the STRATEGY itself is (re)written to something inconsistent; an
    // update that leaves strategyType untouched must not be blocked by it.
    const prisma = makePrisma({
      experiment: experiment({
        objective: RetentionObjective.AT_RISK_RECOVERY,
      }),
    });
    prisma.retentionVariant.findFirst.mockResolvedValue({
      id: 'var-1',
      strategyType: RetentionStrategyType.PROGRESS_REMINDER,
      incentiveDefinitionId: null,
    });
    const service = new RetentionExperimentsAdminService(prisma as never);

    await service.updateVariant('biz-1', 'exp-1', 'var-1', {
      allocationPercent: 50,
    });

    expect(prisma.retentionVariant.update).toHaveBeenCalledTimes(1);
  });
});

describe('RetentionExperimentsAdminService.start — Fase C.5 §4 checklist', () => {
  it('starts a well-formed DRAFT experiment', async () => {
    const prisma = makePrisma();
    const service = new RetentionExperimentsAdminService(prisma as never);

    const result = await service.start('biz-1', 'exp-1');

    expect(prisma.retentionExperiment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: RetentionExperimentStatus.RUNNING,
        }),
      }),
    );
    expect(result).toMatchObject({ status: RetentionExperimentStatus.RUNNING });
  });

  it('refuses without exactly one CONTROL variant', async () => {
    const prisma = makePrisma({
      experiment: experiment({
        variants: [
          variant({
            strategyType: RetentionStrategyType.REMINDER,
            allocationPercent: 100,
          }),
        ],
      }),
    });
    const service = new RetentionExperimentsAdminService(prisma as never);

    await expect(service.start('biz-1', 'exp-1')).rejects.toThrow(
      'CONTROL variant',
    );
  });

  it('refuses when allocations do not sum to 100', async () => {
    const prisma = makePrisma({
      experiment: experiment({
        variants: [
          variant({
            id: 'var-control',
            strategyType: RetentionStrategyType.CONTROL,
            allocationPercent: 15,
          }),
          variant({ allocationPercent: 50 }),
        ],
      }),
    });
    const service = new RetentionExperimentsAdminService(prisma as never);

    await expect(service.start('biz-1', 'exp-1')).rejects.toThrow('sum to 100');
  });

  it('refuses a benefit variant whose incentive was deactivated after being added', async () => {
    const prisma = makePrisma({
      experiment: experiment({
        variants: [
          variant({
            id: 'var-control',
            strategyType: RetentionStrategyType.CONTROL,
            allocationPercent: 15,
          }),
          variant({
            strategyType: RetentionStrategyType.SOFT_BENEFIT,
            allocationPercent: 85,
            incentiveDefinitionId: 'inc-1',
            incentiveDefinition: {
              id: 'inc-1',
              active: false,
              automationEligible: true,
            },
          }),
        ],
      }),
    });
    const service = new RetentionExperimentsAdminService(prisma as never);

    await expect(service.start('biz-1', 'exp-1')).rejects.toThrow(
      'inactive incentive',
    );
  });

  it('refuses a benefit variant whose incentive is not automation-eligible', async () => {
    const prisma = makePrisma({
      experiment: experiment({
        variants: [
          variant({
            id: 'var-control',
            strategyType: RetentionStrategyType.CONTROL,
            allocationPercent: 15,
          }),
          variant({
            strategyType: RetentionStrategyType.SOFT_BENEFIT,
            allocationPercent: 85,
            incentiveDefinitionId: 'inc-1',
            incentiveDefinition: {
              id: 'inc-1',
              active: true,
              automationEligible: false,
            },
          }),
        ],
      }),
    });
    const service = new RetentionExperimentsAdminService(prisma as never);

    await expect(service.start('biz-1', 'exp-1')).rejects.toThrow(
      'not authorized for automation',
    );
  });

  it('refuses when the business is not on Check-in V2', async () => {
    const prisma = makePrisma({
      business: {
        experienceVersion: ExperienceVersion.LEGACY,
        retentionEngineV2Enabled: true,
      },
    });
    const service = new RetentionExperimentsAdminService(prisma as never);

    await expect(service.start('biz-1', 'exp-1')).rejects.toThrow(
      'not on Check-in V2',
    );
  });

  it('refuses when the platform disabled the engine for this business', async () => {
    const prisma = makePrisma({
      business: {
        experienceVersion: ExperienceVersion.CHECKIN_V2,
        retentionEngineV2Enabled: false,
      },
    });
    const service = new RetentionExperimentsAdminService(prisma as never);

    await expect(service.start('biz-1', 'exp-1')).rejects.toThrow(
      'disabled for this business',
    );
  });

  it('allows resuming from PAUSED', async () => {
    const prisma = makePrisma({
      experiment: experiment({ status: RetentionExperimentStatus.PAUSED }),
    });
    const service = new RetentionExperimentsAdminService(prisma as never);

    await service.start('biz-1', 'exp-1');

    expect(prisma.retentionExperiment.update).toHaveBeenCalled();
  });

  it('refuses to start an already COMPLETED experiment', async () => {
    const prisma = makePrisma({
      experiment: experiment({ status: RetentionExperimentStatus.COMPLETED }),
    });
    const service = new RetentionExperimentsAdminService(prisma as never);

    await expect(service.start('biz-1', 'exp-1')).rejects.toThrow(
      'Cannot start an experiment in status COMPLETED',
    );
  });
});

describe('RetentionExperimentsAdminService — pause/finish', () => {
  it('pauses a RUNNING experiment', async () => {
    const prisma = makePrisma({
      experiment: experiment({ status: RetentionExperimentStatus.RUNNING }),
    });
    const service = new RetentionExperimentsAdminService(prisma as never);

    await service.pause('biz-1', 'exp-1');

    expect(prisma.retentionExperiment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: RetentionExperimentStatus.PAUSED },
      }),
    );
  });

  it('refuses to pause a DRAFT experiment', async () => {
    const prisma = makePrisma();
    const service = new RetentionExperimentsAdminService(prisma as never);

    await expect(service.pause('biz-1', 'exp-1')).rejects.toThrow(
      'Only a RUNNING experiment can be paused',
    );
  });

  it('finishes from RUNNING', async () => {
    const prisma = makePrisma({
      experiment: experiment({ status: RetentionExperimentStatus.RUNNING }),
    });
    const service = new RetentionExperimentsAdminService(prisma as never);

    await service.finish('biz-1', 'exp-1');

    expect(prisma.retentionExperiment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: RetentionExperimentStatus.COMPLETED,
        }),
      }),
    );
  });

  it('refuses to finish an already COMPLETED experiment', async () => {
    const prisma = makePrisma({
      experiment: experiment({ status: RetentionExperimentStatus.COMPLETED }),
    });
    const service = new RetentionExperimentsAdminService(prisma as never);

    await expect(service.finish('biz-1', 'exp-1')).rejects.toThrow(
      'already COMPLETED',
    );
  });
});
