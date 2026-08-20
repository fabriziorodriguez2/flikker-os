/**
 * Pura aritmética del embudo de reactivación: "X contactados → Y volvieron →
 * Z% de recuperación". Mismo espíritu que `experiment-metrics.ts` — el query
 * a la base vive en `reactivation-funnel.service.ts`, esto solo recibe
 * counts ya armados y nunca necesita una DB para testear.
 */
import {
  average,
  evidenceState,
  type EvidenceState,
} from './experiment-metrics';

export interface FunnelCounts {
  contacted: number;
  returned: number;
  /** `RetentionOutcome.daysToReturn` de cada outcome con `returned: true`. */
  daysToReturnSamples: number[];
}

export interface FunnelStats {
  contacted: number;
  returned: number;
  /** `returned / contacted` — 0 cuando `contacted` es 0, nunca NaN. */
  recoveryRate: number;
  averageDaysToReturn: number | null;
  evidenceState: EvidenceState;
}

export function computeFunnelStats(
  counts: FunnelCounts,
  minimumSampleSizeForRecommendations: number,
): FunnelStats {
  return {
    contacted: counts.contacted,
    returned: counts.returned,
    recoveryRate: counts.contacted > 0 ? counts.returned / counts.contacted : 0,
    averageDaysToReturn: average(counts.daysToReturnSamples),
    evidenceState: evidenceState(
      counts.contacted,
      minimumSampleSizeForRecommendations,
    ),
  };
}

export interface ReactivationFunnelResult {
  overall: FunnelStats;
  /**
   * `null` cuando cualquiera de los dos brazos todavía no tiene volumen
   * suficiente — nunca se muestra una comparación con un lado en
   * INSUFFICIENT_DATA (mismo criterio que `determineWinner` en
   * `experiment-metrics.ts`: no hay conclusión posible sin evidencia de los
   * dos lados).
   */
  byArm: { reminderOnly: FunnelStats; withBenefit: FunnelStats } | null;
}

export function computeReactivationFunnel(
  overall: FunnelCounts,
  reminderOnly: FunnelCounts,
  withBenefit: FunnelCounts,
  minimumSampleSizeForRecommendations: number,
): ReactivationFunnelResult {
  const overallStats = computeFunnelStats(
    overall,
    minimumSampleSizeForRecommendations,
  );
  const reminderStats = computeFunnelStats(
    reminderOnly,
    minimumSampleSizeForRecommendations,
  );
  const benefitStats = computeFunnelStats(
    withBenefit,
    minimumSampleSizeForRecommendations,
  );

  const bothHaveEvidence =
    reminderStats.evidenceState !== 'INSUFFICIENT_DATA' &&
    benefitStats.evidenceState !== 'INSUFFICIENT_DATA';

  return {
    overall: overallStats,
    byArm: bothHaveEvidence
      ? { reminderOnly: reminderStats, withBenefit: benefitStats }
      : null,
  };
}
