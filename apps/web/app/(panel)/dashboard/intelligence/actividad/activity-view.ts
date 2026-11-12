/** Tipos y textos de "Actividad autónoma". Toda cifra viene de la API. */

export type AutonomyMode = "OFF" | "DRY_RUN" | "PILOT";
export type RunStatus =
  | "RUNNING"
  | "SIMULATED"
  | "EXECUTED"
  | "BLOCKED"
  | "NO_ACTION"
  | "FAILED";

export interface RunOpportunity {
  strategy: string;
  label: string;
  count: number;
  confidence: "BEHAVIORAL" | "EXPLICIT_RULE";
  executable: boolean;
  rationale: string;
}

export interface RunDiscarded {
  strategy: string;
  label: string;
  count: number;
  reason: string;
  detail: string;
}

export interface AutonomousRunView {
  id: string;
  day: string;
  mode: AutonomyMode;
  status: RunStatus;
  strategyLabel: string | null;
  incentiveLevel: number | null;
  opportunities: RunOpportunity[];
  discarded: RunDiscarded[];
  blockers: { code: string; message: string }[];
  explanation: string;
  suggestions: string[];
  plannedCount: number;
  assignedCount: number;
  estimatedCost: number | null;
  currency: string | null;
  /** RULES (reglas fijas) o PLANNER (planificador con IA). */
  engine?: "RULES" | "PLANNER";
  analysis?: PlannerAnalysis;
  plannerModel?: string | null;
  aiCostUsd?: number | null;
  metrics: {
    pending: number;
    sent: number;
    control: number;
    skipped: number;
    returnedTreated: number;
    returnedControl: number;
    redeemed: number;
    messagingCost: number | null;
  };
}

export interface ActivityView {
  mode: AutonomyMode;
  pilotGroupSize: number;
  plannerEnabled?: boolean;
  plannerExecutionEnabled?: boolean;
  runs: AutonomousRunView[];
}

export const MODE_LABELS: Record<AutonomyMode, { label: string; detail: string }> = {
  OFF: {
    label: "Apagado",
    detail: "Intelligence no busca oportunidades por su cuenta.",
  },
  DRY_RUN: {
    label: "Simulación",
    detail: "Todos los días busca oportunidades y deja anotado qué haría. No contacta a nadie.",
  },
  PILOT: {
    label: "Piloto",
    detail:
      "Elige una estrategia por día y suma un grupo chico a Autopilot, que les escribe dentro de tu política.",
  },
};

export const STATUS_LABELS: Record<RunStatus, string> = {
  RUNNING: "En curso",
  SIMULATED: "Simulada",
  EXECUTED: "Ejecutada",
  BLOCKED: "Frenada por la política",
  NO_ACTION: "Sin acciones",
  FAILED: "Falló",
};

export function confidenceLabel(c: RunOpportunity["confidence"]): string {
  return c === "BEHAVIORAL" ? "según la frecuencia de cada cliente" : "regla fija (pocos datos)";
}

export function incentiveLabel(level: number | null): string {
  if (level === 3) return "Incentivo del catálogo aprobado";
  if (level === 2) return "Progreso o beneficio ya ganado";
  return "Sin descuento";
}

