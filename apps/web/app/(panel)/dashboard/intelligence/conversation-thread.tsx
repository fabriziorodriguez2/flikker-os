"use client";

import { useEffect, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  LoaderCircle,
  MessageSquare,
  Pencil,
  Trash2,
} from "lucide-react";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import InlineNotice from "@/components/ui/inline-notice";
import Composer from "./composer";
import MessageItem from "./message-item";
import { runningToolLabel } from "./message-presentation";
import { formatConversationLongDate } from "./format-date";
import type { LiveTurn } from "./live-turn";
import {
  MAX_TITLE_LENGTH,
  type Conversation,
  type ConversationMessage,
} from "./intelligence-api";

export interface ThreadState {
  conversation: Conversation | null;
  messages: ConversationMessage[];
  nextCursor: string | null;
  loading: boolean;
  loadingOlder: boolean;
  error: string | null;
}

/** Preguntas de ejemplo para arrancar — solo texto que se envía, nunca respuestas. */
export const SUGGESTED_QUESTIONS = [
  "¿Cómo vengo esta semana comparado con la anterior?",
  "¿Cuántos clientes tengo en riesgo de no volver?",
  "¿Por qué Autopilot no está contactando clientes?",
];

interface ConversationThreadProps {
  thread: ThreadState;
  live: LiveTurn | null;
  /** Si hay motivo, el asistente no puede responder y el composer lo explica. */
  composerDisabledReason: string | null;
  renaming: boolean;
  onBack: () => void;
  onRename: (title: string) => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
  onLoadOlder: () => void;
  onRetry: () => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onRetryTurn: () => void;
  onDismissTurn: () => void;
}

