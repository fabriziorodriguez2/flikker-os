import type { InvariantCheckResult } from './simulation-invariants.service';
import type { SimulationResult } from './simulation-results.service';

export type OverallStatus = 'PASS' | 'PASS_WITH_WARNINGS' | 'FAIL';
export type PilotReadiness =
  | 'PILOT_READY'
  | 'PILOT_READY_WITH_WARNINGS'
  | 'NOT_READY';

export interface DiagnosisWarning {
  code: string;
  message: string;
}

export interface SimulationDiagnosis {
  overallStatus: OverallStatus;
  pilotReadiness: PilotReadiness;
  /** The invariant FAILs that drove this diagnosis, kept for display. */
  failures: InvariantCheckResult[];
  warnings: DiagnosisWarning[];
  /** Deterministic — never AI-generated (§32). */
  recommendations: string[];
}

const LOW_VISIBILITY_THRESHOLD = 0.5;
const HIGH_ESTIMATION_ERROR_THRESHOLD_PERCENT = 30;

/**
 * Simulation Center §29/§30/§31/§32 — the deterministic diagnosis, computed
 * purely from a single run's `SimulationResult` (its `invariantResults`
 * included). No AI is needed or used for any of this (§32).
 *
 * §31's exact rule this follows: only a `critical` invariant FAIL (safety
 * invariant failure, budget exceeded, real provider contacted, optimization
 * floor violated — everything `SimulationInvariantService` marks
 * `critical: true`) forces `FAIL`/`NOT_READY`. A non-critical FAIL, or any
 * of the warning conditions below, degrades the run to
 * `PASS_WITH_WARNINGS`/`PILOT_READY_WITH_WARNINGS` — never all the way to
 * FAIL on its own. `NO_CONCLUSION` is never treated as a problem on its own
 * (§23) — it earns a recommendation, never a warning or a status downgrade.
 */
export function diagnose(result: SimulationResult): SimulationDiagnosis {
  const failures = result.invariantResults.filter((r) => r.status === 'FAIL');
  const warnings: DiagnosisWarning[] = [];
  const recommendations: string[] = [];

  if (result.checkinVisibilityRate < LOW_VISIBILITY_THRESHOLD) {
    const percent = (result.checkinVisibilityRate * 100).toFixed(1);
    warnings.push({
      code: 'LOW_CHECKIN_VISIBILITY',
      message: `Solo el ${percent}% de los retornos físicos se registraron como check-in — Flikker ve una porción menor de la realidad.`,
    });
    recommendations.push(
      'Reforzar la comunicación del check-in (cartel/QR más visible, recordatorio en el momento) — la visibilidad baja degrada la confianza de cualquier métrica de retorno.',
    );
  }

  if (
    result.estimationErrorPercent !== null &&
    result.estimationErrorPercent > HIGH_ESTIMATION_ERROR_THRESHOLD_PERCENT
  ) {
    warnings.push({
      code: 'HIGH_ESTIMATION_ERROR',
      message: `El error de estimación de revenue incremental es del ${result.estimationErrorPercent.toFixed(1)}%.`,
    });
    recommendations.push(
      'Tratar las proyecciones económicas de este experimento como orientativas, no exactas, hasta acumular más muestra.',
    );
  }

  if (result.winnerAccuracy === 'INCORRECT') {
    warnings.push({
      code: 'INCORRECT_WINNER_DETECTED',
      message:
        'Flikker detectó un ganador distinto al verdadero en esta simulación.',
    });
    recommendations.push(
      'Revisar el tamaño de muestra mínimo y el umbral de significancia antes de confiar en la optimización automática para este tipo de negocio/escenario.',
    );
  } else if (result.winnerAccuracy === 'NO_CONCLUSION') {
    recommendations.push(
      'Sin conclusión estadística todavía — es el comportamiento correcto con muestra chica; no forzar una decisión.',
    );
  }

  for (const failure of failures) {
    recommendations.push(
      `Corregir antes de un piloto real: ${failure.message}`,
    );
  }

  const hasCriticalFailure = failures.some((f) => f.critical);
  const hasAnyIssue = failures.length > 0 || warnings.length > 0;

  const overallStatus: OverallStatus = hasCriticalFailure
    ? 'FAIL'
    : hasAnyIssue
      ? 'PASS_WITH_WARNINGS'
      : 'PASS';

  const pilotReadiness: PilotReadiness = hasCriticalFailure
    ? 'NOT_READY'
    : hasAnyIssue
      ? 'PILOT_READY_WITH_WARNINGS'
      : 'PILOT_READY';

  return { overallStatus, pilotReadiness, failures, warnings, recommendations };
}
