import { SseParser } from "./sse";

export type ConversationStatus = "ACTIVE" | "ARCHIVED";

export interface Conversation {
  id: string;
  title: string;
  titleSource: "AUTO" | "MANUAL";
  status: ConversationStatus;
  lastActivityAt: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  role: "USER" | "ASSISTANT" | "TOOL";
  kind: "TEXT" | "TOOL_RESULT" | "ACTION";
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export const MAX_TITLE_LENGTH = 120;
export const MAX_MESSAGE_LENGTH = 4_000;

export type AgentAvailability =
  | { available: true }
  | { available: false; reason: string; message: string };

/** Eventos del agente, tal como los emite la API por SSE. */
export type AgentEvent =
  | { type: "user_message"; message: ConversationMessage }
  | { type: "tool_started"; callId: string; name: string; label: string }
  | {
      type: "tool_finished";
      callId: string;
      name: string;
      label: string;
      ok: boolean;
      message: ConversationMessage;
    }
  | { type: "text_delta"; delta: string }
  | { type: "replace_text"; content: string }
  | { type: "done"; message: ConversationMessage }
  | { type: "error"; code: string; message: string; retryable: boolean }
  | { type: "unavailable"; available: false; reason: string; message: string };

const BASE = "/api/proxy/intelligence/conversations";

export class IntelligenceApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "IntelligenceApiError";
  }
}

/** Mensaje para el dueño, nunca el error crudo del backend. */
export function messageForStatus(status: number): string {
  if (status === 0) {
    return "No pudimos conectarnos. Revisá tu conexión y probá de nuevo.";
  }
  if (status === 404) return "Esta conversación ya no existe.";
  if (status === 409) {
    return "Ya hay una respuesta en curso, o no hay ninguna pregunta para reintentar.";
  }
  if (status === 403) return "No tenés acceso a Intelligence en este negocio.";
  if (status === 400) return "Revisá lo que escribiste y probá de nuevo.";
  return "Algo falló de nuestro lado. Probá de nuevo en un momento.";
}

export function createIntelligenceApi(fetchImpl: typeof fetch = fetch) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(`${BASE}${path}`, {
        ...init,
        headers: init?.body
          ? { "Content-Type": "application/json", ...init.headers }
          : init?.headers,
      });
    } catch {
      throw new IntelligenceApiError(0, messageForStatus(0));
    }
    if (!res.ok) {
      throw new IntelligenceApiError(res.status, messageForStatus(res.status));
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    list(params: {
      status: ConversationStatus;
      q?: string;
      cursor?: string | null;
      limit?: number;
    }) {
      const qs = new URLSearchParams({ status: params.status });
      if (params.q?.trim()) qs.set("q", params.q.trim());
      if (params.cursor) qs.set("cursor", params.cursor);
      if (params.limit) qs.set("limit", String(params.limit));
      return request<Page<Conversation>>(`?${qs.toString()}`);
    },
    create() {
      return request<Conversation>("", { method: "POST", body: "{}" });
    },
    get(id: string) {
      return request<Conversation>(`/${encodeURIComponent(id)}`);
    },
    listMessages(id: string, cursor?: string | null) {
      const qs = cursor ? `?${new URLSearchParams({ cursor }).toString()}` : "";
      return request<Page<ConversationMessage>>(
        `/${encodeURIComponent(id)}/messages${qs}`,
      );
    },
    rename(id: string, title: string) {
      return request<Conversation>(`/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
    },
    setStatus(id: string, status: ConversationStatus) {
      return request<Conversation>(`/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    },
    remove(id: string) {
      return request<void>(`/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
    agentStatus() {
      return request<AgentAvailability>("/agent-status");
    },
    /**
     * Un turno del agente como stream de eventos. Los errores previos al
     * stream (404, 409, 400) tiran `IntelligenceApiError`; un corte del
     * usuario (`signal`) termina el iterador sin error.
     */
    async *streamTurn(
      id: string,
      turn: { kind: "message"; content: string } | { kind: "regenerate" },
      signal: AbortSignal,
    ): AsyncGenerator<AgentEvent> {
      const path =
        turn.kind === "message"
          ? `/${encodeURIComponent(id)}/messages`
          : `/${encodeURIComponent(id)}/regenerate`;
      let res: Response;
      try {
        res = await fetchImpl(`${BASE}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          body: turn.kind === "message" ? JSON.stringify({ content: turn.content }) : "{}",
          signal,
        });
      } catch {
        if (signal.aborted) return;
        throw new IntelligenceApiError(0, messageForStatus(0));
      }
      if (!res.ok || !res.body) {
        throw new IntelligenceApiError(res.status, messageForStatus(res.status));
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const parser = new SseParser();
      let finished = false;
      try {
        while (true) {
          let chunk: ReadableStreamReadResult<Uint8Array>;
          try {
            chunk = await reader.read();
          } catch {
            if (signal.aborted) return;
            break;
          }
          if (chunk.done) break;
          for (const message of parser.push(decoder.decode(chunk.value, { stream: true }))) {
            let event: AgentEvent;
            try {
              event = JSON.parse(message.data) as AgentEvent;
            } catch {
              continue;
            }
            if (event.type === "done" || event.type === "error" || event.type === "unavailable") {
              finished = true;
            }
            yield event;
          }
        }
      } finally {
        reader.cancel().catch(() => undefined);
      }

      if (!finished && !signal.aborted) {
        yield {
          type: "error",
          code: "CONNECTION_LOST",
          message: "Se cortó la conexión antes de terminar la respuesta.",
          retryable: true,
        };
      }
    },
  };
}

export type IntelligenceApi = ReturnType<typeof createIntelligenceApi>;
