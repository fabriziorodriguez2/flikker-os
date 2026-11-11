import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { renderToStaticMarkup } from "react-dom/server";
import Composer from "./composer";
import ConfirmDialog from "./confirm-dialog";
import ConversationSidebar from "./conversation-sidebar";
import ConversationThread, {
  SUGGESTED_QUESTIONS,
  type ThreadState,
} from "./conversation-thread";
import { initialListState } from "./conversation-list-state";
import IntelligenceClient from "./intelligence-client";
import type { Conversation } from "./intelligence-api";
import type { LiveTurn } from "./live-turn";
import MessageItem from "./message-item";

const UNAVAILABLE =
  "Intelligence todavía no está habilitado para tu negocio. Escribinos por Ayuda y soporte para activarlo.";

/**
 * Sin jsdom en este repo: `renderToStaticMarkup` no ejecuta handlers ni
 * efectos. Acá se fija lo que el dueño VE en cada estado; la lógica de cada
 * interacción se prueba en `intelligence-logic.test.ts`.
 */

const noop = () => {};

const conversation: Conversation = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Ventas de octubre",
  titleSource: "MANUAL",
  status: "ACTIVE",
  lastActivityAt: "2026-11-09T12:00:00Z",
  archivedAt: null,
  createdAt: "2026-11-09T12:00:00Z",
  updatedAt: "2026-11-09T12:00:00Z",
};

const sidebar = (overrides: Partial<Parameters<typeof ConversationSidebar>[0]> = {}) =>
  renderToStaticMarkup(
    <ConversationSidebar
      state={{ ...initialListState(), loading: false }}
      query=""
      selectedId={null}
      creating={false}
      onQueryChange={noop}
      onStatusChange={noop}
      onSelect={noop}
      onCreate={noop}
      onLoadMore={noop}
      onRetry={noop}
      {...overrides}
    />,
  );

const baseThread: ThreadState = {
  conversation,
  messages: [],
  nextCursor: null,
  loading: false,
  loadingOlder: false,
  error: null,
};

const thread = (
  overrides: Partial<ThreadState> = {},
  extra: { live?: LiveTurn | null; disabledReason?: string | null } = {},
) =>
  renderToStaticMarkup(
    <ConversationThread
      thread={{ ...baseThread, ...overrides }}
      live={extra.live ?? null}
      composerDisabledReason={extra.disabledReason ?? null}
      renaming={false}
      onBack={noop}
      onRename={noop}
      onArchive={noop}
      onUnarchive={noop}
      onDelete={noop}
      onLoadOlder={noop}
      onRetry={noop}
      onSend={noop}
      onStop={noop}
      onRetryTurn={noop}
      onDismissTurn={noop}
    />,
  );

const live = (overrides: Partial<LiveTurn> = {}): LiveTurn => ({
  status: "streaming",
  pendingUserText: null,
  tools: [],
  text: "",
  error: null,
  ...overrides,
});

describe("Intelligence — pantalla inicial", () => {
  it("arranca cargando conversaciones reales, sin datos de ejemplo", () => {
    const html = renderToStaticMarkup(<IntelligenceClient initialConversationId={null} />);
    expect(html).toContain('aria-label="Cargando conversaciones"');
    expect(html).toContain("Nuevo chat");
  });

  it("con ?c= abre directamente la conversación pedida (cargando)", () => {
    const html = renderToStaticMarkup(
      <IntelligenceClient initialConversationId={conversation.id} />,
    );
    expect(html).toContain('aria-label="Cargando conversación"');
  });
});

describe("Intelligence — lista de conversaciones", () => {
  it("vacía: lo dice sin inventar chats", () => {
    expect(sidebar()).toContain("Todavía no tenés conversaciones.");
  });

  it("búsqueda sin resultados y Archivadas vacía tienen su propio mensaje", () => {
    expect(sidebar({ query: "zzz" })).toContain("Ninguna conversación coincide con tu búsqueda.");
    expect(
      sidebar({ state: { ...initialListState("ARCHIVED"), loading: false } }),
    ).toContain("No tenés conversaciones archivadas.");
  });

  it("error de carga ofrece reintentar", () => {
    const html = sidebar({ state: { ...initialListState(), loading: false, error: "Sin conexión" } });
    expect(html).toContain("No pudimos cargar tus conversaciones");
    expect(html).toContain("Reintentar");
  });

  it("marca la conversación abierta y ofrece cargar más", () => {
    const html = sidebar({
      state: { ...initialListState(), loading: false, items: [conversation], nextCursor: "x" },
      selectedId: conversation.id,
    });
    expect(html).toContain("Ventas de octubre");
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("Cargar más");
  });

  it("tiene buscador y filtro Activas/Archivadas accesibles", () => {
    const html = sidebar();
    expect(html).toContain('aria-label="Filtrar conversaciones"');
    expect(html).toContain('role="tab"');
    expect(html).toContain("Buscar conversaciones");
  });
});

