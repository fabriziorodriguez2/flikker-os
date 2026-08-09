import {
  ExperienceVersion,
  OptimizationMode,
  RetentionExperimentStatus,
} from '@prisma/client';
import {
  checkOptimizationEligibility,
  type OptimizationEligibilityFacts,
} from './optimization-eligibility';

const NOW = new Date('2026-09-15T12:00:00.000Z');

function facts(
  overrides: Partial<OptimizationEligibilityFacts> = {},
): OptimizationEligibilityFacts {
  return {
    business: {
      isActive: true,
      experienceVersion: ExperienceVersion.CHECKIN_V2,
      retentionEngineV2Enabled: true,
    },
    settings: {
      automaticCampaignsEnabled: true,
      optimizationMode: OptimizationMode.AUTOMATIC,
      optimizationCooldownHours: 72,
    },
    experiment: { status: RetentionExperimentStatus.RUNNING, endAt: null },
    dryRunEnabled: false,
    hasControl: true,
    allocationSumsTo100: true,
    lastAppliedAt: null,
    now: NOW,
    isWriteAttempt: true,
    requireAutomaticMode: false,
    requiredExposurePerVariantForAutomatic: 30,
    controlExposedCount: 100,
    winnerExposedCount: 100,
    clearWinner: true,
    ...overrides,
  };
}

describe('checkOptimizationEligibility — Fase G §5: gates that block a WRITE', () => {
  it('allows when every condition is satisfied', () => {
    expect(checkOptimizationEligibility(facts())).toEqual({ eligible: true });
  });

  it('rejects an inactive business', () => {
    const result = checkOptimizationEligibility(
      facts({
        business: {
          isActive: false,
          experienceVersion: ExperienceVersion.CHECKIN_V2,
          retentionEngineV2Enabled: true,
        },
      }),
    );
    expect(result).toEqual({
      eligible: false,
      reasonCode: 'BUSINESS_INACTIVE',
    });
  });

  it('rejects a LEGACY business', () => {
    const result = checkOptimizationEligibility(
      facts({
        business: {
          isActive: true,
          experienceVersion: ExperienceVersion.LEGACY,
          retentionEngineV2Enabled: true,
        },
      }),
    );
    expect(result).toEqual({ eligible: false, reasonCode: 'NOT_CHECKIN_V2' });
  });

  it('rejects when Retention Engine V2 is disabled', () => {
    const result = checkOptimizationEligibility(
      facts({
        business: {
          isActive: true,
          experienceVersion: ExperienceVersion.CHECKIN_V2,
          retentionEngineV2Enabled: false,
        },
      }),
    );
    expect(result).toEqual({ eligible: false, reasonCode: 'ENGINE_DISABLED' });
  });

  it('rejects when automaticCampaignsEnabled is off', () => {
    const result = checkOptimizationEligibility(
      facts({
        settings: {
          automaticCampaignsEnabled: false,
          optimizationMode: OptimizationMode.AUTOMATIC,
          optimizationCooldownHours: 72,
        },
      }),
    );
    expect(result).toEqual({
      eligible: false,
      reasonCode: 'AUTOMATION_DISABLED',
    });
  });

  it('rejects when optimizationMode is OFF (Fase G §4/§39)', () => {
    const result = checkOptimizationEligibility(
      facts({
        settings: {
          automaticCampaignsEnabled: true,
          optimizationMode: OptimizationMode.OFF,
          optimizationCooldownHours: 72,
        },
      }),
    );
    expect(result).toEqual({ eligible: false, reasonCode: 'OPTIMIZATION_OFF' });
  });

  it('rejects a PAUSED experiment', () => {
    const result = checkOptimizationEligibility(
      facts({
        experiment: { status: RetentionExperimentStatus.PAUSED, endAt: null },
      }),
    );
    expect(result).toEqual({
      eligible: false,
      reasonCode: 'EXPERIMENT_NOT_RUNNING',
    });
  });

  it('rejects a DRAFT experiment', () => {
    const result = checkOptimizationEligibility(
      facts({
        experiment: { status: RetentionExperimentStatus.DRAFT, endAt: null },
      }),
    );
    expect(result.eligible).toBe(false);
  });

  it('rejects a COMPLETED experiment', () => {
    const result = checkOptimizationEligibility(
      facts({
        experiment: {
          status: RetentionExperimentStatus.COMPLETED,
          endAt: null,
        },
      }),
    );
    expect(result.eligible).toBe(false);
  });

  it('rejects when dry-run is enabled', () => {
    const result = checkOptimizationEligibility(facts({ dryRunEnabled: true }));
    expect(result).toEqual({ eligible: false, reasonCode: 'DRY_RUN' });
  });

  it('rejects when there is no CONTROL variant', () => {
    const result = checkOptimizationEligibility(facts({ hasControl: false }));
    expect(result).toEqual({ eligible: false, reasonCode: 'NO_CONTROL' });
  });

  it('rejects when the current allocation does not sum to 100', () => {
    const result = checkOptimizationEligibility(
      facts({ allocationSumsTo100: false }),
    );
    expect(result).toEqual({
      eligible: false,
      reasonCode: 'INVALID_ALLOCATION',
    });
  });

  it('rejects when the experiment ends within 2 days', () => {
    const result = checkOptimizationEligibility(
      facts({
        experiment: {
          status: RetentionExperimentStatus.RUNNING,
          endAt: new Date(NOW.getTime() + 86_400_000),
        },
      }),
    );
    expect(result).toEqual({
      eligible: false,
      reasonCode: 'EXPERIMENT_ENDING_SOON',
    });
  });

  it('allows when the experiment ends comfortably in the future', () => {
    const result = checkOptimizationEligibility(
      facts({
        experiment: {
          status: RetentionExperimentStatus.RUNNING,
          endAt: new Date(NOW.getTime() + 30 * 86_400_000),
        },
      }),
    );
    expect(result.eligible).toBe(true);
  });

  it('rejects while still inside the cooldown window', () => {
    const result = checkOptimizationEligibility(
      facts({ lastAppliedAt: new Date(NOW.getTime() - 10 * 3_600_000) }), // 10h ago, cooldown 72h
    );
    expect(result).toEqual({ eligible: false, reasonCode: 'COOLDOWN_ACTIVE' });
  });

  it('allows once the cooldown window has fully elapsed', () => {
    const result = checkOptimizationEligibility(
      facts({ lastAppliedAt: new Date(NOW.getTime() - 73 * 3_600_000) }), // 73h ago, cooldown 72h
    );
    expect(result.eligible).toBe(true);
  });
});

