import {
  ExperienceVersion,
  OptimizationMode,
  RetentionExperimentStatus,
} from '@prisma/client';

/**
 * Fase G §5/§21/§22/§37 — every gate that must pass before an experiment's
 * allocation may change, gathered as facts by the service (mirroring
 * `eligibility.ts`'s own split between "gather" and "decide") so the
 * decision itself stays a pure, unit-testable function.
 */

export type OptimizationRejection =
  | 'BUSINESS_INACTIVE'
  | 'NOT_CHECKIN_V2'
  | 'ENGINE_DISABLED'
  | 'AUTOMATION_DISABLED'
  | 'OPTIMIZATION_OFF'
  | 'EXPERIMENT_NOT_RUNNING'
  | 'DRY_RUN'
  | 'NO_CONTROL'
  | 'INVALID_ALLOCATION'
  | 'COOLDOWN_ACTIVE'
  | 'EXPERIMENT_ENDING_SOON'
  | 'INSUFFICIENT_EXPOSURE_FOR_AUTOMATIC'
  | 'AUTOMATIC_MODE_REQUIRED'
  | 'OPTIMIZATION_AMBIGUOUS_WINNER';

export type OptimizationEligibility =
  | { eligible: true }
  | { eligible: false; reasonCode: OptimizationRejection };

export interface OptimizationEligibilityFacts {
  business: {
    isActive: boolean;
    experienceVersion: ExperienceVersion;
    retentionEngineV2Enabled: boolean;
  };
  settings: {
    automaticCampaignsEnabled: boolean;
    optimizationMode: OptimizationMode;
    optimizationCooldownHours: number;
  };
  experiment: {
    status: RetentionExperimentStatus;
    endAt: Date | null;
  };
  dryRunEnabled: boolean;
  hasControl: boolean;
  allocationSumsTo100: boolean;
  /** Most recent APPLIED run's `appliedAt` for this experiment, if any. */
  lastAppliedAt: Date | null;
  now: Date;
  /**
   * True only for the path that would actually WRITE a new allocation
   * (the AUTOMATIC worker, or a manual apply) — a manual PREVIEW is allowed
   * to compute and show a proposal even when some of these would block an
   * apply, so the owner can see "here's what's blocking this" (Fase G §27).
   */
  isWriteAttempt: boolean;
  /**
   * True only for the periodic AUTOMATIC worker (Fase G §26/§29) — a manual
   * apply (the owner clicking "Aplicar recomendación") is allowed in
   * ASSISTED mode too, since that IS what "assisted" means; only the
   * unattended worker requires the stronger AUTOMATIC mode.
   */
  requireAutomaticMode: boolean;
  /**
   * Fase G §37 — the floor CONTROL and the picked winner must both clear
   * before the unattended worker (requireAutomaticMode) may write. Already
   * resolved by the caller: `minimumExposedPerVariantForOptimization ??
   * minimumSampleSizeForRecommendations`.
   */
  requiredExposurePerVariantForAutomatic: number;
  controlExposedCount: number;
  /** Null when no winner was picked at all (NO_CONCLUSION) — nothing to gate here in that case. */
  winnerExposedCount: number | null;
  /**
   * Pre-piloto fix (§7/§8) — false means a winner was picked but does not
   * clearly beat the best remaining rival (`selectOptimizationObjective`'s
   * own return-rate z-test). Trivially true when no winner was picked.
   * Enforced only for the unattended worker (requireAutomaticMode) — same
   * asymmetry as `requiredExposurePerVariantForAutomatic`: a manual apply
   * already has a human deciding to click, which is its own safety valve.
   */
  clearWinner: boolean;
}

/** Days before `endAt` within which an experiment is "ending soon" — Fase G §5. */
const ENDING_SOON_DAYS = 2;
const MS_PER_HOUR = 3_600_000;

export function checkOptimizationEligibility(
  facts: OptimizationEligibilityFacts,
): OptimizationEligibility {
  if (!facts.business.isActive) {
    return { eligible: false, reasonCode: 'BUSINESS_INACTIVE' };
  }
  if (facts.business.experienceVersion !== ExperienceVersion.CHECKIN_V2) {
    return { eligible: false, reasonCode: 'NOT_CHECKIN_V2' };
  }
  if (!facts.business.retentionEngineV2Enabled) {
    return { eligible: false, reasonCode: 'ENGINE_DISABLED' };
  }
  if (!facts.settings.automaticCampaignsEnabled) {
    return { eligible: false, reasonCode: 'AUTOMATION_DISABLED' };
  }
  if (facts.settings.optimizationMode === OptimizationMode.OFF) {
    return { eligible: false, reasonCode: 'OPTIMIZATION_OFF' };
  }
  if (facts.experiment.status !== RetentionExperimentStatus.RUNNING) {
    return { eligible: false, reasonCode: 'EXPERIMENT_NOT_RUNNING' };
  }

  // Below this point, only a WRITE attempt (apply/automatic) is blocked — a
  // preview may still be computed and shown, explaining exactly why it
  // could not be applied.
  if (!facts.isWriteAttempt) return { eligible: true };

  if (
    facts.requireAutomaticMode &&
    facts.settings.optimizationMode !== OptimizationMode.AUTOMATIC
  ) {
    return { eligible: false, reasonCode: 'AUTOMATIC_MODE_REQUIRED' };
  }
  if (
    facts.requireAutomaticMode &&
    facts.winnerExposedCount !== null &&
    (facts.controlExposedCount < facts.requiredExposurePerVariantForAutomatic ||
      facts.winnerExposedCount < facts.requiredExposurePerVariantForAutomatic)
  ) {
    return {
      eligible: false,
      reasonCode: 'INSUFFICIENT_EXPOSURE_FOR_AUTOMATIC',
    };
  }
  if (facts.requireAutomaticMode && !facts.clearWinner) {
    return { eligible: false, reasonCode: 'OPTIMIZATION_AMBIGUOUS_WINNER' };
  }
  if (facts.dryRunEnabled) {
    return { eligible: false, reasonCode: 'DRY_RUN' };
  }
  if (!facts.hasControl) {
    return { eligible: false, reasonCode: 'NO_CONTROL' };
  }
  if (!facts.allocationSumsTo100) {
    return { eligible: false, reasonCode: 'INVALID_ALLOCATION' };
  }
  if (
    facts.experiment.endAt &&
    facts.experiment.endAt.getTime() - facts.now.getTime() <
      ENDING_SOON_DAYS * 86_400_000
  ) {
    return { eligible: false, reasonCode: 'EXPERIMENT_ENDING_SOON' };
  }
  if (facts.lastAppliedAt) {
    const hoursSince =
      (facts.now.getTime() - facts.lastAppliedAt.getTime()) / MS_PER_HOUR;
    if (hoursSince < facts.settings.optimizationCooldownHours) {
      return { eligible: false, reasonCode: 'COOLDOWN_ACTIVE' };
    }
  }

  return { eligible: true };
}
