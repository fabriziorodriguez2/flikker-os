import { canSubmit, composerKeyAction } from "./composer-keys";
import {
  conversationListReducer,
  initialListState,
  type ConversationListState,
} from "./conversation-list-state";
import { formatConversationDate } from "./format-date";
import {
  createIntelligenceApi,
  IntelligenceApiError,
  type Conversation,
  type ConversationMessage,
} from "./intelligence-api";
import { presentMessage } from "./message-presentation";

const conv = (id: string, at: string, overrides: Partial<Conversation> = {}): Conversation => ({
  id,
  title: `Chat ${id}`,
  titleSource: "AUTO",
  status: "ACTIVE",
  lastActivityAt: at,
  archivedAt: null,
  createdAt: at,
  updatedAt: at,
  ...overrides,
});

const loaded = (items: Conversation[], nextCursor: string | null = null) =>
  conversationListReducer(initialListState("ACTIVE"), {
    type: "loaded",
    items,
    nextCursor,
  });

describe("composer — teclado", () => {
  it("Enter envía y Shift+Enter agrega una línea", () => {
    expect(composerKeyAction({ key: "Enter", shiftKey: false, isComposing: false })).toBe("submit");
    expect(composerKeyAction({ key: "Enter", shiftKey: true, isComposing: false })).toBe("newline");
  });

  it("nunca envía mientras un IME está componiendo (acentos)", () => {
    expect(composerKeyAction({ key: "Enter", shiftKey: false, isComposing: true })).toBe("none");
  });

  it("ignora otras teclas", () => {
    expect(composerKeyAction({ key: "a", shiftKey: false, isComposing: false })).toBe("none");
  });

  it("no se puede enviar vacío, deshabilitado ni mientras genera", () => {
    expect(canSubmit("hola", { disabled: false, generating: false })).toBe(true);
    expect(canSubmit("   ", { disabled: false, generating: false })).toBe(false);
    expect(canSubmit("hola", { disabled: true, generating: false })).toBe(false);
    expect(canSubmit("hola", { disabled: false, generating: true })).toBe(false);
  });
});