export default function ConversationThread({
  thread,
  live,
  composerDisabledReason,
  renaming,
  onBack,
  onRename,
  onArchive,
  onUnarchive,
  onDelete,
  onLoadOlder,
  onRetry,
  onSend,
  onStop,
  onRetryTurn,
  onDismissTurn,
}: ConversationThreadProps) {
  const { conversation } = thread;
  const scrollRef = useRef<HTMLDivElement>(null);
  // Se guarda QUÉ conversación se edita: cambiar de chat cancela la edición
  // sola, sin un efecto que resetee estado.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = conversation !== null && editingId === conversation.id;
  const setEditing = (value: boolean) =>
    setEditingId(value && conversation ? conversation.id : null);
  const [draft, setDraft] = useState("");
  const lastMessageId = thread.messages[thread.messages.length - 1]?.id;
  const liveSize = live
    ? `${live.pendingUserText ?? ""}${live.tools.length}${live.text.length}${live.status}`
    : "";

  // Baja al final con cada mensaje o fragmento nuevo, no al cargar anteriores.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastMessageId, conversation?.id, liveSize]);

  function startEditing() {
    if (!conversation) return;
    setDraft(conversation.title);
    setEditing(true);
  }

  function saveTitle() {
    const title = draft.trim();
    if (!conversation || !title) return;
    if (title === conversation.title) {
      setEditing(false);
      return;
    }
    onRename(title);
    setEditing(false);
  }

  if (thread.loading && !conversation) {
    return (
      <section aria-busy="true" aria-label="Cargando conversación" className="flex min-h-0 flex-1 flex-col">
        <div className="h-16 animate-pulse border-b border-[color:var(--panel-border)] bg-[color:var(--panel-surface-subtle)]" />
        <div className="flex-1" />
      </section>
    );
  }

  if (!conversation) {
    return (
      <section className="flex min-h-0 flex-1 flex-col items-center justify-center p-6">
        {thread.error ? (
          <InlineNotice
            tone="danger"
            title="No pudimos abrir la conversación"
            action={
              <Button size="sm" onClick={onRetry}>
                Reintentar
              </Button>
            }
          >
            {thread.error}
          </InlineNotice>
        ) : null}
      </section>
    );
  }

  const archived = conversation.status === "ARCHIVED";

  return (
    <section
      aria-label={`Conversación: ${conversation.title}`}
      className="flex min-h-0 flex-1 flex-col"
    >
      <header className="flex items-center gap-2 border-b border-[color:var(--panel-border)] px-3 py-3 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver a las conversaciones"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--panel-radius-control)] text-[color:var(--panel-text-muted)] hover:bg-[color:var(--panel-surface-muted)] lg:hidden"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                saveTitle();
              }}
              className="flex items-center gap-2"
            >
              <label htmlFor="intelligence-title" className="sr-only">
                Título de la conversación
              </label>
              <input
                id="intelligence-title"
                autoFocus
                value={draft}
                maxLength={MAX_TITLE_LENGTH}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setEditing(false);
                }}
                className="h-8 min-w-0 flex-1 rounded-[var(--panel-radius-control)] border border-[color:var(--panel-accent)] bg-[color:var(--panel-surface)] px-2 text-sm font-semibold text-[color:var(--panel-text)] outline-none ring-[3px] ring-[color:var(--panel-focus-ring)]"
              />
              <Button size="sm" variant="primary" type="submit" disabled={!draft.trim()}>
                Guardar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            </form>
          ) : (
            <>
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="truncate text-sm font-semibold text-[color:var(--panel-text)] sm:text-base">
                  {conversation.title}
                </h2>
                {archived ? <Badge>Archivada</Badge> : null}
              </div>
              <p className="text-xs text-[color:var(--panel-text-muted)]">
                {formatConversationLongDate(conversation.createdAt)}
              </p>
            </>
          )}
        </div>

        {!editing ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={startEditing}
              loading={renaming}
              aria-label="Renombrar"
              leadingIcon={<Pencil className="h-4 w-4" aria-hidden="true" />}
            >
              <span className="hidden sm:inline">Renombrar</span>
            </Button>
            {archived ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={onUnarchive}
                aria-label="Desarchivar"
                leadingIcon={<ArchiveRestore className="h-4 w-4" aria-hidden="true" />}
              >
                <span className="hidden sm:inline">Desarchivar</span>
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={onArchive}
                aria-label="Archivar"
                leadingIcon={<Archive className="h-4 w-4" aria-hidden="true" />}
              >
                <span className="hidden sm:inline">Archivar</span>
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              aria-label="Eliminar"
              className="text-[color:var(--panel-danger-text)] hover:text-[color:var(--panel-danger-text)]"
              leadingIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
            >
              <span className="hidden sm:inline">Eliminar</span>
            </Button>
          </div>
        ) : null}
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6"
        aria-live="polite"
      >
        {thread.error ? (
          <InlineNotice
            tone="danger"
            title="No pudimos cargar los mensajes"
            className="mb-4"
            action={
              <Button size="sm" onClick={onRetry}>
                Reintentar
              </Button>
            }
          >
            {thread.error}
          </InlineNotice>
        ) : null}

        {thread.nextCursor ? (
          <div className="mb-4 flex justify-center">
            <Button
              size="sm"
              variant="ghost"
              onClick={onLoadOlder}
              loading={thread.loadingOlder}
            >
              Cargar mensajes anteriores
            </Button>
          </div>
        ) : null}

        {thread.loading ? (
          <div className="space-y-3" aria-label="Cargando mensajes">
            <div className="ml-auto h-10 w-1/2 animate-pulse rounded-[var(--panel-radius-card)] bg-[color:var(--panel-surface-muted)]" />
            <div className="h-16 w-2/3 animate-pulse rounded-[var(--panel-radius-card)] bg-[color:var(--panel-surface-muted)]" />
          </div>
        ) : thread.messages.length === 0 && !thread.error && !live ? (
          <div className="mx-auto flex max-w-md flex-col items-center py-12 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-[var(--panel-radius-control)] bg-[color:var(--panel-surface-muted)] text-[color:var(--panel-text-muted)]">
              <MessageSquare className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-4 text-sm font-semibold text-[color:var(--panel-text)]">
              {composerDisabledReason
                ? "Esta conversación todavía no tiene mensajes"
                : "¿Qué querés saber de tu negocio?"}
            </p>
            <p className="mt-1.5 text-sm leading-6 text-[color:var(--panel-text-muted)]">
              {composerDisabledReason ??
                "Respondo con los datos reales de tu negocio: clientes, visitas, canjes, promociones, reseñas y Autopilot."}
            </p>
            {composerDisabledReason ? null : (
              <div className="mt-5 flex flex-col items-stretch gap-2">
                {SUGGESTED_QUESTIONS.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => onSend(question)}
                    className="rounded-[var(--panel-radius-control)] border border-[color:var(--panel-border)] bg-[color:var(--panel-surface)] px-3 py-2 text-left text-sm text-[color:var(--panel-text-secondary)] outline-none hover:border-[color:var(--panel-accent)] hover:text-[color:var(--panel-text)] focus-visible:ring-[3px] focus-visible:ring-[color:var(--panel-focus-ring)]"
                  >
                    {question}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <ol className="space-y-3">
            {thread.messages.map((message) => (
              <li key={message.id}>
                <MessageItem message={message} />
              </li>
            ))}
            {live ? <LiveTurnView live={live} onRetry={onRetryTurn} onDismiss={onDismissTurn} /> : null}
          </ol>
        )}
      </div>

      <Composer
        disabledReason={composerDisabledReason}
        generating={live?.status === "streaming"}
        onSubmit={onSend}
        onStop={onStop}
      />
    </section>
  );
}

