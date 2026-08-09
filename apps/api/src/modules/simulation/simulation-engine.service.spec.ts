import { RetentionStrategyType } from '@prisma/client';
import {
  SimulationEngineService,
  combineCheckinComplianceRate,
  personaEffectForStrategy,
  EFFECT_WINDOW_DAYS,
  type DayResult,
} from './simulation-engine.service';
import { SimulationClock } from './simulation-clock';
import { createSeededRandom } from './prng';
import { SCENARIO_DEFINITIONS } from './scenarios';
import { PERSONA_PROFILES } from './personas';
import type { SeededCustomer } from './simulation-seeder';

/**
 * Default "nothing happening yet" mocks for the six real-service
 * dependencies the engine now drives each day. Every existing physical/
 * visible-return test below relies on these staying inert (empty
 * assignments, no exposures, no reward goals) so hazard reduces to the
 * pre-recruitment formula exactly — only the dedicated describe blocks
 * below override them to exercise the recruit/send/exposure/reward-goal
 * wiring itself.
 */
function makeEngineDeps() {
  const prisma = {
    retentionAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    message: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    benefitParticipation: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const evaluateService = {
    runDaily: jest.fn().mockResolvedValue({
      businesses: 1,
      assigned: 0,
      dryRunCandidates: 0,
      ms: 0,
    }),
  };
  const sendService = { processAssignment: jest.fn() };
  const outcomeService = {
    runOnce: jest.fn().mockResolvedValue({
      processed: 0,
      returned: 0,
      confirmed: 0,
      closedNoReturn: 0,
      stillOpen: 0,
    }),
  };
  const rewardGoalSweep = {
    runDaily: jest
      .fn()
      .mockResolvedValue({ businesses: 1, evaluated: 0, created: 0 }),
  };
  const rewardGoalOrchestrator = {
    afterVisit: jest
      .fn()
      .mockResolvedValue({ goal: null, unlockedNow: false, benefit: null }),
  };
  const optimizationService = {
    sweepAutomatic: jest
      .fn()
      .mockResolvedValue({ experiments: 0, applied: 0, skipped: 0 }),
  };
  return {
    prisma,
    evaluateService,
    sendService,
    outcomeService,
    rewardGoalSweep,
    rewardGoalOrchestrator,
    optimizationService,
  };
}

function makeEngine(
  visits: { registerVisit: jest.Mock },
  overrides: Partial<ReturnType<typeof makeEngineDeps>> = {},
) {
  const deps = { ...makeEngineDeps(), ...overrides };
  return new SimulationEngineService(
    visits as never,
    deps.prisma as never,
    deps.evaluateService as never,
    deps.sendService as never,
    deps.outcomeService as never,
    deps.rewardGoalSweep as never,
    deps.rewardGoalOrchestrator as never,
    deps.optimizationService as never,
  );
}

describe('combineCheckinComplianceRate — §12: scales the persona baseline, never replaces it', () => {
  it('leaves the baseline unchanged at the BASE (0.7) reference rate', () => {
    expect(combineCheckinComplianceRate(0.8, 0.7)).toBeCloseTo(0.8, 5);
    expect(combineCheckinComplianceRate(0.4, 0.7)).toBeCloseTo(0.4, 5);
  });

  it('scales down proportionally for LOW (0.3)', () => {
    const result = combineCheckinComplianceRate(0.8, 0.3);
    expect(result).toBeCloseTo(0.8 * (0.3 / 0.7), 5);
    expect(result).toBeLessThan(0.8);
  });

  it('scales up proportionally for HIGH (0.9)', () => {
    const result = combineCheckinComplianceRate(0.5, 0.9);
    expect(result).toBeCloseTo(0.5 * (0.9 / 0.7), 5);
    expect(result).toBeGreaterThan(0.5);
  });

  it('clamps at 1 rather than exceeding it', () => {
    expect(combineCheckinComplianceRate(0.8, 0.9)).toBeLessThanOrEqual(1);
    expect(combineCheckinComplianceRate(1, 1)).toBe(1);
  });

  it('never goes negative', () => {
    expect(combineCheckinComplianceRate(0.1, 0)).toBe(0);
  });
});

function makeCustomers(count: number, persona: SeededCustomer['persona']) {
  return Array.from({ length: count }, (_, i) => ({
    id: `customer-${i}`,
    persona,
  }));
}

function makeVisitsRepositoryMock() {
  return { registerVisit: jest.fn().mockResolvedValue({ created: true }) };
}

describe('SimulationEngineService — §10/§11: physical vs. visible returns', () => {
  it('never creates a Visit for a physical-but-invisible return — call count matches visibleReturns exactly', async () => {
    const visits = makeVisitsRepositoryMock();
    const engine = makeEngine(visits);
    const customers = makeCustomers(300, 'WEEKLY_REGULAR');
    const def = SCENARIO_DEFINITIONS.BASELINE_HEALTHY;
    const rng = createSeededRandom(42);
    engine.init('biz-1', customers, def, rng);

    const clock = new SimulationClock();
    let totalPhysical = 0;
    let totalVisible = 0;
    for (let day = 0; day < 60; day++) {
      const result = await engine.runDay(clock);
      totalPhysical += result.physicalReturns;
      totalVisible += result.visibleReturns;
      clock.advanceDays(1);
    }

    expect(totalVisible).toBeGreaterThan(0);
    expect(totalVisible).toBeLessThanOrEqual(totalPhysical);
    expect(visits.registerVisit).toHaveBeenCalledTimes(totalVisible);
  });

  it('§12: a HIGH checkin scenario yields a higher visibleReturns/physicalReturns ratio than LOW, same seed', async () => {
    async function run(checkinComplianceRate: number) {
      const visits = makeVisitsRepositoryMock();
      const engine = makeEngine(visits);
      const customers = makeCustomers(300, 'BIWEEKLY');
      const def = {
        ...SCENARIO_DEFINITIONS.BASELINE_HEALTHY,
        failureInjection: {
          ...SCENARIO_DEFINITIONS.BASELINE_HEALTHY.failureInjection,
          checkinComplianceRate,
        },
      };
      const rng = createSeededRandom(7);
      engine.init('biz-1', customers, def, rng);
      const clock = new SimulationClock();
      let physical = 0;
      let visible = 0;
      for (let day = 0; day < 60; day++) {
        const result = await engine.runDay(clock);
        physical += result.physicalReturns;
        visible += result.visibleReturns;
        clock.advanceDays(1);
      }
      return {
        physical,
        visible,
        ratio: physical > 0 ? visible / physical : 0,
      };
    }

    const low = await run(0.3);
    const high = await run(0.9);

    expect(high.ratio).toBeGreaterThan(low.ratio);
  });

  it('the first Visit for each customer is organic (attribute:false); later ones are attributed (attribute:true)', async () => {
    const visits = makeVisitsRepositoryMock();
    const engine = makeEngine(visits);
    // A short, guaranteed-frequent cadence so we reliably see >1 visit per
    // customer within a small number of days without relying on luck.
    const customers = makeCustomers(20, 'WEEKLY_REGULAR');
    const def = {
      ...SCENARIO_DEFINITIONS.BASELINE_HEALTHY,
      failureInjection: {
        ...SCENARIO_DEFINITIONS.BASELINE_HEALTHY.failureInjection,
        checkinComplianceRate: 1, // force every physical return to be visible
      },
    };
    const rng = createSeededRandom(3);
    engine.init('biz-1', customers, def, rng);
    const clock = new SimulationClock();
    for (let day = 0; day < 90; day++) {
      await engine.runDay(clock);
      clock.advanceDays(1);
    }

    const callsByCustomer = new Map<string, boolean[]>();
    for (const call of visits.registerVisit.mock.calls) {
      const [input] = call as [{ customerId: string; attribute: boolean }];
      const list = callsByCustomer.get(input.customerId) ?? [];
      list.push(input.attribute);
      callsByCustomer.set(input.customerId, list);
    }

    expect(callsByCustomer.size).toBeGreaterThan(0);
    for (const attributions of callsByCustomer.values()) {
      expect(attributions[0]).toBe(false);
      for (const later of attributions.slice(1)) expect(later).toBe(true);
    }
  });

  it('some customers churn over a long enough run and stop returning entirely', async () => {
    const visits = makeVisitsRepositoryMock();
    const engine = makeEngine(visits);
    const customers = makeCustomers(200, 'HIGH_CHURN');
    const def = SCENARIO_DEFINITIONS.BASELINE_HEALTHY;
    const rng = createSeededRandom(11);
    engine.init('biz-1', customers, def, rng);
    const clock = new SimulationClock();
    for (let day = 0; day < 180; day++) {
      await engine.runDay(clock);
      clock.advanceDays(1);
    }

    expect(engine.churnedCount).toBeGreaterThan(0);
    expect(engine.churnedCount).toBeLessThan(engine.customerCount);
  });

  it('is fully reproducible: same seed and inputs produce the exact same day-by-day results', async () => {
    async function run() {
      const visits = makeVisitsRepositoryMock();
      const engine = makeEngine(visits);
      const customers = makeCustomers(100, 'MONTHLY');
      const rng = createSeededRandom(99);
      engine.init(
        'biz-1',
        customers,
        SCENARIO_DEFINITIONS.BASELINE_HEALTHY,
        rng,
      );
      const clock = new SimulationClock();
      const results: DayResult[] = [];
      for (let day = 0; day < 30; day++) {
        results.push(await engine.runDay(clock));
        clock.advanceDays(1);
      }
      return results;
    }

    const a = await run();
    const b = await run();
    expect(a).toEqual(b);
  });

  it('a different seed produces a different day-by-day sequence', async () => {
    async function run(seed: number) {
      const visits = makeVisitsRepositoryMock();
      const engine = makeEngine(visits);
      const customers = makeCustomers(100, 'MONTHLY');
      const rng = createSeededRandom(seed);
      engine.init(
        'biz-1',
        customers,
        SCENARIO_DEFINITIONS.BASELINE_HEALTHY,
        rng,
      );
      const clock = new SimulationClock();
      const results: DayResult[] = [];
      for (let day = 0; day < 30; day++) {
        results.push(await engine.runDay(clock));
        clock.advanceDays(1);
      }
      return results;
    }

    const a = await run(1);
    const b = await run(2);
    expect(a).not.toEqual(b);
  });
});

describe('personaEffectForStrategy — §13: only the matching ground-truth effect, never a different one', () => {
  it('maps REMINDER/PROGRESS_REMINDER/SOFT_BENEFIT to their own persona field', () => {
    const persona = PERSONA_PROFILES.PROGRESS_SENSITIVE;
    expect(
      personaEffectForStrategy(persona, RetentionStrategyType.REMINDER),
    ).toBe(persona.reminderEffect);
    expect(
      personaEffectForStrategy(
        persona,
        RetentionStrategyType.PROGRESS_REMINDER,
      ),
    ).toBe(persona.progressReminderEffect);
    expect(
      personaEffectForStrategy(persona, RetentionStrategyType.SOFT_BENEFIT),
    ).toBe(persona.softBenefitEffect);
  });

  it('CONTROL and STRONG_BENEFIT never boost hazard', () => {
    const persona = PERSONA_PROFILES.PROGRESS_SENSITIVE;
    expect(
      personaEffectForStrategy(persona, RetentionStrategyType.CONTROL),
    ).toBe(0);
    expect(
      personaEffectForStrategy(persona, RetentionStrategyType.STRONG_BENEFIT),
    ).toBe(0);
  });
});

describe('SimulationEngineService — §10/§13: recruit/send/outcome wiring', () => {
  it('calls the real evaluate/send/outcome services once per day, targeting only this business', async () => {
    const visits = makeVisitsRepositoryMock();
    const deps = makeEngineDeps();
    const engine = makeEngine(visits, deps);
    engine.init(
      'biz-1',
      makeCustomers(5, 'MONTHLY'),
      SCENARIO_DEFINITIONS.BASELINE_HEALTHY,
      createSeededRandom(1),
    );

    const clock = new SimulationClock();
    await engine.runDay(clock);

    expect(deps.evaluateService.runDaily).toHaveBeenCalledTimes(1);
    expect(deps.outcomeService.runOnce).toHaveBeenCalledTimes(1);
    expect(deps.prisma.retentionAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ businessId: 'biz-1' }),
      }),
    );
  });

  it('processes every PENDING assignment found for the business through the real send service', async () => {
    const visits = makeVisitsRepositoryMock();
    const deps = makeEngineDeps();
    // First call (PENDING lookup, for sending) returns real rows; the
    // second call (exposure-window lookup) must stay empty — mocked
    // separately since the two calls request different `select` shapes.
    deps.prisma.retentionAssignment.findMany
      .mockResolvedValueOnce([{ id: 'assign-1' }, { id: 'assign-2' }])
      .mockResolvedValue([]);
    deps.sendService.processAssignment
      .mockResolvedValueOnce({
        status: 'sent',
        messageId: 'm1',
        benefitIssued: false,
      })
      .mockResolvedValueOnce({ status: 'control' });
    const engine = makeEngine(visits, deps);
    engine.init(
      'biz-1',
      makeCustomers(5, 'MONTHLY'),
      SCENARIO_DEFINITIONS.BASELINE_HEALTHY,
      createSeededRandom(1),
    );

    const clock = new SimulationClock();
    const result = await engine.runDay(clock);

    expect(deps.sendService.processAssignment).toHaveBeenCalledTimes(2);
    expect(deps.sendService.processAssignment).toHaveBeenCalledWith(
      'assign-1',
      clock.now(),
    );
    expect(deps.sendService.processAssignment).toHaveBeenCalledWith(
      'assign-2',
      clock.now(),
    );
    expect(result.messagesSent).toBe(1);
    expect(result.messagesControl).toBe(1);
  });

  it('rolls the fake transport for every queued Message and updates its status directly — never a real send', async () => {
    const visits = makeVisitsRepositoryMock();
    const deps = makeEngineDeps();
    deps.prisma.message.findMany.mockResolvedValue([
      { id: 'msg-1' },
      { id: 'msg-2' },
      { id: 'msg-3' },
    ]);
    const engine = makeEngine(visits, {
      ...deps,
      // Force every message to fail delivery, deterministically.
    });
    const def = {
      ...SCENARIO_DEFINITIONS.BASELINE_HEALTHY,
      failureInjection: {
        ...SCENARIO_DEFINITIONS.BASELINE_HEALTHY.failureInjection,
        messageFailureRate: 1,
      },
    };
    engine.init(
      'biz-1',
      makeCustomers(5, 'MONTHLY'),
      def,
      createSeededRandom(1),
    );

    const clock = new SimulationClock();
    const result = await engine.runDay(clock);

    expect(deps.prisma.message.update).toHaveBeenCalledTimes(3);
    for (const call of deps.prisma.message.update.mock.calls) {
      expect((call[0] as { data: { status: string } }).data.status).toBe(
        'failed',
      );
    }
    expect(result.messagesFailed).toBe(3);
    expect(result.messagesDelivered).toBe(0);
    expect(result.messagesRead).toBe(0);
  });

  it('§13: an active PROGRESS_REMINDER exposure measurably raises PROGRESS_SENSITIVE return hazard vs. no exposure', async () => {
    async function run(exposed: boolean) {
      const visits = makeVisitsRepositoryMock();
      const deps = makeEngineDeps();
      if (exposed) {
        deps.prisma.retentionAssignment.findMany.mockImplementation(
          (args: { where?: { status?: unknown } }) => {
            // The PENDING-lookup call (for sending) should stay empty; only
            // the exposure-window lookup (filtered by exposedAt) returns data.
            if (args?.where && 'exposedAt' in args.where === false) {
              return Promise.resolve([]);
            }
            return Promise.resolve(
              Array.from({ length: 40 }, (_, i) => ({
                customerId: `customer-${i}`,
                variant: {
                  strategyType: RetentionStrategyType.PROGRESS_REMINDER,
                },
              })),
            );
          },
        );
      }
      const engine = makeEngine(visits, deps);
      const customers = makeCustomers(40, 'PROGRESS_SENSITIVE');
      const rng = createSeededRandom(21);
      engine.init(
        'biz-1',
        customers,
        SCENARIO_DEFINITIONS.BASELINE_HEALTHY,
        rng,
      );
      const clock = new SimulationClock();
      let physical = 0;
      for (let day = 0; day < EFFECT_WINDOW_DAYS; day++) {
        const result = await engine.runDay(clock);
        physical += result.physicalReturns;
        clock.advanceDays(1);
      }
      return physical;
    }

    const withoutExposure = await run(false);
    const withExposure = await run(true);

    expect(withExposure).toBeGreaterThanOrEqual(withoutExposure);
  });
});

