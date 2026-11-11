"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import Button from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import ConfirmDialog from "./confirm-dialog";
import ConversationSidebar from "./conversation-sidebar";
import ConversationThread, { type ThreadState } from "./conversation-thread";
import {
  conversationListReducer,
  initialListState,
} from "./conversation-list-state";
import {
  createIntelligenceApi,
  IntelligenceApiError,
  type AgentAvailability,
  type Conversation,
  type ConversationStatus,
} from "./intelligence-api";
import { turnReducer, type LiveTurn, type TurnAction } from "./live-turn";

/** Tiempo para que la API guarde la respuesta interrumpida antes de releerla. */
const STOPPED_RELOAD_DELAY_MS = 1_200;

const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZE = 30;

const EMPTY_THREAD: ThreadState = {
  conversation: null,
  messages: [],
  nextCursor: null,
  loading: false,
  loadingOlder: false,
  error: null,
};

type PendingConfirm = { kind: "archive" | "delete"; conversation: Conversation };

type LoadedThread = ThreadState & { forId: string | null; live: LiveTurn | null };

type TurnRequest = { kind: "message"; content: string } | { kind: "regenerate" };

function errorMessage(error: unknown) {
  return error instanceof IntelligenceApiError
    ? error.message
    : "Algo falló de nuestro lado. Probá de nuevo en un momento.";
}