describe("lista de conversaciones — reducer", () => {
  it("arranca cargando y sin datos inventados", () => {
    const state = initialListState();
    expect(state.loading).toBe(true);
    expect(state.items).toEqual([]);
  });

  it("crear agrega arriba de todo en Activas", () => {
    const state = loaded([conv("a", "2026-11-01T10:00:00Z")]);
    const next = conversationListReducer(state, {
      type: "created",
      conversation: conv("b", "2026-11-02T10:00:00Z"),
    });
    expect(next.items.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("crear mientras se mira Archivadas no ensucia esa lista", () => {
    const archived = conversationListReducer(initialListState("ARCHIVED"), {
      type: "loaded",
      items: [],
      nextCursor: null,
    });
    const next = conversationListReducer(archived, {
      type: "created",
      conversation: conv("b", "2026-11-02T10:00:00Z"),
    });
    expect(next.items).toEqual([]);
  });

  it("renombrar actualiza en su lugar", () => {
    const state = loaded([conv("a", "2026-11-02T10:00:00Z"), conv("b", "2026-11-01T10:00:00Z")]);
    const next = conversationListReducer(state, {
      type: "updated",
      conversation: conv("b", "2026-11-01T10:00:00Z", { title: "Nuevo", titleSource: "MANUAL" }),
    });
    expect(next.items.map((c) => [c.id, c.title])).toEqual([
      ["a", "Chat a"],
      ["b", "Nuevo"],
    ]);
  });

  it("archivar saca la conversación de Activas", () => {
    const state = loaded([conv("a", "2026-11-02T10:00:00Z"), conv("b", "2026-11-01T10:00:00Z")]);
    const next = conversationListReducer(state, {
      type: "updated",
      conversation: conv("a", "2026-11-02T10:00:00Z", { status: "ARCHIVED" }),
    });
    expect(next.items.map((c) => c.id)).toEqual(["b"]);
  });

  it("eliminar la quita de la lista", () => {
    const state = loaded([conv("a", "2026-11-02T10:00:00Z")]);
    expect(conversationListReducer(state, { type: "removed", id: "a" }).items).toEqual([]);
  });

  it("cargar más agrega sin duplicar y actualiza el cursor", () => {
    const state = loaded([conv("a", "2026-11-03T10:00:00Z")], "cursor-1");
    const next = conversationListReducer(
      conversationListReducer(state, { type: "loadMoreStarted" }),
      {
        type: "loadedMore",
        items: [conv("a", "2026-11-03T10:00:00Z"), conv("b", "2026-11-02T10:00:00Z")],
        nextCursor: null,
      },
    );
    expect(next.items.map((c) => c.id)).toEqual(["a", "b"]);
    expect(next.nextCursor).toBeNull();
    expect(next.loadingMore).toBe(false);
  });

  it("un error conserva lo ya cargado y deja de cargar", () => {
    const state: ConversationListState = {
      ...loaded([conv("a", "2026-11-03T10:00:00Z")], "c"),
      loadingMore: true,
    };
    const next = conversationListReducer(state, { type: "failed", error: "falló" });
    expect(next.items).toHaveLength(1);
    expect(next.loadingMore).toBe(false);
    expect(next.error).toBe("falló");
  });

  it("cambiar de pestaña vuelve a cargar desde cero", () => {
    const next = conversationListReducer(loaded([conv("a", "2026-11-03T10:00:00Z")]), {
      type: "reset",
      status: "ARCHIVED",
    });
    expect(next).toEqual(initialListState("ARCHIVED"));
  });
});

describe("cliente de API — usa solo los endpoints reales del proxy", () => {
  function fakeFetch(status: number, body: unknown = {}) {
    return jest.fn(async () =>
      new Response(status === 204 ? null : JSON.stringify(body), { status }),
    ) as unknown as jest.Mock & typeof fetch;
  }

  it("lista con estado, búsqueda y cursor en la query", async () => {
    const fetchMock = fakeFetch(200, { items: [], nextCursor: null });
    await createIntelligenceApi(fetchMock).list({
      status: "ARCHIVED",
      q: "  ventas ",
      cursor: "abc",
      limit: 30,
    });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(
      "/api/proxy/intelligence/conversations?status=ARCHIVED&q=ventas&cursor=abc&limit=30",
    );
  });

  it("nunca manda businessId ni dueño: el negocio lo pone el proxy", async () => {
    const fetchMock = fakeFetch(201, conv("a", "2026-11-01T10:00:00Z"));
    await createIntelligenceApi(fetchMock).create();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBe("{}");
  });

  it("renombrar, archivar y eliminar usan PATCH/DELETE sobre el id", async () => {
    const fetchMock = fakeFetch(200, conv("a", "2026-11-01T10:00:00Z"));
    const api = createIntelligenceApi(fetchMock);
    await api.rename("a", "Nuevo");
    await api.setStatus("a", "ARCHIVED");
    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect(calls[0][0]).toBe("/api/proxy/intelligence/conversations/a");
    expect(calls[0][1]).toMatchObject({ method: "PATCH", body: '{"title":"Nuevo"}' });
    expect(calls[1][1]).toMatchObject({ method: "PATCH", body: '{"status":"ARCHIVED"}' });

    const deleteFetch = fakeFetch(204);
    await expect(createIntelligenceApi(deleteFetch).remove("a")).resolves.toBeUndefined();
    expect((deleteFetch.mock.calls[0] as [string, RequestInit])[1].method).toBe("DELETE");
  });

  it("mensajes anteriores piden con el cursor", async () => {
    const fetchMock = fakeFetch(200, { items: [], nextCursor: null });
    await createIntelligenceApi(fetchMock).listMessages("a", "older");
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      "/api/proxy/intelligence/conversations/a/messages?cursor=older",
    );
  });

  it.each([
    [404, "Esta conversación ya no existe."],
    [403, "No tenés acceso a Intelligence en este negocio."],
    [500, "Algo falló de nuestro lado. Probá de nuevo en un momento."],
  ])("traduce el %s a un mensaje para el dueño", async (status, message) => {
    const promise = createIntelligenceApi(fakeFetch(status)).get("a");
    await expect(promise).rejects.toBeInstanceOf(IntelligenceApiError);
    await expect(promise).rejects.toThrow(message);
  });

  it("un corte de red no rompe la pantalla: error con estado 0", async () => {
    const failing = jest.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(createIntelligenceApi(failing).get("a")).rejects.toMatchObject({ status: 0 });
  });
});

describe("presentación de mensajes", () => {
  const msg = (overrides: Partial<ConversationMessage>): ConversationMessage => ({
    id: "m",
    role: "ASSISTANT",
    kind: "TEXT",
    content: "hola",
    metadata: null,
    createdAt: "2026-11-01T10:00:00Z",
    ...overrides,
  });

  it("distingue usuario, asistente, herramienta, reporte y acción", () => {
    expect(presentMessage(msg({ role: "USER" })).variant).toBe("user");
    expect(presentMessage(msg({})).variant).toBe("assistant");
    expect(presentMessage(msg({ role: "TOOL", kind: "TOOL_RESULT" })).variant).toBe("tool");
    expect(presentMessage(msg({ metadata: { format: "report", title: "Semana" } }))).toMatchObject({
      variant: "report",
      label: "Semana",
    });
    expect(presentMessage(msg({ kind: "ACTION", metadata: { status: "proposed" } }))).toMatchObject({
      variant: "action",
      actionState: "proposed",
    });
  });

  it("no inventa un estado de acción que el backend no mandó", () => {
    expect(
      presentMessage(msg({ kind: "ACTION", metadata: { status: "hackeado" } })).actionState,
    ).toBeNull();
  });
});

describe("fechas", () => {
  const now = new Date("2026-11-10T15:00:00Z");
  const tz = "America/Montevideo";

  it("hoy muestra la hora, ayer dice Ayer", () => {
    expect(formatConversationDate("2026-11-10T13:05:00Z", now, tz)).toBe("10:05");
    expect(formatConversationDate("2026-11-09T13:05:00Z", now, tz)).toBe("Ayer");
  });

  it("más atrás muestra día y mes, y el año si no es el actual", () => {
    expect(formatConversationDate("2026-11-03T13:05:00Z", now, tz)).toMatch(/^3 nov/);
    expect(formatConversationDate("2025-11-03T13:05:00Z", now, tz)).toMatch(/2025$/);
  });

  it("una fecha inválida no rompe", () => {
    expect(formatConversationDate("no-es-fecha", now, tz)).toBe("");
  });
});
