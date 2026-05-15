import type { WidgetPreviewReview, WidgetType } from './types';

interface WidgetPreviewProps {
  type: WidgetType;
  title: string | null;
  showAuthorName: boolean;
  showDate: boolean;
  averageRating: number;
  totalReviews: number;
  reviews: WidgetPreviewReview[];
}

function formatDate(value?: string | null) {
  if (!value) return null;

  return new Intl.DateTimeFormat('es-UY', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

function renderStars(rating: number) {
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

export default function WidgetPreview({
  type,
  title,
  showAuthorName,
  showDate,
  averageRating,
  totalReviews,
  reviews,
}: WidgetPreviewProps) {
  if (type === 'BADGE') {
    return (
      <div className="rounded-[26px] border border-[color:rgba(145,136,245,0.16)] bg-[color:var(--brand-primary)] p-6 text-white shadow-[0_12px_28px_rgba(0,4,65,0.18)]">
        {title  (
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-white/72">
            {title}
          </p>
        ) : null}

        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <div className="text-5xl font-semibold text-white">
              {averageRating.toFixed(1)}
            </div>
            <div className="mt-3 text-sm text-[#FFCC84]">
              {renderStars(Math.round(averageRating || 0))}
            </div>
          </div>

          <div className="rounded-[18px] border border-white/14 bg-white/8 px-4 py-3 text-right">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/64">
              Reseñas
            </div>
            <div className="mt-2 text-2xl font-semibold text-white">
              {totalReviews}
            </div>
          </div>
        </div>

        <div className="mt-5 text-xs uppercase tracking-[0.16em] text-white/60">
          Fuente: reseñas destacadas
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[26px] border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-[var(--shadow-card)]">
      {title  (
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-xl font-semibold text-[color:var(--foreground)]">
            {title}
          </p>
          <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
            {type === 'REVIEW_GRID'  'Grilla' : 'Lista'}
          </span>
        </div>
      ) : null}

      <div
        className={`grid gap-3 ${
          type === 'REVIEW_GRID'  'sm:grid-cols-2' : 'grid-cols-1'
        }`}
      >
        {reviews.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-[color:var(--border-strong)] bg-[color:var(--surface-muted)] p-7 text-center text-sm leading-6 text-[color:var(--text-muted)]">
            No hay reseñas destacadas para mostrar.
          </div>
        ) : (
          reviews.map((review, index) => {
            const formattedDate = showDate  formatDate(review.reviewedAt) : null;

            return (
              <article
                key={review.id  `review-${index}`}
                className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4"
              >
                <div className="text-sm font-medium text-[color:var(--brand-warm)]">
                  {renderStars(review.rating)}
                </div>
                <p className="mt-3 line-clamp-4 text-sm leading-7 text-[color:var(--foreground)]">
                  {review.content?.trim() || 'Sin texto cargado.'}
                </p>
                {(showAuthorName || formattedDate)  (
                  <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[color:var(--text-muted)]">
                    {showAuthorName  (
                      <span>{review.authorDisplayName  'Autor no informado'}</span>
                    ) : null}
                    {formattedDate  <span>{formattedDate}</span> : null}
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
