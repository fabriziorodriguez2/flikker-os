'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useCanMutate } from '../../role-context';
import PageHeader from '@/components/ui/page-header';
import SectionCard from '@/components/ui/section-card';
import MetricCard from '@/components/ui/metric-card';
import PreviewFrame from '@/components/widgets/preview-frame';
import WidgetCard from '@/components/widgets/widget-card';
import WidgetPreview from '@/components/widgets/widget-preview';
import type {
  Widget,
  WidgetCreateInput,
  WidgetEmbedInfo,
  WidgetPreviewReview,
  WidgetType,
} from '@/components/widgets/types';

const inputClass = 'flikker-input w-full px-4 py-3 text-sm';

const DEFAULT_FORM: WidgetCreateInput = {
  name: '',
  type: 'BADGE',
  title: '',
  maxItems: 6,
  showAuthorName: true,
  showDate: false,
};

interface ReviewsResponse {
  data: WidgetPreviewReview[];
  total: number;
}

function buildPreviewReviews(
  reviews: WidgetPreviewReview[],
  type: WidgetType,
  maxItems: number,
) {
  if (type === 'BADGE') return [];
  return reviews.slice(0, maxItems);
}

function getAverageRating(reviews: WidgetPreviewReview[]) {
  if (reviews.length === 0) return 0;

  const total = reviews.reduce((sum, review) => sum + review.rating, 0);
  return Number((total / reviews.length).toFixed(1));
}

function widgetTypeLabel(type: WidgetType) {
  switch (type) {
    case 'BADGE':
      return 'Badge';
    case 'REVIEW_GRID':
      return 'Grilla';
    default:
      return 'Lista';
  }
}

function buildFrontendPublicWidgetUrl(publicToken: string) {
  if (typeof window === 'undefined') {
    return `/public/widgets/${publicToken}`;
  }

  return `${window.location.origin}/public/widgets/${publicToken}`;
}

