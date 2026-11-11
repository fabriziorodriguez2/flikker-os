import type { AgentEvent, ConversationMessage } from "./intelligence-api";

export interface LiveTool {
  callId: string;
  label: string;
  status: "running" | "done" | "failed";
}

/** Lo que todavía no es un mensaje guardado: el turno en curso. */
export interface LiveTurn {
  status: "streaming" | "error" | "stopped";
  /** Texto del usuario hasta que la API confirma el mensaje guardado. */
  pendingUserText: string | null;
  tools: LiveTool[];
  text: string;
  error: { message: string; retryable: boolean } | null;
}

export interface TurnState {
  messages: ConversationMessage[];
  live: LiveTurn | null;
}

export type TurnAction =
  | { type: "start"; userText: string | null }
  | { type: "event"; event: AgentEvent }
  | { type: "stopped" }
  | { type: "failed"; message: string; retryable: boolean }
  | { type: "dismiss" };

function appendOnce(messages: ConversationMessage[], message: ConversationMessage) {
  return messages.some((m) => m.id === message.id) ? messages : [...messages, message];
}

/**
 * Puro a propósito (el stack de tests del web no tiene DOM): cada evento del
 * agente se refleja acá, y lo que la API ya guardó pasa a `messages`.
 */
export function turnReducer(state: TurnState, action: TurnAction): TurnState {
  switch (action.type) {
    case "start":
      return {
        ...state,
        live: {
          status: "streaming",
          pendingUserText: action.userText,
          tools: [],
          text: "",
          error: null,
        },
      };
    case "stopped":
      return state.live ? { ...state, live: { ...state.live, status: "stopped" } } : state;
    case "failed":
      return {
        ...state,
        live: {
          ...(state.live ?? { pendingUserText: null, tools: [], text: "" }),
          status: "error",
          error: { message: action.message, retryable: action.retryable },
        },
      };
    case "dismiss":
      return { ...state, live: null };
    case "event":
      return applyEvent(state, action.event);
  }
}

function applyEvent(state: TurnState, event: AgentEvent): TurnState {
  const live = state.live;
  if (!live) return state;

  switch (event.type) {
    case "user_message":
      return {
        messages: appendOnce(state.messages, event.message),
        live: { ...live, pendingUserText: null },
      };
    case "tool_started":
      return {
        ...state,
        live: {
          ...live,
          tools: [...live.tools, { callId: event.callId, label: event.label, status: "running" }],
        },
      };
    case "tool_finished":
      return {
        messages: appendOnce(state.messages, event.message),
        live: {
          ...live,
          tools: live.tools.filter((t) => t.callId !== event.callId),
        },
      };
    case "text_delta":
      return { ...state, live: { ...live, text: live.text + event.delta } };
    case "replace_text":
      return { ...state, live: { ...live, text: event.content } };
    case "done":
      return { messages: appendOnce(state.messages, event.message), live: null };
    case "error":
      return {
        ...state,
        live: {
          ...live,
          status: "error",
          tools: [],
          error: { message: event.message, retryable: event.retryable },
        },
      };
    case "unavailable":
      return {
        ...state,
        live: {
          ...live,
          status: "error",
          pendingUserText: null,
          error: { message: event.message, retryable: false },
        },
      };
  }
}
