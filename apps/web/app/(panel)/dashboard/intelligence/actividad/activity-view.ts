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
