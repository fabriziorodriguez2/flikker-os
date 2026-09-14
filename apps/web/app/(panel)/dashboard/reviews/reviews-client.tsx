"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ExternalLink,
  Loader2,
  MessageSquareText,
  Search,
} from "lucide-react";
import GoogleLogo from "@/components/icons/google-logo";
import Card from "@/components/ui/card";
import PageHeader from "@/components/ui/page-header";
import RouteProgressBar from "@/components/ui/route-progress-bar";
import { relativeDay, Stars } from "../customers/loyalty-ui";
import { useIsOwnerOrAdmin } from "../../role-context";
import GoogleConnectModal from "./google-connect-modal";

export interface PrivateFeedback {
  id: string;
  customer: { id: string; name: string } | null;
  score: number;
  comment: string | null;
  createdAt: string;
  gaveBonusStamp?: boolean;
}

export interface GoogleReviewItem {
  id: string;
  author: string | null;
  stars: number;
  text: string | null;
  postedAt: string | null;
  linkedToFlikkerActivity: boolean;
}

export interface ReviewsOverview {
  periodDays: number;
  google: {
    connected: boolean;
    profileUrl: string | null;
    lastSyncedAt: string | null;
    placeDisplayName: string | null;
    placeRating: number | null;
    placeUserRatingCount: number | null;
    placeReviewsUri: string | null;
    connectedAt: string | null;
    historySync?: {
      status: "idle" | "running" | "done" | "partial";
      startedAt: string | null;
      completedAt: string | null;
    };
  };
  summary: {
    rating: number | null;
    googleRating: number | null;
    googleReviewsTotal: number | null;
    googleReviewsImported: number;
    total: number;
    inPeriod: number;
    sinceFlikker: number;
    feedbackInPeriod: number;
    ratingDistribution: Record<string, number>;
  };
  reviews: GoogleReviewItem[];
  feedback: PrivateFeedback[];
  toReview: PrivateFeedback[];
}

type InboxTab = "feedback" | "google";
export type FeedbackFilter = "all" | "attention" | "positive";
export type GoogleFilter = "all" | "low" | "neutral" | "high";

export function filterPrivateFeedback(
  feedback: PrivateFeedback[],
  filter: FeedbackFilter,
  attentionIds: ReadonlySet<string>,
) {
  if (filter === "attention") {
    return feedback.filter((item) => attentionIds.has(item.id));
  }
  if (filter === "positive") {
    return feedback.filter((item) => item.score >= 4);
  }
  return feedback;
}

export function filterGoogleReviews(
  reviews: GoogleReviewItem[],
  filter: GoogleFilter,
) {
  if (filter === "low") return reviews.filter((item) => item.stars <= 2);
  if (filter === "neutral") return reviews.filter((item) => item.stars === 3);
  if (filter === "high") return reviews.filter((item) => item.stars >= 4);
  return reviews;
}