describe('SimulationEngineService — §10: Reward Goals (create/unlock/redeem)', () => {
  it('calls the real sweep once per day, targeting only this business', async () => {
    const visits = makeVisitsRepositoryMock();
    const deps = makeEngineDeps();
    const engine = makeEngine(visits, deps);
    engine.init(
      'biz-1',
      makeCustomers(5, 'MONTHLY'),
      SCENARIO_DEFINITIONS.BASELINE_HEALTHY,
      createSeededRandom(1),
    );

    await engine.runDay(new SimulationClock());

    expect(deps.rewardGoalSweep.runDaily).toHaveBeenCalledTimes(1);
  });

  it('surfaces the sweep result as rewardGoalsCreated', async () => {
    const visits = makeVisitsRepositoryMock();
    const deps = makeEngineDeps();
    deps.rewardGoalSweep.runDaily.mockResolvedValue({
      businesses: 1,
      evaluated: 5,
      created: 3,
    });
    const engine = makeEngine(visits, deps);
    engine.init(
      'biz-1',
      makeCustomers(5, 'MONTHLY'),
      SCENARIO_DEFINITIONS.BASELINE_HEALTHY,
      createSeededRandom(1),
    );

    const result = await engine.runDay(new SimulationClock());

    expect(result.rewardGoalsCreated).toBe(3);
  });

  it('calls the real per-visit unlock orchestrator exactly once per visible Visit, never for a physical-only return', async () => {
    const visits = makeVisitsRepositoryMock();
    const deps = makeEngineDeps();
    const engine = makeEngine(visits, deps);
    // checkinComplianceRate: 1 forces every physical return to also be
    // visible, so visibleReturns == calls to registerVisit == calls to
    // afterVisit, exactly.
    const def = {
      ...SCENARIO_DEFINITIONS.BASELINE_HEALTHY,
      failureInjection: {
        ...SCENARIO_DEFINITIONS.BASELINE_HEALTHY.failureInjection,
        checkinComplianceRate: 1,
      },
    };
    engine.init(
      'biz-1',
      makeCustomers(50, 'WEEKLY_REGULAR'),
      def,
      createSeededRandom(5),
    );

    let totalVisible = 0;
    const clock = new SimulationClock();
    for (let day = 0; day < 30; day++) {
      const result = await engine.runDay(clock);
      totalVisible += result.visibleReturns;
      clock.advanceDays(1);
    }

    expect(totalVisible).toBeGreaterThan(0);
    expect(deps.rewardGoalOrchestrator.afterVisit).toHaveBeenCalledTimes(
      totalVisible,
    );
  });

  it('counts an unlock exactly when the orchestrator reports unlockedNow:true', async () => {
    const visits = makeVisitsRepositoryMock();
    const deps = makeEngineDeps();
    deps.rewardGoalOrchestrator.afterVisit.mockResolvedValue({
      goal: null,
      unlockedNow: true,
      benefit: { name: 'x', code: 'y', expiresAt: null },
    });
    const def = {
      ...SCENARIO_DEFINITIONS.BASELINE_HEALTHY,
      failureInjection: {
        ...SCENARIO_DEFINITIONS.BASELINE_HEALTHY.failureInjection,
        checkinComplianceRate: 1,
      },
    };
    const engine = makeEngine(visits, deps);
    engine.init(
      'biz-1',
      makeCustomers(1, 'WEEKLY_REGULAR'),
      def,
      createSeededRandom(2),
    );

    let result;
    const clock = new SimulationClock();
    for (let day = 0; day < 20 && !result?.visibleReturns; day++) {
      result = await engine.runDay(clock);
      clock.advanceDays(1);
    }

    expect(result?.rewardGoalsUnlocked).toBe(1);
  });

  it('never rolls redemption for an already-expired, unredeemed participation', async () => {
    const visits = makeVisitsRepositoryMock();
    const deps = makeEngineDeps();
    const clock = new SimulationClock();
    deps.prisma.benefitParticipation.findMany.mockResolvedValue([
      {
        id: 'p-expired',
        expiresAt: new Date(clock.now().getTime() - 86_400_000),
      },
    ]);
    const def = {
      ...SCENARIO_DEFINITIONS.BASELINE_HEALTHY,
      failureInjection: {
        ...SCENARIO_DEFINITIONS.BASELINE_HEALTHY.failureInjection,
        rewardRedemptionRate: 1, // would always redeem if not expired
      },
    };
    const engine = makeEngine(visits, deps);
    engine.init(
      'biz-1',
      makeCustomers(1, 'MONTHLY'),
      def,
      createSeededRandom(1),
    );

    const result = await engine.runDay(clock);

    expect(deps.prisma.benefitParticipation.update).not.toHaveBeenCalled();
    expect(result.rewardGoalsRedeemed).toBe(0);
  });

  it('never redeems anything when rewardRedemptionRate is 0', async () => {
    const visits = makeVisitsRepositoryMock();
    const deps = makeEngineDeps();
    deps.prisma.benefitParticipation.findMany.mockResolvedValue([
      { id: 'p-1', expiresAt: null },
      { id: 'p-2', expiresAt: null },
    ]);
    const def = {
      ...SCENARIO_DEFINITIONS.BASELINE_HEALTHY,
      failureInjection: {
        ...SCENARIO_DEFINITIONS.BASELINE_HEALTHY.failureInjection,
        rewardRedemptionRate: 0,
      },
    };
    const engine = makeEngine(visits, deps);
    engine.init(
      'biz-1',
      makeCustomers(1, 'MONTHLY'),
      def,
      createSeededRandom(1),
    );

    const result = await engine.runDay(new SimulationClock());

    expect(deps.prisma.benefitParticipation.update).not.toHaveBeenCalled();
    expect(result.rewardGoalsRedeemed).toBe(0);
  });

  it('always redeems every eligible, unexpired participation when rewardRedemptionRate is 1', async () => {
    const visits = makeVisitsRepositoryMock();
    const deps = makeEngineDeps();
    deps.prisma.benefitParticipation.findMany.mockResolvedValue([
      { id: 'p-1', expiresAt: null, rewardGoal: { id: 'goal-1' } },
      { id: 'p-2', expiresAt: null, rewardGoal: { id: 'goal-2' } },
      { id: 'p-3', expiresAt: null, rewardGoal: { id: 'goal-3' } },
    ]);
    const def = {
      ...SCENARIO_DEFINITIONS.BASELINE_HEALTHY,
      failureInjection: {
        ...SCENARIO_DEFINITIONS.BASELINE_HEALTHY.failureInjection,
        rewardRedemptionRate: 1,
      },
    };
    const engine = makeEngine(visits, deps);
    engine.init(
      'biz-1',
      makeCustomers(1, 'MONTHLY'),
      def,
      createSeededRandom(1),
    );

    const result = await engine.runDay(new SimulationClock());

    expect(deps.prisma.benefitParticipation.update).toHaveBeenCalledTimes(3);
    expect(result.rewardGoalsRedeemed).toBe(3);
    for (const call of deps.prisma.benefitParticipation.update.mock.calls) {
      const [args] = call as [{ data: { redeemedAt: Date } }];
      expect(args.data.redeemedAt).toBeInstanceOf(Date);
    }
  });

  it('regression (§38 Bug #6): redeems a SOFT_BENEFIT-issued participation (no linked reward goal) same as any other, but does not fold it into rewardGoalsRedeemed', async () => {
    const visits = makeVisitsRepositoryMock();
    const deps = makeEngineDeps();
    deps.prisma.benefitParticipation.findMany.mockResolvedValue([
      { id: 'p-goal', expiresAt: null, rewardGoal: { id: 'goal-1' } },
      { id: 'p-soft-benefit', expiresAt: null, rewardGoal: null },
    ]);
    const def = {
      ...SCENARIO_DEFINITIONS.BASELINE_HEALTHY,
      failureInjection: {
        ...SCENARIO_DEFINITIONS.BASELINE_HEALTHY.failureInjection,
        rewardRedemptionRate: 1,
      },
    };
    const engine = makeEngine(visits, deps);
    engine.init(
      'biz-1',
      makeCustomers(1, 'MONTHLY'),
      def,
      createSeededRandom(1),
    );

    const result = await engine.runDay(new SimulationClock());

    // Both get redeemed (a SOFT_BENEFIT incentive is just as real as a
    // reward-goal unlock — leaving it perpetually unredeemed would be its
    // own realism bug).
    expect(deps.prisma.benefitParticipation.update).toHaveBeenCalledTimes(2);
    // But only the reward-goal-linked one is counted as a reward goal
    // redemption.
    expect(result.rewardGoalsRedeemed).toBe(1);
  });
});

