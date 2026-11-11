import type { Conversation, ConversationStatus } from "./intelligence-api";

/**
 * Estado de la lista lateral. Puro a propósito: el stack de tests del web
 * corre en node sin DOM, así que la lógica de interacción (qué pasa con la
 * lista al crear, renombrar, archivar o eliminar) se prueba acá.
 */
export interface ConversationListState {
  status: ConversationStatus;
  items: Conversation[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

export type ConversationListAction =
  | { type: "reset"; status: ConversationStatus }
  | { type: "loaded"; items: Conversation[]; nextCursor: string | null }
  | { type: "loadMoreStarted" }
  | { type: "loadedMore"; items: Conversation[]; nextCursor: string | null }
  | { type: "failed"; error: string }
  | { type: "created"; conversation: Conversation }
  | { type: "updated"; conversation: Conversation }
  | { type: "removed"; id: string };

export function initialListState(
  status: ConversationStatus = "ACTIVE",
): ConversationListState {
  return {
    status,
    items: [],
    nextCursor: null,
    loading: true,
    loadingMore: false,
    error: null,
  };
}

function byActivityDesc(a: Conversation, b: Conversation) {
  const diff = Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt);
  if (diff !== 0) return diff;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export function conversationListReducer(
  state: ConversationListState,
  action: ConversationListAction,
): ConversationListState {
  switch (action.type) {
    case "reset":
      return initialListState(action.status);
    case "loaded":
      return {
        ...state,
        items: action.items,
        nextCursor: action.nextCursor,
        loading: false,
        loadingMore: false,
        error: null,
      };
    case "loadMoreStarted":
      return { ...state, loadingMore: true, error: null };
    case "loadedMore": {
      const known = new Set(state.items.map((c) => c.id));
      return {
        ...state,
        items: [...state.items, ...action.items.filter((c) => !known.has(c.id))],
        nextCursor: action.nextCursor,
        loadingMore: false,
      };
    }
    case "failed":
      return { ...state, loading: false, loadingMore: false, error: action.error };
    case "created":
      if (state.status !== action.conversation.status) return state;
      return {
        ...state,
        items: [
          action.conversation,
          ...state.items.filter((c) => c.id !== action.conversation.id),
        ],
      };
    case "updated": {
      // Archivar/desarchivar la saca de la vista en la que está.
      if (action.conversation.status !== state.status) {
        return {
          ...state,
          items: state.items.filter((c) => c.id !== action.conversation.id),
        };
      }
      const exists = state.items.some((c) => c.id === action.conversation.id);
      const items = exists
        ? state.items.map((c) =>
            c.id === action.conversation.id ? action.conversation : c,
          )
        : [...state.items, action.conversation];
      return { ...state, items: [...items].sort(byActivityDesc) };
    }
    case "removed":
      return {
        ...state,
        items: state.items.filter((c) => c.id !== action.id),
      };
  }
}
