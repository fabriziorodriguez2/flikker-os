import Link from "next/link";
import ReviewRowActions from "./review-row-actions";
import type { ReviewSummary } from "./types";
import { FEATURES } from "@/src/config/features";

interface ReviewsTableProps {
  reviews: ReviewSummary[];
  readOnly?: boolean;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-UY", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function renderStars(rating: number) {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

function formatResponder(review: ReviewSummary) {
  if (!review.respondedBy) return "Respondida";

  const fullName = [review.respondedBy.firstName, review.respondedBy.lastName]
    .filter(Boolean)
    .join(" ");

  return fullName.length > 0  `Respondida por ${fullName}` : "Respondida";
}

function formatReviewStatus(status: string) {
  const labels: Record<string, string> = {
    NEW: "Nueva",
    REVIEWED: "Revisada",
    RESPONDED: "Respondida",
    ARCHIVED: "Archivada",
  };

  return labels[status]  status;
}

export default function ReviewsTable({
  reviews,
  readOnly = false,
}: ReviewsTableProps) {
  const desktopGrid = readOnly
     "grid-cols-[minmax(0,1.5fr)_220px_180px]"
    : "grid-cols-[minmax(0,1.5fr)_220px_180px_220px]";

  return (
    <div className="space-y-4">
      <div className="hidden overflow-hidden rounded-[28px] border border-[color:var(--border)] bg-[color:var(--surface)] lg:block">
        <div
          className={`grid ${desktopGrid} gap-4 border-b border-[color:var(--border)] bg-[color:var(--surface-muted)] px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]`}
        >
          <div>Reseña</div>
          <div>Campaña</div>
          <div>Estado</div>
          {!readOnly  <div className="text-right">Acciones</div> : null}
        </div>

        <div className="divide-y divide-[color:var(--border)]">
          {reviews.map((review) => {
            const isResponded = Boolean(review.respondedAt);

            return (
              <div
                key={review.id}
                className={`grid ${desktopGrid} gap-4 px-6 py-5 hover:bg-[color:var(--surface-muted)]/55`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-[color:var(--brand-warm)]">
                      {renderStars(review.rating)}
                    </span>
                    <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                      {review.rating}/5
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--text-muted)]">
                    <span>
                      {review.authorDisplayName  "Autor no informado"}
                    </span>
                    <span>{formatDate(review.reviewedAt)}</span>
                  </div>

                  <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm leading-7 text-[color:var(--foreground)]">
                    {review.content?.trim() || "Sin texto cargado."}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {review.isHighlighted  (
                      <span className="rounded-full bg-[color:rgba(250,171,75,0.18)] px-3 py-1 text-xs font-semibold text-[color:var(--warning-text)]">
                        Destacada
                      </span>
                    ) : null}
                    {FEATURES.MANUAL_RESPONSES && isResponded  (
                      <span className="rounded-full bg-[color:var(--success-bg)] px-3 py-1 text-xs font-semibold text-[color:var(--success-text)]">
                        {formatResponder(review)}
                      </span>
                    ) : FEATURES.MANUAL_RESPONSES  (
                      <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1 text-xs font-semibold text-[color:var(--text-muted)]">
                        Sin responder
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="text-sm text-[color:var(--text-muted)]">
                  {review.campaign  (
                    <div className="rounded-[20px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4">
                      <div className="font-semibold text-[color:var(--foreground)]">
                        {review.campaign.name}
                      </div>
                      {review.campaign.slug  (
                        <div className="mt-1 text-xs uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
                          {review.campaign.slug}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-[color:var(--text-soft)]">
                      Sin campaña
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  <span className="inline-flex rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                    {formatReviewStatus(review.status)}
                  </span>
                  {FEATURES.MANUAL_RESPONSES && review.respondedAt  (
                    <div className="text-xs text-[color:var(--text-muted)]">
                      {formatDate(review.respondedAt)}
                    </div>
                  ) : null}
                </div>

                {!readOnly  (
                  <div className="flex flex-col items-end gap-3">
                    <ReviewRowActions
                      reviewId={review.id}
                      isHighlighted={review.isHighlighted}
                      isResponded={isResponded}
                    />
                    <div className="flex flex-col items-end gap-2 text-sm">
                      <Link
                        href={`/dashboard/reviews/${review.id}`}
                        className="font-medium text-[color:var(--brand-accent)] hover:text-[color:var(--brand-primary)]"
                      >
                        Ver detalle
                      </Link>
                      {FEATURES.MANUAL_RESPONSES && !isResponded  (
                        <Link
                          href={`/dashboard/reviews/${review.id}`}
                          className="text-[color:var(--text-muted)] hover:text-[color:var(--foreground)]"
                        >
                          Responder
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:hidden">
        {reviews.map((review) => {
          const isResponded = Boolean(review.respondedAt);

          return (
            <article
              key={review.id}
              className="flikker-card rounded-[28px] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-[color:var(--brand-warm)]">
                    {renderStars(review.rating)}
                  </div>
                  <div className="mt-2 text-base font-semibold text-[color:var(--foreground)]">
                    {review.authorDisplayName  "Autor no informado"}
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                    {formatDate(review.reviewedAt)}
                  </div>
                </div>

                <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                  {formatReviewStatus(review.status)}
                </span>
              </div>

              <p className="mt-4 text-sm leading-7 text-[color:var(--foreground)]">
                {review.content?.trim() || "Sin texto cargado."}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {review.campaign  (
                  <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-1 text-xs font-semibold text-[color:var(--text-muted)]">
                    {review.campaign.name}
                  </span>
                ) : null}
                {review.isHighlighted  (
                  <span className="rounded-full bg-[color:rgba(250,171,75,0.18)] px-3 py-1 text-xs font-semibold text-[color:var(--warning-text)]">
                    Destacada
                  </span>
                ) : null}
                {FEATURES.MANUAL_RESPONSES  (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      isResponded
                         "bg-[color:var(--success-bg)] text-[color:var(--success-text)]"
                        : "border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text-muted)]"
                    }`}
                  >
                    {isResponded  formatResponder(review) : "Sin responder"}
                  </span>
                ) : null}
              </div>

              {!readOnly  (
                <div className="mt-5 space-y-3">
                  <ReviewRowActions
                    reviewId={review.id}
                    isHighlighted={review.isHighlighted}
                    isResponded={isResponded}
                  />
                  <div className="flex flex-wrap gap-3 text-sm">
                    <Link
                      href={`/dashboard/reviews/${review.id}`}
                      className="font-medium text-[color:var(--brand-accent)]"
                    >
                      Ver detalle
                    </Link>
                    {FEATURES.MANUAL_RESPONSES && !isResponded  (
                      <Link
                        href={`/dashboard/reviews/${review.id}`}
                        className="text-[color:var(--text-muted)]"
                      >
                        Responder
                      </Link>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