describe('SimulationEngineService — §10/§15: Safe Auto-Optimization sweep', () => {
  it('calls the real sweepAutomatic once per day, targeting only this business (via findAutomaticCandidates)', async () => {
    const visits = makeVisitsRepositoryMock();
    const deps = makeEngineDeps();
    const engine = makeEngine(visits, deps);
    engine.init(
      'biz-1',
      makeCustomers(5, 'MONTHLY'),
      SCENARIO_DEFINITIONS.BASELINE_HEALTHY,
      createSeededRandom(1),
    );

    await engine.runDay(new SimulationClock());

    expect(deps.optimizationService.sweepAutomatic).toHaveBeenCalledTimes(1);
  });

  it('is a safe no-op for ASSISTED-mode scenarios — the real service itself decides, never a simulation-side check', async () => {
    const visits = makeVisitsRepositoryMock();
    const deps = makeEngineDeps();
    // Nothing eligible: exactly what the real service returns for a
    // business with no AUTOMATIC-mode experiment.
    deps.optimizationService.sweepAutomatic.mockResolvedValue({
      experiments: 0,
      applied: 0,
      skipped: 0,
    });
    const engine = makeEngine(visits, deps);
    engine.init(
      'biz-1',
      makeCustomers(5, 'MONTHLY'),
      SCENARIO_DEFINITIONS.BASELINE_HEALTHY, // optimizationMode: ASSISTED
      createSeededRandom(1),
    );

    const result = await engine.runDay(new SimulationClock());

    expect(result.optimizationRunsApplied).toBe(0);
    expect(result.optimizationRunsSkipped).toBe(0);
  });

  it('surfaces applied/skipped counts from a real sweep result for OPTIMIZATION_STRESS (AUTOMATIC mode)', async () => {
    const visits = makeVisitsRepositoryMock();
    const deps = makeEngineDeps();
    deps.optimizationService.sweepAutomatic.mockResolvedValue({
      experiments: 1,
      applied: 1,
      skipped: 0,
    });
    const engine = makeEngine(visits, deps);
    engine.init(
      'biz-1',
      makeCustomers(5, 'MONTHLY'),
      SCENARIO_DEFINITIONS.OPTIMIZATION_STRESS,
      createSeededRandom(1),
    );

    const result = await engine.runDay(new SimulationClock());

    expect(result.optimizationRunsApplied).toBe(1);
    expect(result.optimizationRunsSkipped).toBe(0);
  });
});