describe('checkOptimizationEligibility — Fase G §29: worker requires AUTOMATIC mode specifically', () => {
  it('rejects the automatic worker in ASSISTED mode — that mode only allows a manual apply', () => {
    const result = checkOptimizationEligibility(
      facts({
        settings: {
          automaticCampaignsEnabled: true,
          optimizationMode: OptimizationMode.ASSISTED,
          optimizationCooldownHours: 72,
        },
        requireAutomaticMode: true,
      }),
    );
    expect(result).toEqual({
      eligible: false,
      reasonCode: 'AUTOMATIC_MODE_REQUIRED',
    });
  });

  it('allows a manual apply in ASSISTED mode (requireAutomaticMode=false)', () => {
    const result = checkOptimizationEligibility(
      facts({
        settings: {
          automaticCampaignsEnabled: true,
          optimizationMode: OptimizationMode.ASSISTED,
          optimizationCooldownHours: 72,
        },
        requireAutomaticMode: false,
      }),
    );
    expect(result.eligible).toBe(true);
  });

  it('allows the automatic worker when mode is AUTOMATIC', () => {
    const result = checkOptimizationEligibility(
      facts({ requireAutomaticMode: true }),
    );
    expect(result.eligible).toBe(true);
  });
});

describe('checkOptimizationEligibility — Fase G §37: AUTOMATIC needs stricter exposure than a plain recommendation', () => {
  it('rejects the automatic worker when CONTROL has not reached the required exposure', () => {
    const result = checkOptimizationEligibility(
      facts({
        requireAutomaticMode: true,
        requiredExposurePerVariantForAutomatic: 30,
        controlExposedCount: 10,
        winnerExposedCount: 100,
      }),
    );
    expect(result).toEqual({
      eligible: false,
      reasonCode: 'INSUFFICIENT_EXPOSURE_FOR_AUTOMATIC',
    });
  });

  it('rejects the automatic worker when the WINNER has not reached the required exposure', () => {
    const result = checkOptimizationEligibility(
      facts({
        requireAutomaticMode: true,
        requiredExposurePerVariantForAutomatic: 30,
        controlExposedCount: 100,
        winnerExposedCount: 12,
      }),
    );
    expect(result).toEqual({
      eligible: false,
      reasonCode: 'INSUFFICIENT_EXPOSURE_FOR_AUTOMATIC',
    });
  });

  it('allows the automatic worker once both control and winner clear the required exposure', () => {
    const result = checkOptimizationEligibility(
      facts({
        requireAutomaticMode: true,
        requiredExposurePerVariantForAutomatic: 30,
        controlExposedCount: 30,
        winnerExposedCount: 30,
      }),
    );
    expect(result.eligible).toBe(true);
  });

  it('never applies this gate to a manual apply (requireAutomaticMode=false), even with thin exposure', () => {
    const result = checkOptimizationEligibility(
      facts({
        requireAutomaticMode: false,
        requiredExposurePerVariantForAutomatic: 30,
        controlExposedCount: 5,
        winnerExposedCount: 5,
      }),
    );
    expect(result.eligible).toBe(true);
  });

  it('never applies this gate when there is no winner picked at all (NO_CONCLUSION)', () => {
    const result = checkOptimizationEligibility(
      facts({
        requireAutomaticMode: true,
        requiredExposurePerVariantForAutomatic: 30,
        controlExposedCount: 100,
        winnerExposedCount: null,
      }),
    );
    expect(result.eligible).toBe(true);
  });
});