export default function WidgetsPage() {
  const canMutate = useCanMutate();
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [highlightedReviews, setHighlightedReviews] = useState<
    WidgetPreviewReview[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [embedMessage, setEmbedMessage] = useState<string | null>(null);
  const [embedError, setEmbedError] = useState<string | null>(null);
  const [form, setForm] = useState<WidgetCreateInput>(DEFAULT_FORM);
  const [embedInfoByWidgetId, setEmbedInfoByWidgetId] = useState<
    Record<string, WidgetEmbedInfo>
  >({});
  const [embedLoadingId, setEmbedLoadingId] = useState<string | null>(null);
  const [statusLoadingId, setStatusLoadingId] = useState<string | null>(null);

  const fetchWidgets = useCallback(async () => {
    const res = await fetch('/api/proxy/widgets');
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message ?? 'Error al cargar widgets');
    }

    return (await res.json()) as Widget[];
  }, []);

  const fetchHighlightedReviews = useCallback(async () => {
    const res = await fetch(
      '/api/proxy/reviews?isHighlighted=true&limit=12&sortBy=reviewedAt',
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message ?? 'Error al cargar reseñas destacadas');
    }

    const data = (await res.json()) as ReviewsResponse;
    return data.data;
  }, []);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [widgetsData, highlightedData] = await Promise.all([
        fetchWidgets(),
        fetchHighlightedReviews(),
      ]);

      setWidgets(widgetsData);
      setHighlightedReviews(highlightedData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar widgets');
    } finally {
      setLoading(false);
    }
  }, [fetchHighlightedReviews, fetchWidgets]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const averageRating = useMemo(
    () => getAverageRating(highlightedReviews),
    [highlightedReviews],
  );

  const formPreviewReviews = useMemo(
    () => buildPreviewReviews(highlightedReviews, form.type, form.maxItems),
    [highlightedReviews, form.maxItems, form.type],
  );

  function updateForm<K extends keyof WidgetCreateInput>(
    key: K,
    value: WidgetCreateInput[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setForm(DEFAULT_FORM);
    setFormError(null);
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    setMessage(null);

    try {
      const res = await fetch('/api/proxy/widgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          title: form.title.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? 'No se pudo crear el widget');
      }

      setMessage('Widget creado en borrador');
      resetForm();
      await loadPage();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Error al crear widget');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(widget: Widget) {
    setStatusLoadingId(widget.id);
    setEmbedError(null);
    setEmbedMessage(null);

    const nextStatus = widget.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    try {
      const res = await fetch(`/api/proxy/widgets/${widget.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? 'No se pudo actualizar el widget');
      }

      await loadPage();
    } catch (e) {
      setEmbedError(
        e instanceof Error ? e.message : 'Error al actualizar estado',
      );
    } finally {
      setStatusLoadingId(null);
    }
  }

  async function ensureEmbedInfo(widgetId: string) {
    const existing = embedInfoByWidgetId[widgetId];
    if (existing) return existing;

    setEmbedLoadingId(widgetId);

    try {
      const res = await fetch(`/api/proxy/widgets/${widgetId}/embed`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? 'No se pudo generar el embed');
      }

      const data = (await res.json()) as WidgetEmbedInfo;
      const frontendEmbedInfo = {
        ...data,
        publicUrl: buildFrontendPublicWidgetUrl(data.publicToken),
      };
      setEmbedInfoByWidgetId((current) => ({
        ...current,
        [widgetId]: frontendEmbedInfo,
      }));
      return frontendEmbedInfo;
    } finally {
      setEmbedLoadingId(null);
    }
  }

  async function copyEmbed(widget: Widget) {
    setEmbedError(null);
    setEmbedMessage(null);

    try {
      const embedInfo = await ensureEmbedInfo(widget.id);
      const iframe = `<iframe src="${embedInfo.publicUrl}" title="${widget.name}" loading="lazy" style="width:100%;border:0;min-height:320px;" referrerpolicy="no-referrer-when-downgrade"></iframe>`;

      await navigator.clipboard.writeText(iframe);
      setEmbedMessage(`Embed copiado para "${widget.name}"`);
    } catch (e) {
      setEmbedError(
        e instanceof Error ? e.message : 'No se pudo copiar el embed',
      );
    }
  }

  async function copyPublicUrl(widget: Widget) {
    setEmbedError(null);
    setEmbedMessage(null);

    try {
      const embedInfo = await ensureEmbedInfo(widget.id);
      await navigator.clipboard.writeText(embedInfo.publicUrl);
      setEmbedMessage(`URL copiada para "${widget.name}"`);
    } catch (e) {
      setEmbedError(
        e instanceof Error ? e.message : 'No se pudo copiar la URL',
      );
    }
  }

  const widgetsActive = widgets.filter((widget) => widget.status === 'ACTIVE').length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Widgets"
        title="Widgets"
        subtitle="Configura, activa y copia el embed."
      />

      {error ? (
        <div
          className="rounded-[24px] border px-5 py-4 text-sm text-[color:var(--danger-text)]"
          style={{
            backgroundColor: 'var(--danger-bg)',
            borderColor: 'rgba(161,45,58,0.16)',
          }}
        >
          {error}
        </div>
      ) : null}

      {embedError ? (
        <div
          className="rounded-[24px] border px-5 py-4 text-sm text-[color:var(--danger-text)]"
          style={{
            backgroundColor: 'var(--danger-bg)',
            borderColor: 'rgba(161,45,58,0.16)',
          }}
        >
          {embedError}
        </div>
      ) : null}

      {embedMessage ? (
        <div
          className="rounded-[24px] border px-5 py-4 text-sm text-[color:var(--success-text)]"
          style={{
            backgroundColor: 'var(--success-bg)',
            borderColor: 'rgba(21,102,63,0.14)',
          }}
        >
          {embedMessage}
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <div className="flikker-card rounded-[28px] p-6 md:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-soft)]">
            Resumen
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-[color:var(--foreground)]">
            Estado de widgets
          </h2>
          <p className="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">
            Fuente disponible, rating medio y widgets activos.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <MetricCard label="Destacadas" value={highlightedReviews.length} tone="accent" />
            <MetricCard label="Rating medio" value={averageRating.toFixed(1)} />
            <MetricCard label="Activos" value={widgetsActive} />
          </div>
        </div>

        <SectionCard
          title="Fuente"
          description="Los widgets usan reseñas destacadas."
          action={
            <Link
              href="/dashboard/reviews?highlighted=true"
              className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)] hover:border-[color:var(--brand-accent)] hover:text-[color:var(--foreground)]"
            >
              Ver destacadas
            </Link>
          }
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard
              label="Destacadas"
              value={highlightedReviews.length}
              hint="Disponibles para widgets"
              tone="accent"
            />
            <MetricCard
              label="Rating medio"
              value={averageRating.toFixed(1)}
              hint="Promedio visible"
            />
            <MetricCard
              label="Estado"
              value={highlightedReviews.length > 0 ? 'Listo' : 'Pendiente'}
              hint={
                highlightedReviews.length > 0
                  ? 'Puedes activarlos'
                  : 'Necesitas al menos una reseña destacada'
              }
              tone="warm"
            />
          </div>

          {highlightedReviews.length === 0 ? (
            <div
              className="mt-4 rounded-[22px] border px-4 py-4 text-sm text-[color:var(--warning-text)]"
              style={{
                backgroundColor: 'var(--warning-bg)',
                borderColor: 'rgba(250,171,75,0.2)',
              }}
            >
              Todavía no hay reseñas destacadas.
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {highlightedReviews.slice(0, 3).map((review) => (
                <div
                  key={review.id}
                  className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-[color:var(--foreground)]">
                      {review.authorDisplayName ?? 'Autor no informado'}
                    </div>
                    <div className="text-xs text-[color:var(--brand-warm)]">
                      {'★'.repeat(review.rating)}
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-[color:var(--text-muted)]">
                    {review.content?.trim() || 'Sin texto cargado.'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <SectionCard
            title="Crear widget"
            description="Tipo, contenido visible y cantidad."
          >
            {!canMutate ? (
              <p className="text-sm leading-7 text-[color:var(--text-muted)]">
                Tienes acceso de solo lectura. Puedes ver los widgets, pero no crear nuevos.
              </p>
            ) : (
              <form onSubmit={handleCreate} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                      Nombre
                    </label>
                    <input
                      value={form.name}
                      onChange={(event) => updateForm('name', event.target.value)}
                      required
                      className={inputClass}
                      placeholder="Widget home"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                      Tipo
                    </label>
                    <select
                      value={form.type}
                      onChange={(event) =>
                        updateForm('type', event.target.value as WidgetType)
                      }
                      className={inputClass}
                    >
                      <option value="BADGE">Badge</option>
                      <option value="REVIEW_LIST">Lista</option>
                      <option value="REVIEW_GRID">Grilla</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                      Título opcional
                    </label>
                    <input
                      value={form.title}
                      onChange={(event) => updateForm('title', event.target.value)}
                      className={inputClass}
                      placeholder="Lo que dicen nuestros clientes"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                      Cantidad
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={form.maxItems}
                      onChange={(event) =>
                        updateForm(
                          'maxItems',
                          Number.parseInt(event.target.value || '1', 10),
                        )
                      }
                      className={inputClass}
                    />
                  </div>

                  <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                      Contenido visible
                    </p>
                    <div className="mt-3 flex flex-col gap-3 text-sm text-[color:var(--foreground)]">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={form.showAuthorName}
                          onChange={(event) =>
                            updateForm('showAuthorName', event.target.checked)
                          }
                        />
                        Mostrar nombre
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={form.showDate}
                          onChange={(event) =>
                            updateForm('showDate', event.target.checked)
                          }
                        />
                        Mostrar fecha
                      </label>
                    </div>
                  </div>
                </div>

                {formError ? (
                  <p className="text-sm text-[color:var(--danger-text)]">{formError}</p>
                ) : null}
                {message ? (
                  <p className="text-sm text-[color:var(--success-text)]">{message}</p>
                ) : null}

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-[16px] bg-[color:var(--brand-primary)] px-5 py-3 text-sm font-semibold text-white hover:bg-[color:var(--brand-accent)] disabled:opacity-60"
                >
                  {saving ? 'Creando...' : 'Crear widget'}
                </button>
              </form>
            )}
          </SectionCard>

          <SectionCard
            title="Widgets creados"
            description="Actívalos cuando la fuente esté lista."
          >
            {loading ? (
              <div className="grid gap-4">
                {Array.from({ length: 2 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-72 animate-pulse rounded-[28px] border border-[color:var(--border)] bg-[color:var(--surface-muted)]"
                  />
                ))}
              </div>
            ) : widgets.length === 0 ? (
              <div className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-6 py-10 text-center">
                <h3 className="text-2xl font-semibold text-[color:var(--foreground)]">
                  Todavía no hay widgets
                </h3>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[color:var(--text-muted)]">
                  Crea el primero para usarlo en el sitio.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {widgets.map((widget) => {
                  const previewReviews = buildPreviewReviews(
                    highlightedReviews,
                    widget.type,
                    widget.maxItems,
                  );

                  return (
                    <WidgetCard
                      key={widget.id}
                      widget={widget}
                      averageRating={averageRating}
                      highlightedReviewCount={highlightedReviews.length}
                      previewReviews={previewReviews}
                      embedInfo={embedInfoByWidgetId[widget.id]}
                      canMutate={canMutate}
                      statusLoading={statusLoadingId === widget.id}
                      embedLoading={embedLoadingId === widget.id}
                      onToggleStatus={handleToggleStatus}
                      onCopyPublicUrl={copyPublicUrl}
                      onCopyEmbed={copyEmbed}
                    />
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <PreviewFrame
            title={`Nuevo ${widgetTypeLabel(form.type)}`}
            description="Vista previa con las reseñas destacadas actuales."
          >
            <WidgetPreview
              type={form.type}
              title={form.title.trim() || null}
              showAuthorName={form.showAuthorName}
              showDate={form.showDate}
              averageRating={averageRating}
              totalReviews={highlightedReviews.length}
              reviews={formPreviewReviews}
            />
          </PreviewFrame>

          <SectionCard
            title="Salida"
            description="URL pública e iframe."
            tone="tinted"
          >
            <div className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
              <ul className="space-y-2 text-sm text-[color:var(--text-muted)]">
                <li>Badge de rating</li>
                <li>Lista o grilla de reseñas destacadas</li>
                <li>Embed por iframe</li>
              </ul>
            </div>
          </SectionCard>
        </div>
      </section>
    </div>
  );
}