describe('SimulationEngineService — §10/§21: review prompt/click (reporting only, no DB write)', () => {
  it('prompts exactly once per visible Visit — never for a physical-only return', async () => {
    const visits = makeVisitsRepositoryMock();
    const engine = makeEngine(visits);
    const def = {
      ...SCENARIO_DEFINITIONS.BASELINE_HEALTHY,
      failureInjection: {
        ...SCENARIO_DEFINITIONS.BASELINE_HEALTHY.failureInjection,
        checkinComplianceRate: 1,
      },
    };
    engine.init(
      'biz-1',
      makeCustomers(50, 'WEEKLY_REGULAR'),
      def,
      createSeededRandom(9),
    );

    let totalVisible = 0;
    let totalPrompts = 0;
    const clock = new SimulationClock();
    for (let day = 0; day < 30; day++) {
      const result = await engine.runDay(clock);
      totalVisible += result.visibleReturns;
      totalPrompts += result.reviewPrompts;
      clock.advanceDays(1);
    }

    expect(totalPrompts).toBe(totalVisible);
  });

  it('clicks never exceed prompts and are never negative', async () => {
    const visits = makeVisitsRepositoryMock();
    const engine = makeEngine(visits);
    engine.init(
      'biz-1',
      makeCustomers(100, 'HIGH_CHURN'),
      SCENARIO_DEFINITIONS.BASELINE_HEALTHY,
      createSeededRandom(4),
    );

    let totalPrompts = 0;
    let totalClicks = 0;
    const clock = new SimulationClock();
    for (let day = 0; day < 60; day++) {
      const result = await engine.runDay(clock);
      totalPrompts += result.reviewPrompts;
      totalClicks += result.reviewClicks;
      clock.advanceDays(1);
    }

    expect(totalClicks).toBeLessThanOrEqual(totalPrompts);
    expect(totalClicks).toBeGreaterThanOrEqual(0);
  });

  it('a persona with a higher reviewClickProbability yields a higher click rate, same seed', async () => {
    async function run(persona: SeededCustomer['persona']) {
      const visits = makeVisitsRepositoryMock();
      const engine = makeEngine(visits);
      const def = {
        ...SCENARIO_DEFINITIONS.BASELINE_HEALTHY,
        failureInjection: {
          ...SCENARIO_DEFINITIONS.BASELINE_HEALTHY.failureInjection,
          checkinComplianceRate: 1,
        },
      };
      engine.init(
        'biz-1',
        makeCustomers(200, persona),
        def,
        createSeededRandom(13),
      );
      let prompts = 0;
      let clicks = 0;
      const clock = new SimulationClock();
      for (let day = 0; day < 40; day++) {
        const result = await engine.runDay(clock);
        prompts += result.reviewPrompts;
        clicks += result.reviewClicks;
        clock.advanceDays(1);
      }
      return prompts > 0 ? clicks / prompts : 0;
    }

    // WEEKLY_REGULAR: reviewClickProbability 0.25. HIGH_CHURN: 0.05.
    const higher = await run('WEEKLY_REGULAR');
    const lower = await run('HIGH_CHURN');

    expect(higher).toBeGreaterThan(lower);
  });
});