describe('checkOptimizationEligibility — pre-piloto fix (§7): AUTOMATIC never applies an ambiguous winner', () => {
  it('rejects the automatic worker when the pick is not clearly ahead of its runner-up', () => {
    const result = checkOptimizationEligibility(
      facts({ requireAutomaticMode: true, clearWinner: false }),
    );
    expect(result).toEqual({
      eligible: false,
      reasonCode: 'OPTIMIZATION_AMBIGUOUS_WINNER',
    });
  });

  it('allows the automatic worker once the pick clearly beats its runner-up', () => {
    const result = checkOptimizationEligibility(
      facts({ requireAutomaticMode: true, clearWinner: true }),
    );
    expect(result.eligible).toBe(true);
  });

  it('never applies this gate to a manual apply (requireAutomaticMode=false) — ASSISTED may still apply an ambiguous pick if the owner chooses to', () => {
    const result = checkOptimizationEligibility(
      facts({ requireAutomaticMode: false, clearWinner: false }),
    );
    expect(result.eligible).toBe(true);
  });

  it('never blocks a pure preview, even when ambiguous — the owner must still see the tentative pick', () => {
    const result = checkOptimizationEligibility(
      facts({ isWriteAttempt: false, clearWinner: false }),
    );
    expect(result.eligible).toBe(true);
  });
});

describe('checkOptimizationEligibility — Fase G §27: preview bypasses write-only gates', () => {
  it('allows a preview even during dry-run, cooldown, or a missing control (so it can explain why an apply would fail)', () => {
    const result = checkOptimizationEligibility(
      facts({
        isWriteAttempt: false,
        dryRunEnabled: true,
        hasControl: false,
        lastAppliedAt: new Date(NOW.getTime() - 3_600_000),
      }),
    );
    expect(result.eligible).toBe(true);
  });

  it('still rejects a preview when the experiment is not even RUNNING', () => {
    const result = checkOptimizationEligibility(
      facts({
        isWriteAttempt: false,
        experiment: { status: RetentionExperimentStatus.DRAFT, endAt: null },
      }),
    );
    expect(result.eligible).toBe(false);
  });

  it('still rejects a preview when optimizationMode is OFF', () => {
    const result = checkOptimizationEligibility(
      facts({
        isWriteAttempt: false,
        settings: {
          automaticCampaignsEnabled: true,
          optimizationMode: OptimizationMode.OFF,
          optimizationCooldownHours: 72,
        },
      }),
    );
    expect(result).toEqual({ eligible: false, reasonCode: 'OPTIMIZATION_OFF' });
  });
});