/** "3 enviados · 1 volvió · 0 canjes" — o por qué todavía no hay números. */
export function resultLine(run: AutonomousRunView): string {
  if (run.mode !== "PILOT" || run.status !== "EXECUTED") return "—";
  const m = run.metrics;
  const parts = [
    `${m.sent} ${m.sent === 1 ? "enviado" : "enviados"}`,
    `${m.returnedTreated} ${m.returnedTreated === 1 ? "volvió" : "volvieron"}`,
    `${m.redeemed} ${m.redeemed === 1 ? "canje" : "canjes"}`,
  ];
  if (m.pending > 0) parts.push(`${m.pending} pendientes`);
  if (m.control > 0) parts.push(`${m.control} en grupo de control`);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Planificador con IA
// ---------------------------------------------------------------------------

export type PlanStatus =
  | "INVALID"
  | "DUPLICATE"
  | "INFEASIBLE"
  | "NOT_SELECTED"
  | "SIMULATED"
  | "EXECUTING"
  | "MEASURING"
  | "COMPLETED"
  | "STOPPED";

export interface Contactability {
  active: number;
  reachableWhatsapp: number;
  neverAsked: number;
  neverAskedVisitedLast30d: number;
  neverAskedWithMiFlikker: number;
  optedOut: number;
  suppressed: number;
  noPhone: number;
}

export interface PlannerAnalysis {
  observations?: string[];
  hypotheses?: { statement: string; metrics: string[] }[];
  decision?: "PROPOSE" | "NO_ACTION";
  noActionReason?: string | null;
  contactability?: Contactability;
}

export interface PlanResultsView {
  phase: "SENDING" | "MEASURING" | "COMPLETED";
  evidence: "NO_DATA" | "OBSERVED_ONLY" | "SIGNAL_ONLY" | "INCREMENTAL" | "NO_DIFFERENCE";
  /** Campaña exploratoria: sin grupo de control. */
  exploratory?: boolean;
  readout: string;
  treated: { contacted: number; returned: number; attributed: number; redeemed: number };
  control: { observed: number; returned: number };
  liftPoints: number | null;
  cost: { messages: number | null; incentivesRedeemed: number; total: number | null };
  optOuts: number;
}

export interface PlanView {
  id: string;
  status: PlanStatus;
  rank: number | null;
  title: string;
  objective: string;
  hypothesis: string;
  plan: {
    segment?: { description?: string };
    variants?: { key: string; message: string; incentiveId: string | null; weightPercent: number }[];
    controlPercent?: number;
    rationale?: string;
    successMetric?: { kind: string; windowDays: number };
  };
  issues: { code: string; message: string }[];
  selectionReason: string | null;
  matched: number | null;
  reachable: number | null;
  simulation: {
    recipients: number;
    treated: number;
    control: number;
    cost: { total: number };
    costKnown: boolean;
    exploratory?: boolean;
  } | null;
  results?: PlanResultsView | { assigned: number; recipients: number } | null;
  estimatedCost: number | null;
  currency: string | null;
}

export const PLAN_STATUS_LABELS: Record<PlanStatus, { label: string; tone: "ok" | "info" | "muted" | "warn" }> = {
  SIMULATED: { label: "Elegido (simulación)", tone: "info" },
  EXECUTING: { label: "En ejecución", tone: "ok" },
  MEASURING: { label: "Midiendo", tone: "ok" },
  COMPLETED: { label: "Terminado", tone: "ok" },
  STOPPED: { label: "Detenido", tone: "warn" },
  NOT_SELECTED: { label: "Considerado, no elegido", tone: "muted" },
  INFEASIBLE: { label: "No se pudo hacer", tone: "warn" },
  DUPLICATE: { label: "Repetido", tone: "muted" },
  INVALID: { label: "Descartado por las reglas", tone: "muted" },
};

export const EVIDENCE_LABELS: Record<PlanResultsView["evidence"], string> = {
  NO_DATA: "Sin datos todavía",
  OBSERVED_ONLY: "Exploratoria: lo observado, sin grupo de control",
  SIGNAL_ONLY: "Señal (muestra chica, sin prueba)",
  INCREMENTAL: "Evidencia: el plan sumó vueltas",
  NO_DIFFERENCE: "Sin diferencia con el grupo de control",
};

/** "De 105 clientes activos, 12 se pueden contactar por WhatsApp." */
export function contactabilityLines(c: Contactability): string[] {
  if (c.active === 0) return [];
  const lines = [
    `De ${c.active} clientes activos, ${c.reachableWhatsapp} se pueden contactar por WhatsApp.`,
  ];
  if (c.neverAsked) {
    lines.push(
      `${c.neverAsked} todavía no autorizaron promociones${
        c.neverAskedVisitedLast30d
          ? ` (${c.neverAskedVisitedLast30d} vinieron en los últimos 30 días: se les pregunta en su próximo check-in)`
          : ""
      }.`,
    );
  }
  if (c.optedOut) lines.push(`${c.optedOut} dijeron que no o se dieron de baja.`);
  if (c.suppressed) lines.push(`${c.suppressed} pidieron no ser contactados.`);
  if (c.noPhone) lines.push(`${c.noPhone} no tienen teléfono.`);
  return lines;
}

/** "35 entran en el segmento · 14 se pueden contactar". */
export function reachLine(plan: Pick<PlanView, "matched" | "reachable">): string {
  if (plan.matched === null) return "—";
  return `${plan.matched} entran en el segmento · ${plan.reachable ?? 0} se pueden contactar`;
}

/** "11 recibirían el mensaje · 3 en grupo de control · UYU 22". */
export function simulationLine(plan: Pick<PlanView, "simulation" | "currency">): string {
  const s = plan.simulation;
  if (!s) return "—";
  const cost = s.costKnown ? `${plan.currency ?? ""} ${s.cost.total}` : "costo desconocido";
  const control =
    s.exploratory || s.control === 0 ? "exploratoria, sin grupo de control" : `${s.control} en grupo de control`;
  return `${s.treated} ${s.treated === 1 ? "recibiría" : "recibirían"} el mensaje · ${control} · ${cost}`;
}

export function isMeasured(results: PlanView["results"]): results is PlanResultsView {
  return Boolean(results && typeof results === "object" && "evidence" in results);
}