describe("Intelligence — conversación abierta", () => {
  it("sin mensajes y con el asistente disponible: invita a preguntar con ejemplos", () => {
    const html = thread();
    expect(html).toContain("¿Qué querés saber de tu negocio?");
    for (const question of SUGGESTED_QUESTIONS) expect(html).toContain(question);
    expect(html).not.toMatch(/<textarea[^>]*disabled=""/);
  });

  it("si Intelligence no está habilitado, lo explica y deshabilita el composer", () => {
    const html = thread({}, { disabledReason: UNAVAILABLE });
    expect(html).toContain("Esta conversación todavía no tiene mensajes");
    expect(html).toContain(UNAVAILABLE);
    expect(html).not.toContain(SUGGESTED_QUESTIONS[0]);
    expect(html).toMatch(/<textarea[^>]*disabled=""/);
  });

  it("turno en curso: mensaje pendiente, herramienta corriendo y botón detener", () => {
    const html = thread(
      {},
      {
        live: live({
          pendingUserText: "¿Cómo vengo?",
          tools: [{ callId: "c1", label: "Consultó la evolución de visitas", status: "running" }],
        }),
      },
    );
    expect(html).toContain('data-variant="pending-user"');
    expect(html).toContain("¿Cómo vengo?");
    expect(html).toContain("Consultando la evolución de visitas…");
    expect(html).toContain('aria-label="Detener respuesta"');
  });

  it("texto en streaming con cursor, y marca de interrumpida al detener", () => {
    expect(thread({}, { live: live({ text: "Esta semana tuviste" }) })).toContain(
      'data-variant="assistant-live"',
    );
    expect(
      thread({}, { live: live({ text: "Esta semana", status: "stopped" }) }),
    ).toContain("Respuesta interrumpida");
  });

  it("antes del primer texto muestra que está pensando", () => {
    expect(thread({}, { live: live() })).toContain("Pensando…");
  });

  it("un error reintentable ofrece Reintentar; uno que no, ofrece Cerrar", () => {
    const retryable = thread(
      {},
      { live: live({ status: "error", error: { message: "La respuesta tardó demasiado.", retryable: true } }) },
    );
    expect(retryable).toContain("No se pudo completar la respuesta");
    expect(retryable).toContain("Reintentar");

    const final = thread(
      {},
      { live: live({ status: "error", error: { message: UNAVAILABLE, retryable: false } }) },
    );
    expect(final).toContain(UNAVAILABLE);
    expect(final).toContain("Cerrar");
  });

  it("muestra título, fecha y acciones; archivada cambia Archivar por Desarchivar", () => {
    const active = thread();
    expect(active).toContain("Ventas de octubre");
    expect(active).toContain("2026");
    expect(active).toContain('aria-label="Renombrar"');
    expect(active).toContain('aria-label="Archivar"');
    expect(active).toContain('aria-label="Eliminar"');

    const archived = thread({ conversation: { ...conversation, status: "ARCHIVED" } });
    expect(archived).toContain("Archivada");
    expect(archived).toContain('aria-label="Desarchivar"');
  });

  it("error al cargar mensajes ofrece reintentar", () => {
    const html = thread({ error: "Algo falló" });
    expect(html).toContain("No pudimos cargar los mensajes");
    expect(html).toContain("Reintentar");
  });

  it("si hay más historial ofrece cargar mensajes anteriores", () => {
    expect(thread({ nextCursor: "older" })).toContain("Cargar mensajes anteriores");
  });

  it("en mobile hay botón para volver a la lista", () => {
    expect(thread()).toContain('aria-label="Volver a las conversaciones"');
  });
});

describe("Intelligence — mensajes", () => {
  const render = (overrides: Partial<Parameters<typeof MessageItem>[0]["message"]>) =>
    renderToStaticMarkup(
      <MessageItem
        message={{
          id: "m",
          role: "ASSISTANT",
          kind: "TEXT",
          content: "Texto",
          metadata: null,
          createdAt: "2026-11-01T10:00:00Z",
          ...overrides,
        }}
      />,
    );

  it("cada tipo tiene su estado visual", () => {
    expect(render({ role: "USER" })).toContain('data-variant="user"');
    expect(render({})).toContain('data-variant="assistant"');
    expect(render({ role: "TOOL", kind: "TOOL_RESULT" })).toContain("Consultó los datos de tu negocio");
    expect(render({ metadata: { format: "report", title: "Resumen semanal" } })).toContain(
      "Resumen semanal",
    );
    const action = render({ kind: "ACTION", metadata: { status: "proposed", title: "Activar Te extrañamos" } });
    expect(action).toContain("Activar Te extrañamos");
    expect(action).toContain("Esperando tu confirmación");
  });

  it("el contenido se escapa: nunca se inyecta HTML", () => {
    const html = render({ content: "<img src=x onerror=alert(1)>" });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("Intelligence — composer", () => {
  it("cuando genere, ofrece detener la respuesta en lugar de enviar", () => {
    const html = renderToStaticMarkup(
      <Composer disabledReason={null} generating onSubmit={noop} onStop={noop} />,
    );
    expect(html).toContain('aria-label="Detener respuesta"');
    expect(html).not.toContain('aria-label="Enviar mensaje"');
  });

  it("habilitado explica los atajos de teclado", () => {
    const html = renderToStaticMarkup(
      <Composer disabledReason={null} generating={false} onSubmit={noop} onStop={noop} />,
    );
    expect(html).toContain("Enter para enviar · Shift + Enter para una línea nueva");
  });
});

describe("Intelligence — confirmaciones", () => {
  it("cerrado no renderiza nada; abierto es un alertdialog con foco en Cancelar", () => {
    const props = {
      title: "¿Eliminar esta conversación?",
      description: "No vas a poder recuperarla.",
      confirmLabel: "Eliminar",
      tone: "danger" as const,
      onConfirm: noop,
      onCancel: noop,
    };
    expect(renderToStaticMarkup(<ConfirmDialog open={false} {...props} />)).toBe("");
    const html = renderToStaticMarkup(<ConfirmDialog open {...props} />);
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain("¿Eliminar esta conversación?");
    expect(html).toContain("Cancelar");
  });
});

describe("Intelligence — sin datos falsos en producción", () => {
  it("ningún archivo de la sección trae conversaciones o métricas de ejemplo", () => {
    const sources = readdirSync(__dirname)
      .filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."))
      .map((f) => readFileSync(join(__dirname, f), "utf-8"))
      .join("\n");
    expect(sources).not.toMatch(/mock|faker|lorem|sampleConversations|demoMessages/i);
  });
});
