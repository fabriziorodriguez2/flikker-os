import { diagnose } from './simulation-diagnosis';
import type { SimulationResult } from './simulation-results.service';
import type { InvariantCheckResult } from './simulation-invariants.service';

function makeInvariant(
  overrides: Partial<InvariantCheckResult> = {},
): InvariantCheckResult {
  return {
    code: 'SOME_CHECK',
    status: 'PASS',
    message: 'ok',
    critical: false,
    ...overrides,
  };
}

function makeResult(
  overrides: Partial<SimulationResult> = {},
): SimulationResult {
  return {
    customersCreated: 100,
    physicalReturns: 100,
    visibleReturns: 90,
    checkinVisibilityRate: 0.9,
    reviewPrompts: 90,
    reviewClicks: 20,
    rewardGoalsCreated: 5,
    rewardGoalsUnlocked: 2,
    rewardGoalsRedeemed: 1,
    retentionAssignments: 50,
    controlAssignments: 15,
    messagesSent: 30,
    messagesDelivered: 28,
    messagesRead: 20,
    messagesFailed: 2,
    optimizationRunsApplied: 0,
    optimizationRunsSkipped: 5,
    initialAllocation: {
      CONTROL: 15,
      REMINDER: 30,
      PROGRESS_REMINDER: 30,
      SOFT_BENEFIT: 25,
    },
    finalAllocation: {
      CONTROL: 15,
      REMINDER: 30,
      PROGRESS_REMINDER: 30,
      SOFT_BENEFIT: 25,
    },
    returnRateByVariant: {
      REMINDER: 0.2,
      PROGRESS_REMINDER: 0.25,
      SOFT_BENEFIT: 0.3,
    },
    estimatedEffectByVariant: {
      REMINDER: 5,
      PROGRESS_REMINDER: 8,
      SOFT_BENEFIT: 10,
    },
    trueEffectByVariant: {
      REMINDER: 0.05,
      PROGRESS_REMINDER: 0.08,
      SOFT_BENEFIT: 0.1,
    },
    trueWinner: 'SOFT_BENEFIT',
    detectedWinner: { kind: 'BEST_RETURN_RATE', variantId: 'v-1' },
    winnerAccuracy: 'CORRECT',
    returnWinner: 'SOFT_BENEFIT',
    detectedReturnWinner: 'SOFT_BENEFIT',
    returnWinnerAccuracy: 'CORRECT',
    economicWinner: null,
    detectedEconomicWinner: null,
    economicWinnerAccuracy: 'NO_CONCLUSION',
    optimizationObjectiveUsed: 'RETURN',
    promotionalCost: 1000,
    estimatedIncrementalRevenue: 5000,
    trueIncrementalRevenue: 4800,
    estimationErrorPercent: 4.2,
    aiCalls: 0,
    invariantResults: [makeInvariant()],
    durationMs: 500,
    ...overrides,
  };
}

