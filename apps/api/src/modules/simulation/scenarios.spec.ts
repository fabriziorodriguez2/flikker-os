import {
  OptimizationMode,
  RetentionObjective,
  SimulationScenario,
} from '@prisma/client';
import {
  DEFAULT_EXPERIMENT_ALLOCATION,
  SCENARIO_DEFINITIONS,
  getScenarioDefinition,
  resolveScenarioDefinition,
} from './scenarios';
import { PERSONA_PROFILES, type PersonaType } from './personas';

const ALL_SCENARIOS = Object.values(SimulationScenario);

/** Population-weighted average of a persona effect field under a given mix. */
function weightedEffect(
  mix: Record<PersonaType, number>,
  field: 'reminderEffect' | 'softBenefitEffect' | 'progressReminderEffect',
): number {
  return (Object.keys(mix) as PersonaType[]).reduce(
    (sum, type) => sum + mix[type] * PERSONA_PROFILES[type][field],
    0,
  );
}

describe('SCENARIO_DEFINITIONS — §6: one complete config per scenario, no gaps', () => {
  it('defines exactly the 15 scenarios in the SimulationScenario enum, no more, no less', () => {
    expect(Object.keys(SCENARIO_DEFINITIONS).sort()).toEqual(
      [...ALL_SCENARIOS].sort(),
    );
    expect(ALL_SCENARIOS).toHaveLength(15);
  });

  it('every scenario has a self-consistent `scenario` field matching its key', () => {
    for (const key of ALL_SCENARIOS) {
      expect(SCENARIO_DEFINITIONS[key].scenario).toBe(key);
    }
  });

  it('every scenario has positive days/customerCount and a non-empty description', () => {
    for (const def of Object.values(SCENARIO_DEFINITIONS)) {
      expect(def.days).toBeGreaterThan(0);
      expect(def.customerCount).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(10);
      expect(Number.isInteger(def.seed)).toBe(true);
    }
  });

  it('§17: every scenario caps AI calls, even scenarios that default AI off', () => {
    for (const def of Object.values(SCENARIO_DEFINITIONS)) {
      expect(def.maxAiCallsDefault).toBeGreaterThan(0);
      expect(def.maxAiCallsDefault).toBeLessThanOrEqual(20);
    }
  });

  it('every experiment allocation sums to exactly 100 and includes CONTROL', () => {
    for (const def of Object.values(SCENARIO_DEFINITIONS)) {
      const total = Object.values(def.experimentAllocation).reduce(
        (sum, v) => sum + v,
        0,
      );
      expect(total).toBe(100);
      expect(def.experimentAllocation.CONTROL).toBeGreaterThan(0);
    }
  });

  it('every persona mix sums to 1 (within floating-point tolerance)', () => {
    for (const def of Object.values(SCENARIO_DEFINITIONS)) {
      const total = Object.values(def.personaMix).reduce(
        (sum, v) => sum + v,
        0,
      );
      expect(total).toBeCloseTo(1, 5);
    }
  });

  it('every failure-injection rate is a valid [0, 1] value', () => {
    for (const def of Object.values(SCENARIO_DEFINITIONS)) {
      for (const field of [
        'aiFailureRate',
        'messageFailureRate',
        'checkinComplianceRate',
        'rewardRedemptionRate',
      ] as const) {
        expect(def.failureInjection[field]).toBeGreaterThanOrEqual(0);
        expect(def.failureInjection[field]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('every scenario has at least one incentive and CHECKIN_V2 business flags on', () => {
    for (const def of Object.values(SCENARIO_DEFINITIONS)) {
      expect(def.incentives.length).toBeGreaterThan(0);
      expect(def.business.retentionEngineV2Enabled).toBe(true);
    }
  });
});

describe('BASELINE_HEALTHY — exact defaults from §7', () => {
  const def = SCENARIO_DEFINITIONS.BASELINE_HEALTHY;

  it('matches every literal default the request specifies', () => {
    expect(def.days).toBe(60);
    expect(def.customerCount).toBe(500);
    expect(def.seed).toBe(42);
    expect(def.business.averageTicketAmount).toBe(600);
    expect(def.business.estimatedMarginPercent).toBe(60);
    expect(def.business.automaticCampaignsEnabled).toBe(true);
    expect(def.business.rewardGoalsEnabled).toBe(true);
    expect(def.experimentAllocation).toEqual(DEFAULT_EXPERIMENT_ALLOCATION);
  });

  it('optimizationMode defaults to ASSISTED but is configurable to AUTOMATIC (run A, §38)', () => {
    expect(def.business.optimizationMode).toBe(OptimizationMode.ASSISTED);
  });

  it('carries exactly the three fictitious incentives from §7', () => {
    expect(def.incentives.map((i) => i.code).sort()).toEqual(
      ['FREE_SMALL_ITEM', 'PERCENT_OFF_10', 'UPGRADE'].sort(),
    );
  });
});

describe('LOW/HIGH_CHECKIN_COMPLIANCE — §12 exact rates', () => {
  it('LOW is 0.3 and HIGH is 0.9, both otherwise identical to baseline', () => {
    const low = SCENARIO_DEFINITIONS.LOW_CHECKIN_COMPLIANCE;
    const high = SCENARIO_DEFINITIONS.HIGH_CHECKIN_COMPLIANCE;
    expect(low.failureInjection.checkinComplianceRate).toBe(0.3);
    expect(high.failureInjection.checkinComplianceRate).toBe(0.9);
    expect(low.experimentAllocation).toEqual(DEFAULT_EXPERIMENT_ALLOCATION);
    expect(high.experimentAllocation).toEqual(DEFAULT_EXPERIMENT_ALLOCATION);
  });
});

describe('PROMO_SENSITIVE / PROGRESS_SENSITIVE / HIGH_CHURN — population actually skewed', () => {
  it('PROMO_SENSITIVE is dominated by the PROMOTION_SENSITIVE persona', () => {
    const mix = SCENARIO_DEFINITIONS.PROMO_SENSITIVE.personaMix;
    expect(mix.PROMOTION_SENSITIVE).toBeGreaterThan(0.4);
  });

  it('PROGRESS_SENSITIVE is dominated by the PROGRESS_SENSITIVE persona', () => {
    const mix = SCENARIO_DEFINITIONS.PROGRESS_SENSITIVE.personaMix;
    expect(mix.PROGRESS_SENSITIVE).toBeGreaterThan(0.4);
  });

  it('HIGH_CHURN is dominated by HIGH_CHURN/IRREGULAR/NEW combined', () => {
    const mix = SCENARIO_DEFINITIONS.HIGH_CHURN.personaMix;
    expect(mix.HIGH_CHURN + mix.IRREGULAR + mix.NEW).toBeGreaterThan(0.6);
  });
});

describe('LOW_BUDGET — deliberately tight caps', () => {
  it('sets both monthly caps to real, tight numbers', () => {
    const caps = SCENARIO_DEFINITIONS.LOW_BUDGET.business.budgetCaps;
    expect(caps.maxAutomatedIncentivesPerMonth).not.toBeNull();
    expect(caps.maxEstimatedIncentiveCostPerMonth).not.toBeNull();
    expect(caps.maxAutomatedIncentivesPerMonth!).toBeLessThan(100);
  });
});

describe('AI_PROVIDER_FAILURE — §19/§38 run E exact defaults', () => {
  const def = SCENARIO_DEFINITIONS.AI_PROVIDER_FAILURE;

  it('defaults to withAi=true, 30 days, 100 customers, always-failing AI', () => {
    expect(def.withAiDefault).toBe(true);
    expect(def.days).toBe(30);
    expect(def.customerCount).toBe(100);
    expect(def.failureInjection.aiFailureRate).toBe(1);
    expect(def.maxAiCallsDefault).toBeLessThanOrEqual(20);
  });
});

describe('MESSAGE_PROVIDER_FAILURE — always-failing WhatsApp transport', () => {
  it('sets messageFailureRate to 1', () => {
    expect(
      SCENARIO_DEFINITIONS.MESSAGE_PROVIDER_FAILURE.failureInjection
        .messageFailureRate,
    ).toBe(1);
  });
});

describe('OPTIMIZATION_STRESS — AUTOMATIC mode, larger scale', () => {
  it('runs optimizationMode=AUTOMATIC unattended', () => {
    const def = SCENARIO_DEFINITIONS.OPTIMIZATION_STRESS;
    expect(def.business.optimizationMode).toBe(OptimizationMode.AUTOMATIC);
    expect(def.customerCount).toBeGreaterThanOrEqual(500);
  });
});

describe('getScenarioDefinition', () => {
  it('returns the exact same definition object as the map for every scenario', () => {
    for (const key of ALL_SCENARIOS) {
      expect(getScenarioDefinition(key)).toBe(SCENARIO_DEFINITIONS[key]);
    }
  });
});

describe('resolveScenarioDefinition — §25/§3: overrides merge onto defaults, clamped to limits', () => {
  const limits = { maxDays: 90, maxCustomers: 1000 };

  it('falls back entirely to the scenario defaults with no overrides', () => {
    const resolved = resolveScenarioDefinition('BASELINE_HEALTHY', {}, limits);
    expect(resolved).toEqual(SCENARIO_DEFINITIONS.BASELINE_HEALTHY);
  });

  it('applies every override field', () => {
    const resolved = resolveScenarioDefinition(
      'BASELINE_HEALTHY',
      {
        days: 30,
        customerCount: 200,
        seed: 99,
        withAi: true,
        optimizationMode: OptimizationMode.AUTOMATIC,
        checkinComplianceRate: 0.5,
        aiFailureRate: 0.2,
        messageFailureRate: 0.1,
        rewardRedemptionRate: 0.9,
      },
      limits,
    );
    expect(resolved.days).toBe(30);
    expect(resolved.customerCount).toBe(200);
    expect(resolved.seed).toBe(99);
    expect(resolved.withAiDefault).toBe(true);
    expect(resolved.business.optimizationMode).toBe(OptimizationMode.AUTOMATIC);
    expect(resolved.failureInjection.checkinComplianceRate).toBe(0.5);
    expect(resolved.failureInjection.aiFailureRate).toBe(0.2);
    expect(resolved.failureInjection.messageFailureRate).toBe(0.1);
    expect(resolved.failureInjection.rewardRedemptionRate).toBe(0.9);
  });

  it('clamps an override days above the configured max down to the max — never silently ignored, never exceeded', () => {
    const resolved = resolveScenarioDefinition(
      'BASELINE_HEALTHY',
      { days: 500 },
      { maxDays: 90, maxCustomers: 1000 },
    );
    expect(resolved.days).toBe(90);
  });

  it('clamps an override customerCount above the configured max down to the max', () => {
    const resolved = resolveScenarioDefinition(
      'BASELINE_HEALTHY',
      { customerCount: 5000 },
      { maxDays: 90, maxCustomers: 1000 },
    );
    expect(resolved.customerCount).toBe(1000);
  });

  it('also clamps the scenario default itself if it exceeds a stricter configured max', () => {
    const resolved = resolveScenarioDefinition(
      'OPTIMIZATION_STRESS', // default days=90, customerCount=1000
      {},
      { maxDays: 30, maxCustomers: 200 },
    );
    expect(resolved.days).toBe(30);
    expect(resolved.customerCount).toBe(200);
  });

  it('never mutates the original scenario definition object', () => {
    const before = JSON.stringify(SCENARIO_DEFINITIONS.BASELINE_HEALTHY);
    resolveScenarioDefinition(
      'BASELINE_HEALTHY',
      { days: 10, customerCount: 5 },
      limits,
    );
    expect(JSON.stringify(SCENARIO_DEFINITIONS.BASELINE_HEALTHY)).toBe(before);
  });
});

describe('TWO_ARM_REMINDER / TWO_ARM_SOFT_BENEFIT — pre-piloto fix §13/§14: exactly two variants', () => {
  it('TWO_ARM_REMINDER is CONTROL 30 / REMINDER 70, nothing else', () => {
    const alloc = SCENARIO_DEFINITIONS.TWO_ARM_REMINDER.experimentAllocation;
    expect(alloc).toEqual({ CONTROL: 30, REMINDER: 70 });
    expect(alloc.SOFT_BENEFIT).toBeUndefined();
    expect(alloc.PROGRESS_REMINDER).toBeUndefined();
  });

  it('TWO_ARM_SOFT_BENEFIT is CONTROL 30 / SOFT_BENEFIT 70, with real incentive economics available', () => {
    const def = SCENARIO_DEFINITIONS.TWO_ARM_SOFT_BENEFIT;
    expect(def.experimentAllocation).toEqual({ CONTROL: 30, SOFT_BENEFIT: 70 });
    expect(def.incentives.length).toBeGreaterThan(0);
    expect(
      def.business.budgetCaps.maxAutomatedIncentivesPerMonth,
    ).not.toBeNull();
  });

  it('both default to AT_RISK_RECOVERY (no explicit objective override)', () => {
    expect(SCENARIO_DEFINITIONS.TWO_ARM_REMINDER.objective).toBeUndefined();
    expect(SCENARIO_DEFINITIONS.TWO_ARM_SOFT_BENEFIT.objective).toBeUndefined();
  });
});

describe('REWARD_PROGRESS — pre-piloto fix §15: REWARD_GOAL_PROGRESS objective, goal-based population', () => {
  const def = SCENARIO_DEFINITIONS.REWARD_PROGRESS;

  it('uses the REWARD_GOAL_PROGRESS objective explicitly', () => {
    expect(def.objective).toBe(RetentionObjective.REWARD_GOAL_PROGRESS);
  });

  it('allocates only CONTROL and PROGRESS_REMINDER — no REMINDER/SOFT_BENEFIT', () => {
    expect(def.experimentAllocation).toEqual({
      CONTROL: 30,
      PROGRESS_REMINDER: 70,
    });
  });
});

describe('NEAR_TIE / STRONG_SIGNAL — pre-piloto fix §16/§17: ground truth engineered before any run', () => {
  it('NEAR_TIE: REMINDER and SOFT_BENEFIT effects differ by less than 1 percentage point', () => {
    const mix = SCENARIO_DEFINITIONS.NEAR_TIE.personaMix;
    const gap = Math.abs(
      weightedEffect(mix, 'softBenefitEffect') -
        weightedEffect(mix, 'reminderEffect'),
    );
    expect(gap).toBeLessThan(0.01);
  });

  it('NEAR_TIE runs AUTOMATIC (that is the whole point — measuring restraint)', () => {
    expect(SCENARIO_DEFINITIONS.NEAR_TIE.business.optimizationMode).toBe(
      OptimizationMode.AUTOMATIC,
    );
  });

  it('STRONG_SIGNAL: SOFT_BENEFIT clearly dominates REMINDER (gap over 5 percentage points)', () => {
    const mix = SCENARIO_DEFINITIONS.STRONG_SIGNAL.personaMix;
    const gap =
      weightedEffect(mix, 'softBenefitEffect') -
      weightedEffect(mix, 'reminderEffect');
    expect(gap).toBeGreaterThan(0.05);
  });

  it('STRONG_SIGNAL runs AUTOMATIC and uses the larger 1000/90 scale', () => {
    const def = SCENARIO_DEFINITIONS.STRONG_SIGNAL;
    expect(def.business.optimizationMode).toBe(OptimizationMode.AUTOMATIC);
    expect(def.customerCount).toBe(1000);
    expect(def.days).toBe(90);
  });

  it('both default to the standard four-variant allocation (CONTROL/REMINDER/PROGRESS_REMINDER/SOFT_BENEFIT)', () => {
    expect(SCENARIO_DEFINITIONS.NEAR_TIE.experimentAllocation).toEqual(
      DEFAULT_EXPERIMENT_ALLOCATION,
    );
    expect(SCENARIO_DEFINITIONS.STRONG_SIGNAL.experimentAllocation).toEqual(
      DEFAULT_EXPERIMENT_ALLOCATION,
    );
  });
});
