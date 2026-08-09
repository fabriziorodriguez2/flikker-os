/**
 * Simulation Center — types mirrored from the API (never a shared package;
 * this repo's own convention for panel-local API shapes, see
 * dashboard/retention-v2/types.ts).
 */

export type SimulationScenario =
  | "BASELINE_HEALTHY"
  | "LOW_CHECKIN_COMPLIANCE"
  | "HIGH_CHECKIN_COMPLIANCE"
  | "PROMO_SENSITIVE"
  | "PROGRESS_SENSITIVE"
  | "HIGH_CHURN"
  | "LOW_BUDGET"
  | "AI_PROVIDER_FAILURE"
  | "MESSAGE_PROVIDER_FAILURE"
  | "OPTIMIZATION_STRESS";

export type SimulationRunStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type OptimizationMode = "OFF" | "ASSISTED" | "AUTOMATIC";

export interface SimulationRunListItem {
  id: string;
  status: SimulationRunStatus;
  scenario: SimulationScenario;
  seed: number;
  days: number;
  customerCount: number;
  withAi: boolean;
  progress: number;
  currentVirtualDay: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  failureReason: string | null;
}

export interface InvariantCheckResult {
  code: string;
  status: "PASS" | "WARN" | "FAIL";
  message: string;
  critical: boolean;
}

export type WinnerAccuracy = "CORRECT" | "NO_CONCLUSION" | "INCORRECT";

export interface SimulationResult {
  customersCreated: number;
  physicalReturns: number;
  visibleReturns: number;
  checkinVisibilityRate: number;
  reviewPrompts: number;
  reviewClicks: number;
  rewardGoalsCreated: number;
  rewardGoalsUnlocked: number;
  rewardGoalsRedeemed: number;
  retentionAssignments: number;
  controlAssignments: number;
  messagesSent: number;
  messagesDelivered: number;
  messagesRead: number;
  messagesFailed: number;
  optimizationRunsApplied: number;
  optimizationRunsSkipped: number;
  initialAllocation: Record<string, number>;
  finalAllocation: Record<string, number>;
  returnRateByVariant: Record<string, number | null>;
  estimatedEffectByVariant: Record<string, number | null>;
  trueEffectByVariant: Record<string, number>;
  trueWinner: string | null;
  detectedWinner: { kind: string; variantId?: string; reason?: string };
  winnerAccuracy: WinnerAccuracy;
  promotionalCost: number;
  estimatedIncrementalRevenue: number;
  trueIncrementalRevenue: number;
  estimationErrorPercent: number | null;
  aiCalls: number;
  invariantResults: InvariantCheckResult[];
  durationMs: number;
}

export type OverallStatus = "PASS" | "PASS_WITH_WARNINGS" | "FAIL";
export type PilotReadiness =
  | "PILOT_READY"
  | "PILOT_READY_WITH_WARNINGS"
  | "NOT_READY";

export interface DiagnosisWarning {
  code: string;
  message: string;
}

export interface SimulationDiagnosis {
  overallStatus: OverallStatus;
  pilotReadiness: PilotReadiness;
  failures: InvariantCheckResult[];
  warnings: DiagnosisWarning[];
  recommendations: string[];
}

export interface SimulationRunDetail extends SimulationRunListItem {
  configuration: unknown;
  results: SimulationResult | null;
  summary: SimulationDiagnosis | null;
  cancelRequested: boolean;
}

export interface SimulationStatusResponse {
  available: boolean;
  enabled: boolean;
  databaseConfigured: boolean;
  unavailableReason: "DISABLED" | "DATABASE_NOT_CONFIGURED" | null;
  maxConcurrentRuns: number;
  maxCustomers: number;
  maxDays: number;
}

export const SCENARIO_LABEL: Record<SimulationScenario, string> = {
  BASELINE_HEALTHY: "Línea base saludable",
  LOW_CHECKIN_COMPLIANCE: "Check-in bajo (30%)",
  HIGH_CHECKIN_COMPLIANCE: "Check-in alto (90%)",
  PROMO_SENSITIVE: "Sensibles a promoción",
  PROGRESS_SENSITIVE: "Sensibles a progreso",
  HIGH_CHURN: "Alta caída de clientes",
  LOW_BUDGET: "Presupuesto ajustado",
  AI_PROVIDER_FAILURE: "Falla del proveedor de IA",
  MESSAGE_PROVIDER_FAILURE: "Falla del proveedor de WhatsApp",
  OPTIMIZATION_STRESS: "Estrés de optimización automática",
};

export const STATUS_LABEL: Record<SimulationRunStatus, string> = {
  PENDING: "Pendiente",
  RUNNING: "Corriendo",
  COMPLETED: "Completada",
  FAILED: "Falló",
  CANCELLED: "Cancelada",
};

export const VARIANT_LABEL: Record<string, string> = {
  CONTROL: "Control",
  REMINDER: "Recordatorio",
  PROGRESS_REMINDER: "Progreso",
  SOFT_BENEFIT: "Beneficio",
};

export function pct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toLocaleString("es-UY", { maximumFractionDigits: digits })}%`;
}

export function pp(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("es-UY", { maximumFractionDigits: 1 })} pp`;
}

export function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `$${Math.round(value).toLocaleString("es-UY")}`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-UY", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
