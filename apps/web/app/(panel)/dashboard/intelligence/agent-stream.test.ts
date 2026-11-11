import {
  createIntelligenceApi,
  IntelligenceApiError,
  type AgentEvent,
  type ConversationMessage,
} from "./intelligence-api";
import { turnReducer, type TurnState } from "./live-turn";
import { SseParser } from "./sse";

const message = (id: string, role: ConversationMessage["role"], content: string): ConversationMessage => ({
  id,
  role,
  kind: role === "TOOL" ? "TOOL_RESULT" : "TEXT",
  content,
  metadata: null,
  createdAt: "2026-11-10T12:00:00Z",
});

function sseBody(events: object[], cutEvery = 7) {
  const text = events
    .map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`)
    .join("");
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      // Cortes arbitrarios, como llegan por la red.
      for (let i = 0; i < text.length; i += cutEvery) {
        controller.enqueue(encoder.encode(text.slice(i, i + cutEvery)));
      }
      controller.close();
    },
  });
}

async function collect(gen: AsyncGenerator<AgentEvent>) {
  const out: AgentEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe("SseParser (web)", () => {
  it("reconstruye eventos partidos y descarta heartbeats", () => {
    const parser = new SseParser();
    expect(parser.push(": ping\n\nevent: x\nda")).toEqual([]);
    expect(parser.push('ta: {"a":1}\n\n')).toEqual([{ event: "x", data: '{"a":1}' }]);
  });
});

describe("streamTurn", () => {
  const events: AgentEvent[] = [
    { type: "user_message", message: message("u1", "USER", "¿Cómo vengo?") },
    { type: "tool_started", callId: "c1", name: "visit_trend", label: "Consultó la evolución de visitas" },
    { type: "text_delta", delta: "Esta semana " },
    { type: "text_delta", delta: "tuviste 5 visitas." },
    { type: "done", message: message("a1", "ASSISTANT", "Esta semana tuviste 5 visitas.") },
  ];

  it("envía el mensaje al endpoint del agente y entrega los eventos en orden", async () => {
    const fetchMock = jest.fn(async () => new Response(sseBody(events), { status: 200 }));
    const api = createIntelligenceApi(fetchMock as unknown as typeof fetch);
    const got = await collect(
      api.streamTurn("abc", { kind: "message", content: "¿Cómo vengo?" }, new AbortController().signal),
    );
    expect(got).toEqual(events);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/proxy/intelligence/conversations/abc/messages");
    expect(init).toMatchObject({ method: "POST", body: '{"content":"¿Cómo vengo?"}' });
  });

  it("reintentar usa el endpoint de regenerar", async () => {
    const fetchMock = jest.fn(async () => new Response(sseBody([events[4]]), { status: 200 }));
    await collect(
      createIntelligenceApi(fetchMock as unknown as typeof fetch).streamTurn(
        "abc",
        { kind: "regenerate" },
        new AbortController().signal,
      ),
    );
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      "/api/proxy/intelligence/conversations/abc/regenerate",
    );
  });

  it("si la conexión se corta antes de terminar, avisa con un error reintentable", async () => {
    const fetchMock = jest.fn(async () => new Response(sseBody(events.slice(0, 3)), { status: 200 }));
    const got = await collect(
      createIntelligenceApi(fetchMock as unknown as typeof fetch).streamTurn(
        "abc",
        { kind: "regenerate" },
        new AbortController().signal,
      ),
    );
    expect(got[got.length - 1]).toMatchObject({ type: "error", code: "CONNECTION_LOST", retryable: true });
  });

  it("un 409 antes del stream es un error con mensaje para el dueño", async () => {
    const fetchMock = jest.fn(async () => new Response("{}", { status: 409 }));
    await expect(
      collect(
        createIntelligenceApi(fetchMock as unknown as typeof fetch).streamTurn(
          "abc",
          { kind: "message", content: "hola" },
          new AbortController().signal,
        ),
      ),
    ).rejects.toBeInstanceOf(IntelligenceApiError);
  });

  it("detener termina el iterador sin inventar un error", async () => {
    const controller = new AbortController();
    const fetchMock = jest.fn(async () => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    });
    const got = await collect(
      createIntelligenceApi(fetchMock as unknown as typeof fetch).streamTurn(
        "abc",
        { kind: "message", content: "hola" },
        controller.signal,
      ),
    );
    expect(got).toEqual([]);
  });
});

describe("turnReducer", () => {
  const start = (): TurnState =>
    turnReducer({ messages: [], live: null }, { type: "start", userText: "¿Cómo vengo?" });

  it("muestra el mensaje pendiente hasta que la API lo confirma", () => {
    let state = start();
    expect(state.live?.pendingUserText).toBe("¿Cómo vengo?");
    state = turnReducer(state, {
      type: "event",
      event: { type: "user_message", message: message("u1", "USER", "¿Cómo vengo?") },
    });
    expect(state.live?.pendingUserText).toBeNull();
    expect(state.messages.map((m) => m.id)).toEqual(["u1"]);
  });

  it("herramientas: aparecen corriendo y pasan a ser mensajes guardados", () => {
    let state = turnReducer(start(), {
      type: "event",
      event: { type: "tool_started", callId: "c1", name: "x", label: "Consultó x" },
    });
    expect(state.live?.tools).toEqual([{ callId: "c1", label: "Consultó x", status: "running" }]);
    state = turnReducer(state, {
      type: "event",
      event: {
        type: "tool_finished",
        callId: "c1",
        name: "x",
        label: "Consultó x",
        ok: true,
        message: message("t1", "TOOL", "{}"),
      },
    });
    expect(state.live?.tools).toEqual([]);
    expect(state.messages.map((m) => m.id)).toEqual(["t1"]);
  });

  it("acumula texto y lo reemplaza si la API no lo pudo verificar", () => {
    let state = turnReducer(start(), { type: "event", event: { type: "text_delta", delta: "Tenés 99" } });
    state = turnReducer(state, { type: "event", event: { type: "text_delta", delta: "99 clientes" } });
    expect(state.live?.text).toBe("Tenés 9999 clientes");
    state = turnReducer(state, { type: "event", event: { type: "replace_text", content: "No pude verificar." } });
    expect(state.live?.text).toBe("No pude verificar.");
  });

  it("al terminar, la respuesta guardada reemplaza al turno en vivo", () => {
    const state = turnReducer(start(), {
      type: "event",
      event: { type: "done", message: message("a1", "ASSISTANT", "Listo el análisis.") },
    });
    expect(state.live).toBeNull();
    expect(state.messages.map((m) => m.id)).toEqual(["a1"]);
  });

  it("un error conserva lo que se vio y marca si se puede reintentar", () => {
    const state = turnReducer(
      turnReducer(start(), { type: "event", event: { type: "text_delta", delta: "Parcial" } }),
      { type: "event", event: { type: "error", code: "TIMEOUT", message: "Tardó demasiado.", retryable: true } },
    );
    expect(state.live).toMatchObject({
      status: "error",
      text: "Parcial",
      error: { message: "Tardó demasiado.", retryable: true },
    });
  });

  it("no disponible no es reintentable", () => {
    const state = turnReducer(start(), {
      type: "event",
      event: { type: "unavailable", available: false, reason: "BUSINESS_DISABLED", message: "No habilitado." },
    });
    expect(state.live?.error).toEqual({ message: "No habilitado.", retryable: false });
  });

  it("nunca duplica un mensaje que llega dos veces", () => {
    const m = message("u1", "USER", "hola");
    let state = turnReducer(start(), { type: "event", event: { type: "user_message", message: m } });
    state = turnReducer(state, { type: "event", event: { type: "user_message", message: m } });
    expect(state.messages).toHaveLength(1);
  });
});