export default function IntelligenceClient({
  initialConversationId,
}: {
  initialConversationId: string | null;
}) {
  const api = useMemo(() => createIntelligenceApi(), []);
  const toast = useToast();

  const [list, dispatch] = useReducer(conversationListReducer, "ACTIVE", initialListState);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [listReload, setListReload] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId);
  // El hilo cargado recuerda para qué conversación se cargó: si no coincide
  // con la seleccionada, se muestra como "cargando" sin tocar estado en un
  // efecto.
  const [loaded, setLoaded] = useState<LoadedThread>({
    ...EMPTY_THREAD,
    forId: null,
    live: null,
  });
  const [threadReload, setThreadReload] = useState(0);
  const [availability, setAvailability] = useState<AgentAvailability | null>(null);
  const turnAbort = useRef<AbortController | null>(null);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Descarta respuestas de pedidos viejos (búsqueda rápida, cambio de chat).
  const listRequest = useRef(0);
  const threadRequest = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Si el asistente no puede responder (no habilitado, sin cupo), el composer
  // lo dice antes de que el dueño escriba. Si esto falla, se intenta igual al
  // enviar: la API responde "no disponible" con el motivo real.
  useEffect(() => {
    void (async () => {
      try {
        setAvailability(await api.agentStatus());
      } catch {
        setAvailability(null);
      }
    })();
  }, [api]);

  // Salir de la pantalla corta el turno en curso.
  useEffect(() => () => turnAbort.current?.abort(), []);

  useEffect(() => {
    const request = ++listRequest.current;
    void (async () => {
      try {
        const page = await api.list({
          status: list.status,
          q: debouncedQuery,
          limit: PAGE_SIZE,
        });
        if (request !== listRequest.current) return;
        dispatch({ type: "loaded", items: page.items, nextCursor: page.nextCursor });
      } catch (error) {
        if (request !== listRequest.current) return;
        dispatch({ type: "failed", error: errorMessage(error) });
      }
    })();
  }, [api, list.status, debouncedQuery, listReload]);

  useEffect(() => {
    if (!selectedId) return;
    const request = ++threadRequest.current;
    void (async () => {
      try {
        const [conversation, page] = await Promise.all([
          api.get(selectedId),
          api.listMessages(selectedId),
        ]);
        if (request !== threadRequest.current) return;
        setLoaded({
          forId: selectedId,
          conversation,
          messages: page.items,
          nextCursor: page.nextCursor,
          loading: false,
          loadingOlder: false,
          error: null,
          live: null,
        });
      } catch (error) {
        if (request !== threadRequest.current) return;
        setLoaded({
          ...EMPTY_THREAD,
          forId: selectedId,
          error: errorMessage(error),
          live: null,
        });
      }
    })();
  }, [api, selectedId, threadReload]);

  const isLoaded = Boolean(selectedId) && loaded.forId === selectedId;
  const thread: ThreadState = isLoaded
    ? loaded
    : {
          ...EMPTY_THREAD,
          loading: Boolean(selectedId),
          // Mientras carga, el encabezado ya muestra lo que la lista sabe.
          conversation: list.items.find((c) => c.id === selectedId) ?? null,
        };

  function retryThread() {
    setLoaded((prev) => ({ ...prev, forId: null }));
    setThreadReload((n) => n + 1);
  }

  // History API nativo (integrado por Next): cambia la URL compartible sin
  // re-renderizar la página en el servidor en cada click.
  const select = useCallback((id: string | null) => {
    // Cambiar de chat corta la respuesta en curso; la API guarda lo verificable.
    turnAbort.current?.abort();
    setSelectedId(id);
    window.history.replaceState(
      null,
      "",
      id ? `/dashboard/intelligence?c=${encodeURIComponent(id)}` : "/dashboard/intelligence",
    );
  }, []);

  function changeStatus(status: ConversationStatus) {
    if (status === list.status) return;
    dispatch({ type: "reset", status });
  }

  async function loadMore() {
    if (!list.nextCursor || list.loadingMore) return;
    const request = listRequest.current;
    dispatch({ type: "loadMoreStarted" });
    try {
      const page = await api.list({
        status: list.status,
        q: debouncedQuery,
        cursor: list.nextCursor,
        limit: PAGE_SIZE,
      });
      if (request !== listRequest.current) return;
      dispatch({ type: "loadedMore", items: page.items, nextCursor: page.nextCursor });
    } catch (error) {
      if (request !== listRequest.current) return;
      dispatch({ type: "failed", error: errorMessage(error) });
    }
  }

  async function loadOlder() {
    if (!selectedId || !thread.nextCursor || thread.loadingOlder) return;
    const request = threadRequest.current;
    setLoaded((prev) => ({ ...prev, loadingOlder: true, error: null }));
    try {
      const page = await api.listMessages(selectedId, thread.nextCursor);
      if (request !== threadRequest.current) return;
      setLoaded((prev) => ({
        ...prev,
        messages: [...page.items, ...prev.messages],
        nextCursor: page.nextCursor,
        loadingOlder: false,
      }));
    } catch (error) {
      if (request !== threadRequest.current) return;
      setLoaded((prev) => ({ ...prev, loadingOlder: false, error: errorMessage(error) }));
    }
  }

  async function createConversation() {
    if (creating) return;
    setCreating(true);
    try {
      const conversation = await api.create();
      if (list.status !== "ACTIVE") dispatch({ type: "reset", status: "ACTIVE" });
      dispatch({ type: "created", conversation });
      setLoaded({
        ...EMPTY_THREAD,
        forId: conversation.id,
        conversation,
        loading: true,
        live: null,
      });
      select(conversation.id);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setCreating(false);
    }
  }

  function applyUpdated(conversation: Conversation) {
    dispatch({ type: "updated", conversation });
    setLoaded((prev) =>
      prev.conversation?.id === conversation.id ? { ...prev, conversation } : prev,
    );
  }

  async function rename(title: string) {
    const current = thread.conversation;
    if (!current) return;
    setRenaming(true);
    try {
      applyUpdated(await api.rename(current.id, title));
      toast.success("Conversación renombrada");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRenaming(false);
    }
  }

  async function unarchive() {
    const current = thread.conversation;
    if (!current) return;
    try {
      applyUpdated(await api.setStatus(current.id, "ACTIVE"));
      toast.success("Conversación desarchivada");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function confirmPending() {
    if (!pending) return;
    setConfirmBusy(true);
    try {
      if (pending.kind === "archive") {
        applyUpdated(await api.setStatus(pending.conversation.id, "ARCHIVED"));
        toast.success("Conversación archivada");
      } else {
        await api.remove(pending.conversation.id);
        dispatch({ type: "removed", id: pending.conversation.id });
        if (selectedId === pending.conversation.id) select(null);
        toast.success("Conversación eliminada");
      }
      setPending(null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setConfirmBusy(false);
    }
  }

  /** Aplica una acción del turno solo si sigue abierta la misma conversación. */
  function applyTurn(conversationId: string, action: TurnAction) {
    setLoaded((prev) => {
      if (prev.forId !== conversationId) return prev;
      const next = turnReducer({ messages: prev.messages, live: prev.live }, action);
      return { ...prev, messages: next.messages, live: next.live };
    });
  }

  /** Relee los mensajes guardados sin mostrar el esqueleto de carga. */
  async function refreshMessages(conversationId: string) {
    try {
      const page = await api.listMessages(conversationId);
      setLoaded((prev) =>
        prev.forId === conversationId
          ? { ...prev, messages: page.items, nextCursor: page.nextCursor, live: null }
          : prev,
      );
    } catch {
      // Se queda lo que ya se ve; la próxima apertura del chat lo corrige.
    }
  }

  async function runTurn(conversationId: string, turn: TurnRequest) {
    if (turnAbort.current) return;
    const controller = new AbortController();
    turnAbort.current = controller;
    applyTurn(conversationId, {
      type: "start",
      userText: turn.kind === "message" ? turn.content : null,
    });

    try {
      for await (const event of api.streamTurn(conversationId, turn, controller.signal)) {
        if (event.type === "unavailable") {
          setAvailability({ available: false, reason: event.reason, message: event.message });
        }
        applyTurn(conversationId, { type: "event", event });
      }
      if (controller.signal.aborted) {
        applyTurn(conversationId, { type: "stopped" });
        setTimeout(() => void refreshMessages(conversationId), STOPPED_RELOAD_DELAY_MS);
      }
    } catch (error) {
      applyTurn(conversationId, {
        type: "failed",
        message: errorMessage(error),
        retryable: !(error instanceof IntelligenceApiError && error.status === 404),
      });
    } finally {
      if (turnAbort.current === controller) turnAbort.current = null;
      // Título automático y última actividad, como los dejó la API.
      try {
        applyUpdated(await api.get(conversationId));
      } catch {
        // La conversación pudo haberse borrado mientras tanto.
      }
    }
  }

  function retryTurn() {
    if (!selectedId) return;
    const live = loaded.live;
    // Si la API nunca confirmó el mensaje, se reenvía; si ya lo guardó, se
    // regenera la respuesta a esa misma pregunta.
    void runTurn(
      selectedId,
      live?.pendingUserText
        ? { kind: "message", content: live.pendingUserText }
        : { kind: "regenerate" },
    );
  }

  const composerDisabledReason =
    availability && !availability.available ? availability.message : null;

  const showEmptyIntro =
    !list.loading && !list.error && list.items.length === 0 &&
    list.status === "ACTIVE" && !debouncedQuery && !selectedId;

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[480px] flex-col overflow-hidden rounded-[var(--panel-radius-card)] border border-[color:var(--panel-border)] bg-[color:var(--panel-surface)] lg:h-[calc(100dvh-4rem)]">
      <div className="grid min-h-0 flex-1 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className={`min-h-0 ${selectedId ? "hidden lg:flex" : "flex"} flex-col`}>
          <ConversationSidebar
            state={list}
            query={query}
            selectedId={selectedId}
            creating={creating}
            onQueryChange={setQuery}
            onStatusChange={changeStatus}
            onSelect={select}
            onCreate={() => void createConversation()}
            onLoadMore={() => void loadMore()}
            onRetry={() => {
              dispatch({ type: "reset", status: list.status });
              setListReload((n) => n + 1);
            }}
          />
        </div>

        <div className={`min-h-0 ${selectedId ? "flex" : "hidden lg:flex"} flex-col`}>
          {selectedId ? (
            <ConversationThread
              thread={thread}
              live={isLoaded ? loaded.live : null}
              composerDisabledReason={composerDisabledReason}
              onSend={(text) => selectedId && void runTurn(selectedId, { kind: "message", content: text })}
              onStop={() => turnAbort.current?.abort()}
              onRetryTurn={retryTurn}
              onDismissTurn={() => selectedId && applyTurn(selectedId, { type: "dismiss" })}
              renaming={renaming}
              onBack={() => select(null)}
              onRename={(title) => void rename(title)}
              onArchive={() =>
                thread.conversation &&
                setPending({ kind: "archive", conversation: thread.conversation })
              }
              onUnarchive={() => void unarchive()}
              onDelete={() =>
                thread.conversation &&
                setPending({ kind: "delete", conversation: thread.conversation })
              }
              onLoadOlder={() => void loadOlder()}
              onRetry={retryThread}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-[var(--panel-radius-control)] bg-[color:var(--panel-accent-soft)] text-[color:var(--panel-accent)]">
                <Sparkles className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-base font-semibold text-[color:var(--panel-text)]">
                {showEmptyIntro ? "Empezá tu primera conversación" : "Elegí una conversación"}
              </h2>
              <p className="mt-1.5 max-w-sm text-sm leading-6 text-[color:var(--panel-text-muted)]">
                {showEmptyIntro
                  ? "Tus chats con Intelligence quedan guardados acá y solo los ves vos."
                  : "Abrí una conversación de la lista o empezá una nueva."}
              </p>
              <Button
                variant="primary"
                className="mt-5"
                onClick={() => void createConversation()}
                loading={creating}
                leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
              >
                Nuevo chat
              </Button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={pending?.kind === "archive"}
        title="¿Archivar esta conversación?"
        description="Va a dejar de aparecer en tus conversaciones activas. Podés verla y desarchivarla desde Archivadas."
        confirmLabel="Archivar"
        busy={confirmBusy}
        onConfirm={() => void confirmPending()}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending?.kind === "delete"}
        title="¿Eliminar esta conversación?"
        description="Se borra de tu lista y no vas a poder recuperarla."
        confirmLabel="Eliminar"
        tone="danger"
        busy={confirmBusy}
        onConfirm={() => void confirmPending()}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