describe('diagnose — §29/§30/§31: deterministic overall status + pilot readiness', () => {
  it('a fully clean run is PASS / PILOT_READY with no warnings or recommendations', () => {
    const diagnosis = diagnose(makeResult());
    expect(diagnosis.overallStatus).toBe('PASS');
    expect(diagnosis.pilotReadiness).toBe('PILOT_READY');
    expect(diagnosis.warnings).toEqual([]);
    expect(diagnosis.failures).toEqual([]);
    expect(diagnosis.recommendations).toEqual([]);
  });

  it('a critical invariant FAIL forces FAIL / NOT_READY', () => {
    const diagnosis = diagnose(
      makeResult({
        invariantResults: [
          makeInvariant({
            code: 'SIMULATION_DATABASE_ISOLATED',
            status: 'FAIL',
            critical: true,
            message: 'connected to the wrong database',
          }),
        ],
      }),
    );
    expect(diagnosis.overallStatus).toBe('FAIL');
    expect(diagnosis.pilotReadiness).toBe('NOT_READY');
    expect(diagnosis.failures).toHaveLength(1);
    expect(diagnosis.recommendations).toContainEqual(
      expect.stringContaining('connected to the wrong database'),
    );
  });

  it('a NON-critical invariant FAIL degrades to PASS_WITH_WARNINGS, never all the way to FAIL', () => {
    const diagnosis = diagnose(
      makeResult({
        invariantResults: [
          makeInvariant({
            code: 'MAX_ONE_ACTIVE_REWARD_GOAL_PER_CUSTOMER',
            status: 'FAIL',
            critical: false,
            message: 'one customer has two active goals',
          }),
        ],
      }),
    );
    expect(diagnosis.overallStatus).toBe('PASS_WITH_WARNINGS');
    expect(diagnosis.pilotReadiness).toBe('PILOT_READY_WITH_WARNINGS');
  });

  it('low check-in visibility adds a warning and a recommendation, never a FAIL', () => {
    const diagnosis = diagnose(makeResult({ checkinVisibilityRate: 0.2 }));
    expect(diagnosis.overallStatus).toBe('PASS_WITH_WARNINGS');
    expect(diagnosis.pilotReadiness).toBe('PILOT_READY_WITH_WARNINGS');
    expect(diagnosis.warnings.map((w) => w.code)).toContain(
      'LOW_CHECKIN_VISIBILITY',
    );
    expect(diagnosis.recommendations.length).toBeGreaterThan(0);
  });

  it('high estimation error adds a warning and a recommendation', () => {
    const diagnosis = diagnose(makeResult({ estimationErrorPercent: 55 }));
    expect(diagnosis.warnings.map((w) => w.code)).toContain(
      'HIGH_ESTIMATION_ERROR',
    );
    expect(diagnosis.overallStatus).toBe('PASS_WITH_WARNINGS');
  });

  it('a null estimationErrorPercent never triggers the high-error warning', () => {
    const diagnosis = diagnose(makeResult({ estimationErrorPercent: null }));
    expect(diagnosis.warnings.map((w) => w.code)).not.toContain(
      'HIGH_ESTIMATION_ERROR',
    );
  });

  it('an INCORRECT winner adds a warning and a recommendation', () => {
    const diagnosis = diagnose(makeResult({ winnerAccuracy: 'INCORRECT' }));
    expect(diagnosis.warnings.map((w) => w.code)).toContain(
      'INCORRECT_WINNER_DETECTED',
    );
    expect(diagnosis.overallStatus).toBe('PASS_WITH_WARNINGS');
  });

  it('§23: NO_CONCLUSION never adds a warning or degrades the status — only a recommendation', () => {
    const diagnosis = diagnose(makeResult({ winnerAccuracy: 'NO_CONCLUSION' }));
    expect(diagnosis.warnings).toEqual([]);
    expect(diagnosis.overallStatus).toBe('PASS');
    expect(diagnosis.pilotReadiness).toBe('PILOT_READY');
    expect(diagnosis.recommendations.length).toBeGreaterThan(0);
  });

  it('CORRECT winner accuracy adds neither a warning nor a recommendation about it', () => {
    const diagnosis = diagnose(makeResult({ winnerAccuracy: 'CORRECT' }));
    expect(diagnosis.warnings).toEqual([]);
    expect(diagnosis.recommendations).toEqual([]);
  });

  it('combines multiple issues into one diagnosis without losing any of them', () => {
    const diagnosis = diagnose(
      makeResult({
        checkinVisibilityRate: 0.1,
        estimationErrorPercent: 90,
        winnerAccuracy: 'INCORRECT',
        invariantResults: [
          makeInvariant({
            code: 'SIMULATION_DATABASE_ISOLATED',
            status: 'FAIL',
            critical: true,
          }),
        ],
      }),
    );
    expect(diagnosis.overallStatus).toBe('FAIL');
    expect(diagnosis.pilotReadiness).toBe('NOT_READY');
    expect(diagnosis.warnings).toHaveLength(3);
    expect(diagnosis.failures).toHaveLength(1);
    expect(diagnosis.recommendations.length).toBeGreaterThanOrEqual(4);
  });
});
