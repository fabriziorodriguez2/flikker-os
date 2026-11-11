"use client";

import Link from "next/link";
import { Activity, MessageSquare, Plus, Search } from "lucide-react";
import Button from "@/components/ui/button";
import InlineNotice from "@/components/ui/inline-notice";
import { TabButton, TabsList } from "@/components/ui/tabs";
import type { ConversationListState } from "./conversation-list-state";
import type { ConversationStatus } from "./intelligence-api";
import { useIsOwnerOrAdmin } from "../../role-context";
import { formatConversationDate } from "./format-date";

interface ConversationSidebarProps {
  state: ConversationListState;
  query: string;
  selectedId: string | null;
  creating: boolean;
  onQueryChange: (value: string) => void;
  onStatusChange: (status: ConversationStatus) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onLoadMore: () => void;
  onRetry: () => void;
}

export default function ConversationSidebar({
  state,
  query,
  selectedId,
  creating,
  onQueryChange,
  onStatusChange,
  onSelect,
  onCreate,
  onLoadMore,
  onRetry,
}: ConversationSidebarProps) {
  const searching = query.trim().length > 0;
  // La actividad autónoma muestra costos del negocio: solo dueño/admin.
  const canSeeActivity = useIsOwnerOrAdmin();

  return (
    <aside
      aria-label="Conversaciones"
      className="flex min-h-0 flex-1 flex-col border-[color:var(--panel-border)] bg-[color:var(--panel-surface)] lg:border-r"
    >
      <div className="space-y-3 border-b border-[color:var(--panel-border)] p-3">
        <Button
          variant="primary"
          className="w-full"
          onClick={onCreate}
          loading={creating}
          loadingLabel="Creando…"
          leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
        >
          Nuevo chat
        </Button>
        {canSeeActivity ? (
          <Link
            href="/dashboard/intelligence/actividad"
            className="flex items-center gap-2 rounded-[var(--panel-radius-control)] px-2 py-1.5 text-sm font-medium text-[color:var(--panel-text-secondary)] hover:bg-[color:var(--panel-surface-muted)] hover:text-[color:var(--panel-text)]"
          >
            <Activity className="h-4 w-4" aria-hidden="true" />
            Actividad autónoma
          </Link>
        ) : null}
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--panel-text-muted)]"
            aria-hidden="true"
          />
          <label htmlFor="intelligence-search" className="sr-only">
            Buscar conversaciones
          </label>
          <input
            id="intelligence-search"
            type="search"
            value={query}
            maxLength={100}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Buscar por título"
            className="h-9 w-full rounded-[var(--panel-radius-control)] border border-[color:var(--panel-border)] bg-[color:var(--panel-surface)] pl-9 pr-3 text-sm text-[color:var(--panel-text)] outline-none placeholder:text-[color:var(--panel-text-disabled)] focus:border-[color:var(--panel-accent)] focus:ring-[3px] focus:ring-[color:var(--panel-focus-ring)]"
          />
        </div>
        <TabsList variant="segmented" aria-label="Filtrar conversaciones">
          <TabButton
            variant="segmented"
            active={state.status === "ACTIVE"}
            onClick={() => onStatusChange("ACTIVE")}
          >
            Activas
          </TabButton>
          <TabButton
            variant="segmented"
            active={state.status === "ARCHIVED"}
            onClick={() => onStatusChange("ARCHIVED")}
          >
            Archivadas
          </TabButton>
        </TabsList>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2" aria-busy={state.loading}>
        {state.loading ? (
          <ul className="space-y-1" aria-label="Cargando conversaciones">
            {[0, 1, 2, 3].map((i) => (
              <li
                key={i}
                className="h-14 animate-pulse rounded-[var(--panel-radius-control)] bg-[color:var(--panel-surface-muted)]"
              />
            ))}
          </ul>
        ) : state.error && state.items.length === 0 ? (
          <InlineNotice
            tone="danger"
            title="No pudimos cargar tus conversaciones"
            action={
              <Button size="sm" onClick={onRetry}>
                Reintentar
              </Button>
            }
          >
            {state.error}
          </InlineNotice>
        ) : state.items.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-10 text-center">
            <MessageSquare
              className="h-5 w-5 text-[color:var(--panel-text-muted)]"
              aria-hidden="true"
            />
            <p className="mt-3 text-sm text-[color:var(--panel-text-muted)]">
              {searching
                ? "Ninguna conversación coincide con tu búsqueda."
                : state.status === "ARCHIVED"
                  ? "No tenés conversaciones archivadas."
                  : "Todavía no tenés conversaciones."}
            </p>
          </div>
        ) : (
          <>
            <ul className="space-y-1">
              {state.items.map((conversation) => {
                const active = conversation.id === selectedId;
                return (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(conversation.id)}
                      aria-current={active ? "true" : undefined}
                      className={`flex w-full items-baseline justify-between gap-3 rounded-[var(--panel-radius-control)] px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[color:var(--panel-focus-ring)] ${
                        active
                          ? "bg-[color:var(--panel-accent-soft)] text-[color:var(--panel-text)]"
                          : "text-[color:var(--panel-text-secondary)] hover:bg-[color:var(--panel-surface-muted)]"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {conversation.title}
                      </span>
                      <span className="shrink-0 text-xs text-[color:var(--panel-text-muted)]">
                        {formatConversationDate(conversation.lastActivityAt)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {state.error ? (
              <InlineNotice
                tone="danger"
                className="mt-2"
                action={
                  <Button size="sm" onClick={onLoadMore}>
                    Reintentar
                  </Button>
                }
              >
                {state.error}
              </InlineNotice>
            ) : state.nextCursor ? (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 w-full"
                onClick={onLoadMore}
                loading={state.loadingMore}
              >
                Cargar más
              </Button>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}
