import type {
  Widget,
  WidgetEmbedInfo,
  WidgetPreviewReview,
} from './types';
import WidgetPreview from './widget-preview';

interface WidgetCardProps {
  widget: Widget;
  averageRating: number;
  highlightedReviewCount: number;
  previewReviews: WidgetPreviewReview[];
  embedInfo?: WidgetEmbedInfo;
  canMutate: boolean;
  statusLoading: boolean;
  embedLoading: boolean;
  onToggleStatus: (widget: Widget) => void | Promise<void>;
  onCopyPublicUrl: (widget: Widget) => void | Promise<void>;
  onCopyEmbed: (widget: Widget) => void | Promise<void>;
}

function statusClass(status: Widget['status']) {
  switch (status) {
    case 'ACTIVE':
      return 'bg-[color:var(--success-bg)] text-[color:var(--success-text)]';
    case 'DRAFT':
      return 'bg-[color:var(--warning-bg)] text-[color:var(--warning-text)]';
    default:
      return 'border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text-muted)]';
  }
}

function statusLabel(status: Widget['status']) {
  switch (status) {
    case 'ACTIVE':
      return 'Activo';
    case 'DRAFT':
      return 'Borrador';
    case 'INACTIVE':
      return 'Inactivo';
    default:
      return status;
  }
}

export default function WidgetCard({
  widget,
  averageRating,
  highlightedReviewCount,
  previewReviews,
  embedInfo,
  canMutate,
  statusLoading,
  embedLoading,
  onToggleStatus,
  onCopyPublicUrl,
  onCopyEmbed,
}: WidgetCardProps) {
  return (
    <article className="flikker-card rounded-[28px] p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-2xl font-semibold text-[color:var(--foreground)]">
              {widget.name}
            </h3>
            <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
              {widget.type}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${statusClass(widget.status)}`}
            >
                {statusLabel(widget.status)}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
            {widget.title || 'Sin título público.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canMutate ? (
            <button
              onClick={() => void onToggleStatus(widget)}
              disabled={statusLoading}
              className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2 text-sm font-semibold text-[color:var(--text-muted)] hover:border-[color:var(--brand-accent)] hover:text-[color:var(--foreground)] disabled:opacity-60"
            >
              {statusLoading
                 'Guardando...'
                : widget.status === 'ACTIVE'
                   'Desactivar'
                  : 'Activar'}
            </button>
          ) : null}
          <button
            onClick={() => void onCopyPublicUrl(widget)}
            disabled={embedLoading}
            className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2 text-sm font-semibold text-[color:var(--text-muted)] hover:border-[color:var(--brand-accent)] hover:text-[color:var(--foreground)] disabled:opacity-60"
          >
            {embedLoading  'Generando...' : 'Copiar URL'}
          </button>
          <button
            onClick={() => void onCopyEmbed(widget)}
            disabled={embedLoading}
            className="rounded-full bg-[color:var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[color:var(--brand-accent)] disabled:opacity-60"
          >
            Copiar iframe
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
        <div className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface)] p-4 md:p-5">
          <WidgetPreview
            type={widget.type}
            title={widget.title}
            showAuthorName={widget.showAuthorName}
            showDate={widget.showDate}
            averageRating={averageRating}
            totalReviews={highlightedReviewCount}
            reviews={previewReviews}
          />
        </div>

        <div className="space-y-4">
          <div className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
              Configuración
            </p>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="font-semibold text-[color:var(--foreground)]">Cantidad</dt>
                <dd className="mt-1 text-[color:var(--text-muted)]">{widget.maxItems} ítems</dd>
              </div>
              <div>
                <dt className="font-semibold text-[color:var(--foreground)]">Nombre visible</dt>
                <dd className="mt-1 text-[color:var(--text-muted)]">
                  {widget.showAuthorName  'Sí' : 'No'}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[color:var(--foreground)]">Fecha visible</dt>
                <dd className="mt-1 text-[color:var(--text-muted)]">
                  {widget.showDate  'Sí' : 'No'}
                </dd>
              </div>
            </dl>
          </div>

          {embedInfo  (
            <div className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                URL pública
              </p>
              <p className="mt-3 break-all text-sm leading-6 text-[color:var(--foreground)]">
                {embedInfo.publicUrl}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
