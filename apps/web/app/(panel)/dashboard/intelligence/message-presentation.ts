import type { ConversationMessage } from "./intelligence-api";

export type MessageVariant =
  | "user"
  | "assistant"
  | "report"
  | "tool"
  | "report-card"
  | "action-card"
  | "action";

export type ActionState = "proposed" | "confirmed" | "executed" | "rejected";

export interface MessagePresentation {
  variant: MessageVariant;
  /** Etiqueta corta para herramientas, reportes y acciones. */
  label: string | null;
  actionState: ActionState | null;
  /** Reporte guardado que la interfaz trae de la API para mostrarlo. */
  reportId?: string;
  /** Acción del agente (borrador, propuesta o simulación) que se trae de la API. */
  actionId?: string;
}

const RUNNING_VERBS: Record<string, string> = {
  Consultó: "Consultando",
  Armó: "Armando",
  Preparó: "Preparando",
  Comparó: "Comparando",
  Analizó: "Analizando",
  Editó: "Editando",
  Simuló: "Simulando",
  Diagnosticó: "Diagnosticando",
};

/** "Preparó un borrador" → "Preparando un borrador…" mientras la herramienta corre. */
export function runningToolLabel(label: string): string {
  const [verb, ...rest] = label.split(" ");
  const running = RUNNING_VERBS[verb];
  return `${running ? [running, ...rest].join(" ") : label}…`;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ACTION_STATES: ActionState[] = [
  "proposed",
  "confirmed",
  "executed",
  "rejected",
];

export const ACTION_STATE_LABEL: Record<ActionState, string> = {
  proposed: "Esperando tu confirmación",
  confirmed: "Confirmada",
  executed: "Ejecutada",
  rejected: "Descartada",
};

/**
 * Cómo se ve cada mensaje según lo que el backend guardó. Solo lee `role`,
 * `kind` y pistas de `metadata`; nunca inventa un estado que no esté ahí.
 */
export function presentMessage(message: ConversationMessage): MessagePresentation {
  const meta = message.metadata ?? {};

  if (message.kind === "ACTION") {
    const rawState = typeof meta.status === "string" ? meta.status : "";
    const actionState = ACTION_STATES.includes(rawState as ActionState)
      ? (rawState as ActionState)
      : null;
    return {
      variant: "action",
      label: typeof meta.title === "string" ? meta.title : "Acción",
      actionState,
    };
  }

  if (message.role === "TOOL" || message.kind === "TOOL_RESULT") {
    const label =
      typeof meta.toolLabel === "string"
        ? meta.toolLabel
        : "Consultó los datos de tu negocio";
    if (meta.ok !== false && typeof meta.actionId === "string" && UUID_RE.test(meta.actionId)) {
      return { variant: "action-card", label, actionState: null, actionId: meta.actionId };
    }
    if (meta.ok !== false && typeof meta.reportId === "string" && UUID_RE.test(meta.reportId)) {
      return { variant: "report-card", label, actionState: null, reportId: meta.reportId };
    }
    return {
      variant: "tool",
      label: meta.ok === false ? `${label} · no disponible` : label,
      actionState: null,
    };
  }

  if (message.role === "USER") {
    return { variant: "user", label: null, actionState: null };
  }

  if (meta.format === "report") {
    return {
      variant: "report",
      label: typeof meta.title === "string" ? meta.title : "Reporte",
      actionState: null,
    };
  }

  return { variant: "assistant", label: null, actionState: null };
}