export default function ReviewsClient({
  businessName,
}: {
  businessName: string;
}) {
  const canManage = useIsOwnerOrAdmin();
  const [data, setData] = useState<ReviewsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/proxy/reviews/overview?days=30");
      if (!response.ok) throw new Error("No pudimos cargar tus reseñas.");
      setData((await response.json()) as ReviewsOverview);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error inesperado.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const historyRunning = data?.google.historySync?.status === "running";
  useEffect(() => {
    if (!historyRunning) return;
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [historyRunning, load]);

  if (error && !data) {
    return (
      <div className="space-y-3">
        <PageHeader title="Reseñas" />
        <p className="rounded-[var(--panel-radius-control)] border border-[color:var(--panel-danger-border)] bg-[color:var(--panel-danger-bg)] px-4 py-3 text-sm text-[color:var(--panel-danger-text)]">
          {error}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-10 items-center rounded-[var(--panel-radius-control)] border border-[color:var(--panel-border)] bg-[color:var(--panel-surface)] px-4 text-sm font-semibold text-[color:var(--panel-text)]"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!data) return <RouteProgressBar />;

  return (
    <ReviewsInbox
      data={data}
      businessName={businessName}
      canManage={canManage}
      onReload={load}
    />
  );
}

export function ReviewsInbox({
  data,
  businessName,
  canManage,
  onReload,
  initialTab = "feedback",
}: {
  data: ReviewsOverview;
  businessName: string;
  canManage: boolean;
  onReload?: () => void | Promise<void>;
  initialTab?: InboxTab;
}) {
  const [tab, setTab] = useState<InboxTab>(initialTab);
  const [feedbackFilter, setFeedbackFilter] = useState<FeedbackFilter>("all");
  const [googleFilter, setGoogleFilter] = useState<GoogleFilter>("all");
  const [showGoogleManager, setShowGoogleManager] = useState(false);
  const { google, summary } = data;

  return (
    <div
      className="space-y-5 pb-10"
      style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
    >
      <PageHeader
        title="Reseñas"
        subtitle="Escuchá a tus clientes y cuidá tu reputación."
        actions={
          <GoogleStatus
            google={google}
            summary={summary}
            periodDays={data.periodDays}
            businessName={businessName}
            canManage={canManage}
            onManage={() => setShowGoogleManager(true)}
          />
        }
      />

      <nav
        className="flex gap-1 border-b border-[color:var(--panel-border)]"
        aria-label="Tipo de reseña"
      >
        <TabButton
          active={tab === "feedback"}
          onClick={() => setTab("feedback")}
        >
          Feedback privado
        </TabButton>
        <TabButton active={tab === "google"} onClick={() => setTab("google")}>
          Reseñas de Google
        </TabButton>
      </nav>

      {tab === "feedback" ? (
        <PrivateFeedbackInbox
          data={data}
          filter={feedbackFilter}
          onFilterChange={setFeedbackFilter}
        />
      ) : (
        <GoogleReviewsInbox
          data={data}
          filter={googleFilter}
          onFilterChange={setGoogleFilter}
          canManage={canManage}
          onConnect={() => setShowGoogleManager(true)}
        />
      )}

      {showGoogleManager ? (
        <GoogleConnectModal
          businessName={businessName}
          onClose={() => setShowGoogleManager(false)}
          onConnected={() => {
            setShowGoogleManager(false);
            void onReload?.();
          }}
        />
      ) : null}
    </div>
  );
}

function GoogleStatus({
  google,
  summary,
  periodDays,
  businessName,
  canManage,
  onManage,
}: {
  google: ReviewsOverview["google"];
  summary: ReviewsOverview["summary"];
  periodDays: number;
  businessName: string;
  canManage: boolean;
  onManage: () => void;
}) {
  if (!google.connected) {
    return (
      <div className="flex items-center gap-3 rounded-[var(--panel-radius-control)] border border-amber-200 bg-amber-50 px-3 py-2">
        <GoogleLogo className="h-5 w-5 shrink-0" />
        <div>
          <p className="text-xs font-semibold text-amber-900">
            Google no conectado
          </p>
          <p className="text-[11px] text-amber-800/70">
            Tu reputación pública aún no está vinculada.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={onManage}
            className="ml-1 rounded-lg bg-[color:var(--panel-accent)] px-3 py-1.5 text-xs font-semibold text-white"
          >
            Conectar
          </button>
        ) : null}
      </div>
    );
  }

  const rating = summary.googleRating ?? google.placeRating;
  const total = summary.googleReviewsTotal ?? google.placeUserRatingCount;

  return (
    <div className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[var(--panel-radius-control)] border border-[color:var(--panel-border)] bg-[color:var(--panel-surface)] px-3 py-2 text-xs">
      <span className="inline-flex items-center gap-1.5 font-semibold text-[color:var(--panel-success-text)]">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Google conectado
      </span>
      <span className="max-w-40 truncate text-[color:var(--panel-text-secondary)]">
        {google.placeDisplayName ?? businessName}
      </span>
      {rating !== null ? <strong>{rating.toFixed(1)} ★</strong> : null}
      {total !== null ? <span>{total} reseñas</span> : null}
      <span className="font-semibold text-[color:var(--panel-accent)]">
        +{summary.inPeriod} últimos {periodDays} días
      </span>
      {canManage ? (
        <button
          type="button"
          onClick={onManage}
          className="font-semibold text-[color:var(--panel-accent)] hover:underline"
        >
          Administrar
        </button>
      ) : null}
    </div>
  );
}

function PrivateFeedbackInbox({
  data,
  filter,
  onFilterChange,
}: {
  data: ReviewsOverview;
  filter: FeedbackFilter;
  onFilterChange: (filter: FeedbackFilter) => void;
}) {
  const attentionIds = useMemo(
    () => new Set(data.toReview.map((item) => item.id)),
    [data.toReview],
  );
  const filtered =
    filter === "attention"
      ? data.toReview
      : filterPrivateFeedback(data.feedback, filter, attentionIds);
  const attention = data.toReview;
  const recentWithoutAttention = data.feedback.filter(
    (item) => !attentionIds.has(item.id),
  );

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[color:var(--panel-border)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-4 w-4 text-[color:var(--panel-accent)]" />
            <h2 className="text-sm font-semibold text-[color:var(--panel-text)]">
              Feedback privado
            </h2>
            <PrivacyBadge>Privado</PrivacyBadge>
          </div>
          <p className="mt-1 text-xs text-[color:var(--panel-text-muted)]">
            Solo lo ve tu equipo; no se publica en Google.
          </p>
        </div>
        <p className="text-xs text-[color:var(--panel-text-secondary)]">
          <strong className="text-[color:var(--panel-text)]">
            {data.summary.feedbackInPeriod}
          </strong>{" "}
          recibidos en {data.periodDays} días ·{" "}
          <strong className="text-[color:var(--panel-danger-text)]">
            {attention.length === 20 ? "20+" : attention.length}
          </strong>{" "}
          para atender
        </p>
      </div>

      <FilterBar>
        <FilterButton
          active={filter === "all"}
          onClick={() => onFilterChange("all")}
        >
          Todos
        </FilterButton>
        <FilterButton
          active={filter === "attention"}
          onClick={() => onFilterChange("attention")}
        >
          Para atender
        </FilterButton>
        <FilterButton
          active={filter === "positive"}
          onClick={() => onFilterChange("positive")}
        >
          Positivos
        </FilterButton>
      </FilterBar>

      {data.feedback.length === 0 ? (
        <EmptyState
          title="Todavía no recibiste feedback"
          description="Cuando tus clientes dejen una opinión privada, aparece acá."
        />
      ) : filter === "all" ? (
        <div>
          {attention.length > 0 ? (
            <FeedbackSection title="Feedback para atender" attention>
              {attention.map((item) => (
                <FeedbackRow key={item.id} item={item} attention />
              ))}
            </FeedbackSection>
          ) : null}
          <FeedbackSection title="Feedback reciente">
            {recentWithoutAttention.length > 0 ? (
              recentWithoutAttention.map((item) => (
                <FeedbackRow key={item.id} item={item} />
              ))
            ) : (
              <InlineEmpty>
                Todo el feedback reciente está en la sección para atender.
              </InlineEmpty>
            )}
          </FeedbackSection>
        </div>
      ) : filtered.length > 0 ? (
        <div className="divide-y divide-[color:var(--panel-border)]">
          {filtered.map((item) => (
            <FeedbackRow
              key={item.id}
              item={item}
              attention={attentionIds.has(item.id)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            filter === "attention"
              ? "No hay feedback para atender"
              : "No hay feedback positivo todavía"
          }
          description={
            filter === "attention"
              ? "No encontramos comentarios de baja puntuación pendientes en esta bandeja."
              : "Los comentarios de 4 y 5 estrellas aparecerán acá."
          }
        />
      )}
    </Card>
  );
}

function GoogleReviewsInbox({
  data,
  filter,
  onFilterChange,
  canManage,
  onConnect,
}: {
  data: ReviewsOverview;
  filter: GoogleFilter;
  onFilterChange: (filter: GoogleFilter) => void;
  canManage: boolean;
  onConnect: () => void;
}) {
  const reviews = filterGoogleReviews(data.reviews, filter);

  if (!data.google.connected) {
    return (
      <Card className="py-12 text-center">
        <GoogleLogo className="mx-auto h-8 w-8" />
        <h2 className="mt-4 text-base font-semibold">
          Conectá tu perfil de Google
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[color:var(--panel-text-secondary)]">
          Conectá tu perfil de Google para seguir tu reputación y leer las
          reseñas públicas desde Flikker.
        </p>
        {canManage ? (
          <button
            type="button"
            onClick={onConnect}
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-[var(--panel-radius-control)] bg-[color:var(--panel-accent)] px-4 text-sm font-semibold text-white"
          >
            <Search className="h-4 w-4" />
            Buscar mi negocio
          </button>
        ) : null}
      </Card>
    );
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[color:var(--panel-border)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <div className="flex items-center gap-2">
            <GoogleLogo className="h-4 w-4" />
            <h2 className="text-sm font-semibold">Reseñas de Google</h2>
            <PrivacyBadge publicLabel>Público en Google</PrivacyBadge>
          </div>
          <p className="mt-1 text-xs text-[color:var(--panel-text-muted)]">
            Opiniones públicas importadas del perfil vinculado.
          </p>
        </div>
        <div className="text-xs text-[color:var(--panel-text-secondary)]">
          {data.summary.googleRating !== null ? (
            <strong>{data.summary.googleRating.toFixed(1)} ★</strong>
          ) : null}
          {data.summary.googleReviewsTotal !== null
            ? ` · ${data.summary.googleReviewsTotal} reseñas`
            : null}
          <span className="text-[color:var(--panel-text-muted)]">
            {" "}
            · {data.summary.sinceFlikker} nuevas desde Flikker
          </span>
        </div>
      </div>

      {data.google.historySync?.status === "running" ? (
        <p className="flex items-center gap-2 border-b border-[color:var(--panel-border)] bg-[color:var(--panel-surface-subtle)] px-5 py-3 text-xs text-[color:var(--panel-text-secondary)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Sincronizando historial de Google
        </p>
      ) : null}

      <FilterBar>
        <FilterButton
          active={filter === "all"}
          onClick={() => onFilterChange("all")}
        >
          Todas
        </FilterButton>
        <FilterButton
          active={filter === "low"}
          onClick={() => onFilterChange("low")}
        >
          1–2 estrellas
        </FilterButton>
        <FilterButton
          active={filter === "neutral"}
          onClick={() => onFilterChange("neutral")}
        >
          3 estrellas
        </FilterButton>
        <FilterButton
          active={filter === "high"}
          onClick={() => onFilterChange("high")}
        >
          4–5 estrellas
        </FilterButton>
      </FilterBar>

      {reviews.length > 0 ? (
        <div className="divide-y divide-[color:var(--panel-border)]">
          {reviews.map((review) => (
            <GoogleReviewRow
              key={review.id}
              review={review}
              reviewsUrl={data.google.placeReviewsUri}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No hay reseñas nuevas en este período"
          description={
            filter === "all"
              ? "Cuando Google importe una reseña reciente, aparecerá acá."
              : "No hay reseñas que coincidan con este filtro."
          }
        />
      )}
    </Card>
  );
}

function FeedbackSection({
  title,
  attention = false,
  children,
}: {
  title: string;
  attention?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div
        className={`flex items-center gap-2 border-b border-[color:var(--panel-border)] px-4 py-2.5 sm:px-5 ${attention ? "bg-red-50/60" : "bg-[color:var(--panel-surface-subtle)]"}`}
      >
        {attention ? (
          <AlertCircle className="h-3.5 w-3.5 text-[color:var(--panel-danger-text)]" />
        ) : null}
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--panel-text-secondary)]">
          {title}
        </h3>
      </div>
      <div className="divide-y divide-[color:var(--panel-border)]">
        {children}
      </div>
    </section>
  );
}

function FeedbackRow({
  item,
  attention = false,
}: {
  item: PrivateFeedback;
  attention?: boolean;
}) {
  return (
    <article
      className={`grid gap-2 px-4 py-4 sm:grid-cols-[132px_minmax(0,1fr)_auto] sm:items-start sm:px-5 ${attention ? "bg-red-50/25" : ""}`}
    >
      <Stars score={item.score} />
      <div className="min-w-0">
        <p className="text-sm leading-6 text-[color:var(--panel-text)]">
          {item.comment?.trim() || "Sin comentario escrito."}
        </p>
        {item.customer?.name ? (
          <p className="mt-1 text-xs text-[color:var(--panel-text-muted)]">
            {item.customer.name}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2 sm:flex-col sm:items-end">
        <time className="whitespace-nowrap text-xs text-[color:var(--panel-text-muted)]">
          {relativeDay(item.createdAt)}
        </time>
        {attention ? (
          <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-semibold text-[color:var(--panel-danger-text)]">
            Requiere atención
          </span>
        ) : null}
      </div>
    </article>
  );
}

function GoogleReviewRow({
  review,
  reviewsUrl,
}: {
  review: GoogleReviewItem;
  reviewsUrl: string | null;
}) {
  return (
    <article className="grid gap-2 px-4 py-4 sm:grid-cols-[132px_minmax(0,1fr)_auto] sm:items-start sm:px-5">
      <Stars score={review.stars} />
      <div className="min-w-0">
        <p className="text-sm leading-6 text-[color:var(--panel-text)]">
          {review.text?.trim() || "Calificación sin comentario escrito."}
        </p>
        <p className="mt-1 text-xs text-[color:var(--panel-text-muted)]">
          {review.author ?? "Autor no informado"}
        </p>
      </div>
      <div className="flex items-center gap-3 sm:flex-col sm:items-end">
        <time className="whitespace-nowrap text-xs text-[color:var(--panel-text-muted)]">
          {relativeDay(review.postedAt)}
        </time>
        {reviewsUrl ? (
          <a
            href={reviewsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--panel-accent)] hover:underline"
          >
            Ver en Google <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>
    </article>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`relative px-3 pb-3 pt-1 text-sm font-semibold transition-colors ${active ? "text-[color:var(--panel-accent)] after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:bg-[color:var(--panel-accent)]" : "text-[color:var(--panel-text-secondary)] hover:text-[color:var(--panel-text)]"}`}
    >
      {children}
    </button>
  );
}

function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-1.5 border-b border-[color:var(--panel-border)] px-4 py-3 sm:px-5">
      {children}
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${active ? "border-[color:var(--panel-accent)] bg-[color:var(--panel-accent-soft)] text-[color:var(--panel-accent)]" : "border-[color:var(--panel-border)] text-[color:var(--panel-text-secondary)] hover:border-[color:var(--panel-border-strong)]"}`}
    >
      {children}
    </button>
  );
}

function PrivacyBadge({
  children,
  publicLabel = false,
}: {
  children: React.ReactNode;
  publicLabel?: boolean;
}) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-[10px] font-semibold ${publicLabel ? "bg-blue-50 text-blue-700" : "bg-[color:var(--panel-accent-soft)] text-[color:var(--panel-accent)]"}`}
    >
      {children}
    </span>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="px-5 py-14 text-center">
      <p className="text-sm font-semibold text-[color:var(--panel-text)]">
        {title}
      </p>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-[color:var(--panel-text-muted)]">
        {description}
      </p>
    </div>
  );
}

function InlineEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-5 py-5 text-sm text-[color:var(--panel-text-muted)]">
      {children}
    </p>
  );
}