/** El turno en curso: lo que todavía no es un mensaje guardado. */
function LiveTurnView({
  live,
  onRetry,
  onDismiss,
}: {
  live: LiveTurn;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  return (
    <>
      {live.pendingUserText ? (
        <li className="flex justify-end" data-variant="pending-user">
          <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-[var(--panel-radius-card)] bg-[color:var(--panel-accent)] px-3.5 py-2.5 text-sm leading-6 text-white opacity-70">
            {live.pendingUserText}
          </div>
        </li>
      ) : null}

      {live.tools.map((tool) => (
        <li key={tool.callId} className="flex justify-start" data-variant="tool-running">
          <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--panel-border)] bg-[color:var(--panel-surface-subtle)] px-3 py-1.5 text-xs text-[color:var(--panel-text-muted)]">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            {runningToolLabel(tool.label)}
          </div>
        </li>
      ))}

      {live.text ? (
        <li className="flex justify-start" data-variant="assistant-live">
          <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-[var(--panel-radius-card)] bg-[color:var(--panel-surface-muted)] px-3.5 py-2.5 text-sm leading-6 text-[color:var(--panel-text)]">
            {live.text}
            {live.status === "streaming" ? (
              <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-[color:var(--panel-text-muted)] align-middle" aria-hidden="true" />
            ) : null}
            {live.status === "stopped" ? (
              <p className="mt-1.5 text-xs text-[color:var(--panel-text-muted)]">Respuesta interrumpida</p>
            ) : null}
          </div>
        </li>
      ) : live.status === "streaming" && live.tools.length === 0 ? (
        <li className="flex justify-start" data-variant="thinking">
          <div className="inline-flex items-center gap-2 rounded-[var(--panel-radius-card)] bg-[color:var(--panel-surface-muted)] px-3.5 py-2.5 text-sm text-[color:var(--panel-text-muted)]">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            Pensando…
          </div>
        </li>
      ) : null}

      {live.status === "error" && live.error ? (
        <li>
          <InlineNotice
            tone={live.error.retryable ? "danger" : "warning"}
            title={live.error.retryable ? "No se pudo completar la respuesta" : undefined}
            action={
              live.error.retryable ? (
                <Button size="sm" onClick={onRetry}>
                  Reintentar
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={onDismiss}>
                  Cerrar
                </Button>
              )
            }
          >
            {live.error.message}
          </InlineNotice>
        </li>
      ) : null}
    </>
  );
}
