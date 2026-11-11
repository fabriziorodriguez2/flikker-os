/** Lo que devuelve `GET /intelligence/actions/:id`. Todo lo calcula el backend. */
export type ActionMode = "DRAFT" | "CONFIRM" | "DRY_RUN";
export type ActionStatus =
  | "PROPOSED"
  | "EXECUTING"
  | "EXECUTED"
  | "CANCELLED"
  | "EXPIRED"
  | "FAILED"
  | "DRY_RUN";

export interface ActionRow {
  label: string;
  value: string;
}

export interface IntelligenceAction {
  id: string;
  kind: string;
  mode: ActionMode;
  status: ActionStatus;
  title: string;
  impact: {
    summary: string;
    before: ActionRow[];
    after: ActionRow[];
    recipients: { count: number | null; description: string };
    effectiveAt: string | null;
    channel: string;
    maxCost: string;
    risks: string[];
    undo: string;
  };
  planHash: string;
  expiresAt: string | null;
  createdAt: string;
  decidedAt: string | null;
  executedAt: string | null;
  error: { code: string; message: string } | null;
  canConfirm: boolean;
  canCancel: boolean;
}

export type ActionTone = "warning" | "success" | "info" | "muted" | "danger";

/** Estado de la tarjeta para el dueño. */
export function actionBadge(action: Pick<IntelligenceAction, "mode" | "status">): {
  label: string;
  tone: ActionTone;
} {
  if (action.mode === "DRY_RUN") return { label: "Simulación · no se envía", tone: "info" };
  switch (action.status) {
    case "PROPOSED":
      return { label: "Esperando tu confirmación", tone: "warning" };
    case "EXECUTING":
      return { label: "Aplicando…", tone: "info" };
    case "EXECUTED":
      return action.mode === "DRAFT"
        ? { label: "Borrador guardado", tone: "success" }
        : { label: "Aplicado", tone: "success" };
    case "CANCELLED":
      return { label: "Cancelado", tone: "muted" };
    case "EXPIRED":
      return { label: "Ya no es válido", tone: "muted" };
    case "FAILED":
      return { label: "No se pudo aplicar", tone: "danger" };
    default:
      return { label: "Simulación · no se envía", tone: "info" };
  }
}

export function modeLabel(mode: ActionMode): string {
  if (mode === "DRAFT") return "Borrador";
  if (mode === "DRY_RUN") return "Simulación";
  return "Cambio con confirmación";
}

export function recipientsLabel(recipients: IntelligenceAction["impact"]["recipients"]): string {
  if (recipients.count === null) return recipients.description;
  const count = new Intl.NumberFormat("es-AR").format(recipients.count);
  return `${count} · ${recipients.description}`;
}

/** Filas antes/después alineadas por etiqueta (una propuesta puede no tener "antes"). */
export function beforeAfterRows(impact: IntelligenceAction["impact"]) {
  const labels = [...new Set([...impact.before.map((r) => r.label), ...impact.after.map((r) => r.label)])];
  return labels.map((label) => ({
    label,
    before: impact.before.find((r) => r.label === label)?.value ?? null,
    after: impact.after.find((r) => r.label === label)?.value ?? null,
  }));
}

/** El mensaje de un 409/403/404 al confirmar, para el dueño. */
export function confirmErrorMessage(status: number, body: unknown): string {
  const message =
    typeof body === "object" && body !== null && typeof (body as { message?: unknown }).message === "string"
      ? (body as { message: string }).message
      : null;
  if (status === 409 && message) return message;
  if (status === 403) return "Solo un dueño o administrador puede confirmar cambios.";
  if (status === 404) return "Esta propuesta ya no está disponible.";
  if (status === 0) return "No pudimos conectarnos. Revisá tu conexión y probá de nuevo.";
  return "No se pudo aplicar el cambio. Probá de nuevo en un momento.";
}
