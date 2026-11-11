import { renderToStaticMarkup } from "react-dom/server";
import MessageItem from "./message-item";
import { presentMessage, runningToolLabel } from "./message-presentation";
import { ActionView } from "./action-card";
import {
  actionBadge,
  beforeAfterRows,
  confirmErrorMessage,
  recipientsLabel,
  type IntelligenceAction,
} from "./action-view";

// Datos de ejemplo SOLO para el test: la pantalla siempre lee la acción de la API.
const pause: IntelligenceAction = {
  id: "33333333-3333-4333-8333-333333333333",
  kind: "PAUSE_CAMPAIGN",
  mode: "CONFIRM",
  status: "PROPOSED",
  title: "Pausar campaña: Mostrador",
  impact: {
    summary: 'Pausar "Mostrador".',
    before: [{ label: "Estado", value: "Activa" }],
    after: [{ label: "Estado", value: "Pausada" }],
    recipients: { count: 0, description: "Nadie: no se contacta a ningún cliente." },
    effectiveAt: "2026-11-10T15:00:00Z",
    channel: "Ninguno: no se envía ningún mensaje.",
    maxCost: "Sin costo.",
    risks: ["Mientras esté pausada, sus QR y links dejan de llevar al destino."],
    undo: "Podés reactivarla desde Campañas.",
  },
  planHash: "a".repeat(64),
  expiresAt: "2026-11-10T15:30:00Z",
  createdAt: "2026-11-10T15:00:00Z",
  decidedAt: null,
  executedAt: null,
  error: null,
  canConfirm: true,
  canCancel: true,
};

describe("vista de acciones", () => {
  it("estado para el dueño según modo y estado", () => {
    expect(actionBadge(pause)).toEqual({ label: "Esperando tu confirmación", tone: "warning" });
    expect(actionBadge({ mode: "DRAFT", status: "EXECUTED" }).label).toBe("Borrador guardado");
    expect(actionBadge({ mode: "CONFIRM", status: "EXECUTED" }).label).toBe("Aplicado");
    expect(actionBadge({ mode: "CONFIRM", status: "EXPIRED" }).label).toBe("Ya no es válido");
    expect(actionBadge({ mode: "DRY_RUN", status: "DRY_RUN" }).label).toBe("Simulación · no se envía");
  });

  it("antes/después alineado por etiqueta y destinatarios con su conteo", () => {
    expect(beforeAfterRows(pause.impact)).toEqual([{ label: "Estado", before: "Activa", after: "Pausada" }]);
    expect(recipientsLabel({ count: 1234, description: "Ausentes" })).toBe("1.234 · Ausentes");
    expect(recipientsLabel({ count: null, description: "Quienes escaneen" })).toBe("Quienes escaneen");
  });

  it("errores al confirmar: usa el motivo del backend en un 409", () => {
    expect(confirmErrorMessage(409, { message: "Algo cambió desde que se armó la propuesta." })).toBe(
      "Algo cambió desde que se armó la propuesta.",
    );
    expect(confirmErrorMessage(403, null)).toContain("dueño o administrador");
    expect(confirmErrorMessage(500, { message: "stack trace" })).not.toContain("stack");
  });
});

describe("ActionView", () => {
  it("propuesta: antes/después, destinatarios, canal, costo, riesgos y botones", () => {
    const html = renderToStaticMarkup(<ActionView action={pause} />);
    expect(html).toContain("Pausar campaña: Mostrador");
    expect(html).toContain("Antes");
    expect(html).toContain("Activa");
    expect(html).toContain("Pausada");
    expect(html).toContain("Destinatarios");
    expect(html).toContain("Ninguno: no se envía ningún mensaje.");
    expect(html).toContain("Costo máximo");
    expect(html).toContain("dejan de llevar al destino");
    expect(html).toContain("Confirmar");
    expect(html).toContain("Cancelar");
    expect(html).toContain('data-status="PROPOSED"');
  });

  it("sin permiso o ya decidida: no hay botones", () => {
    const executed = renderToStaticMarkup(
      <ActionView
        action={{ ...pause, status: "EXECUTED", canConfirm: false, canCancel: false, executedAt: "2026-11-10T15:05:00Z" }}
      />,
    );
    expect(executed).not.toContain(">Confirmar<");
    expect(executed).toContain("Aplicado");
    expect(executed).toContain("Confirmado por vos");
    const viewer = renderToStaticMarkup(<ActionView action={{ ...pause, canConfirm: false, canCancel: false }} />);
    expect(viewer).not.toContain(">Confirmar<");
  });

  it("una aprobación caducada muestra el motivo", () => {
    const html = renderToStaticMarkup(
      <ActionView
        action={{
          ...pause,
          status: "EXPIRED",
          canConfirm: false,
          canCancel: false,
          error: { code: "DATA_CHANGED", message: "Los datos cambiaron desde la propuesta." },
        }}
      />,
    );
    expect(html).toContain("Ya no es válido");
    expect(html).toContain("Los datos cambiaron desde la propuesta.");
  });

  it("simulación: nunca ofrece ejecutar", () => {
    const html = renderToStaticMarkup(
      <ActionView
        action={{
          ...pause,
          kind: "SEND_PROMOTION",
          mode: "DRY_RUN",
          status: "DRY_RUN",
          canConfirm: false,
          canCancel: false,
          impact: { ...pause.impact, effectiveAt: null, channel: "WhatsApp (simulado: no se envía)." },
        }}
      />,
    );
    expect(html).toContain("Simulación");
    expect(html).toContain("Nunca: es una simulación");
    expect(html).not.toContain(">Confirmar<");
  });
});

describe("en el chat", () => {
  const toolMessage = (metadata: Record<string, unknown>) => ({
    id: "m",
    role: "TOOL" as const,
    kind: "TOOL_RESULT" as const,
    content: "{}",
    metadata,
    createdAt: "2026-11-10T12:00:00Z",
  });

  it("un resultado con acción se muestra como tarjeta que se carga de la API", () => {
    const message = toolMessage({ toolLabel: "Preparó la pausa de la campaña", ok: true, actionId: pause.id });
    expect(presentMessage(message)).toMatchObject({ variant: "action-card", actionId: pause.id });
    const html = renderToStaticMarkup(<MessageItem message={message} />);
    expect(html).toContain("Preparó la pausa de la campaña");
    expect(html).toContain('aria-label="Cargando propuesta"');
  });

  it("un actionId inválido o un resultado fallido no genera tarjeta", () => {
    expect(presentMessage(toolMessage({ actionId: "../x", ok: true })).variant).toBe("tool");
    expect(presentMessage(toolMessage({ actionId: pause.id, ok: false })).variant).toBe("tool");
  });

  it("etiqueta mientras corre la herramienta", () => {
    expect(runningToolLabel("Preparó un borrador de campaña")).toBe("Preparando un borrador de campaña…");
    expect(runningToolLabel("Consultó las reseñas")).toBe("Consultando las reseñas…");
    expect(runningToolLabel("Otra cosa")).toBe("Otra cosa…");
  });
});
