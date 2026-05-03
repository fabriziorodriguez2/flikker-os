"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCanMutate } from "../../role-context";
import PageHeader from "@/components/ui/page-header";
import SectionCard from "@/components/ui/section-card";
import type { Widget, WidgetCreateInput } from "@/components/widgets/types";

const inputClass = "flikker-input w-full px-4 py-3 text-sm";

const DEFAULT_FORM: WidgetCreateInput = {
  name: "Toast social proof",
  type: "REVIEW_LIST",
  mode: "toast",
  position: "bottom_right",
  title: "",
  maxItems: 6,
  minStars: 4,
  primaryColor: "#5B5BD6",
  rotationSeconds: 30,
  showAuthorName: true,
  showDate: true,
};

interface Business {
  id: string;
  name: string;
}

interface PreviewReview {
  id: string;
  rating: number;
  content: string | null;
  authorDisplayName: string | null;
  reviewedAt: string;
}

interface PreviewPayload {
  summary: {
    averageRating: number;
    totalReviews: number;
  };
  reviews: PreviewReview[];
}

function buildSnippet(businessId: string) {
  if (typeof window === "undefined") return "";
  return `<script async src="${window.location.origin}/widget.js" data-business="${businessId}" data-mode="toast"></script>`;
}

function daysAgo(value: string) {
  const days = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 86400000),
  );
  if (days === 0) return "hoy";
  if (days === 1) return "hace 1 dia";
  return `hace ${days} dias`;
}

function stars(value: number) {
  return "★".repeat(value) + "☆".repeat(5 - value);
}

function ToastPreview({
  review,
  color,
  position,
  businessName,
}: {
  review?: PreviewReview;
  color: string;
  position: string;
  businessName: string;
}) {
  return (
    <div className="relative min-h-72 overflow-hidden rounded-[20px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.82),rgba(145,136,245,0.08))]" />
      <div
        className={`absolute bottom-4 w-[min(330px,calc(100%-32px))] ${
          position === "bottom_left" ? "left-4" : "right-4"
        }`}
      >
        {review ? (
          <article className="rounded-[18px] border border-[color:rgba(28,31,64,0.12)] bg-white p-4 shadow-[0_18px_45px_rgba(9,16,43,0.18)]">
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              <p className="truncate text-sm font-semibold text-[#15162f]">
                {review.authorDisplayName ?? "Cliente verificado"}
              </p>
            </div>
            <p className="mt-2 text-sm text-[#f5a524]">
              {stars(review.rating)}
            </p>
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#2d304f]">
              {review.content?.trim() || "Excelente experiencia."}
            </p>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#767a91]">
              {businessName} · {daysAgo(review.reviewedAt)}
            </p>
          </article>
        ) : (
          <div className="rounded-[18px] border border-dashed border-[color:var(--border-strong)] bg-white p-5 text-sm text-[color:var(--text-muted)]">
            No hay reseñas detectadas con este filtro.
          </div>
        )}
      </div>
    </div>
  );
}

export default function WidgetsPage() {
  const canMutate = useCanMutate();
  const [business, setBusiness] = useState<Business | null>(null);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [form, setForm] = useState<WidgetCreateInput>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusLoadingId, setStatusLoadingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeToast = useMemo(
    () => widgets.find((widget) => widget.mode === "toast"),
    [widgets],
  );
  const snippet = business ? buildSnippet(business.id) : "";

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [businessRes, widgetsRes, previewRes] = await Promise.all([
        fetch("/api/proxy/businesses/current"),
        fetch("/api/proxy/widgets"),
        fetch(`/api/proxy/widgets/preview/reviews?minStars=${form.minStars}`),
      ]);

      if (!businessRes.ok || !widgetsRes.ok || !previewRes.ok) {
        throw new Error("No se pudo cargar widgets");
      }

      setBusiness((await businessRes.json()) as Business);
      setWidgets((await widgetsRes.json()) as Widget[]);
      setPreview((await previewRes.json()) as PreviewPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar widgets");
    } finally {
      setLoading(false);
    }
  }, [form.minStars]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    if (!activeToast) return;

    setForm({
      name: activeToast.name,
      type: "REVIEW_LIST",
      mode: "toast",
      position: activeToast.position,
      title: activeToast.title ?? "",
      maxItems: activeToast.maxItems,
      minStars: activeToast.minStars,
      primaryColor: activeToast.primaryColor ?? "#5B5BD6",
      rotationSeconds: activeToast.rotationSeconds,
      showAuthorName: activeToast.showAuthorName,
      showDate: activeToast.showDate,
    });
  }, [activeToast]);

  function updateForm<K extends keyof WidgetCreateInput>(
    key: K,
    value: WidgetCreateInput[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveWidget(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canMutate) return;

    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const path = activeToast
        ? `/api/proxy/widgets/${activeToast.id}`
        : "/api/proxy/widgets";
      const res = await fetch(path, {
        method: activeToast ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          title: form.title.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "No se pudo guardar el widget");
      }

      setMessage(activeToast ? "Widget actualizado" : "Widget creado");
      await loadPage();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar widget");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(widget: Widget) {
    if (!canMutate) return;
    setStatusLoadingId(widget.id);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch(`/api/proxy/widgets/${widget.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: widget.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "No se pudo actualizar estado");
      }

      await loadPage();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al actualizar estado");
    } finally {
      setStatusLoadingId(null);
    }
  }

  async function copySnippet() {
    await navigator.clipboard.writeText(snippet);
    setMessage("Snippet copiado");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Widgets"
        title="Social proof"
        subtitle="Toast embebible para el sitio del negocio."
      />

      {error ? (
        <div className="rounded-[20px] border border-[rgba(161,45,58,0.16)] bg-[color:var(--danger-bg)] px-5 py-4 text-sm text-[color:var(--danger-text)]">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-[20px] border border-[rgba(21,102,63,0.14)] bg-[color:var(--success-bg)] px-5 py-4 text-sm text-[color:var(--success-text)]">
          {message}
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(340px,0.75fr)]">
        <SectionCard
          title="Configuracion"
          description="Modo Toast."
          action={
            activeToast ? (
              <button
                type="button"
                onClick={() => void toggleStatus(activeToast)}
                disabled={statusLoadingId === activeToast.id}
                className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)] hover:border-[color:var(--brand-accent)] hover:text-[color:var(--foreground)] disabled:opacity-60"
              >
                {activeToast.status === "ACTIVE" ? "Pausar" : "Activar"}
              </button>
            ) : null
          }
        >
          <form onSubmit={saveWidget} className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                  Nombre
                </span>
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  disabled={!canMutate}
                />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                  Posicion
                </span>
                <select
                  className={inputClass}
                  value={form.position}
                  onChange={(event) =>
                    updateForm(
                      "position",
                      event.target.value as WidgetCreateInput["position"],
                    )
                  }
                  disabled={!canMutate}
                >
                  <option value="bottom_right">Abajo derecha</option>
                  <option value="bottom_left">Abajo izquierda</option>
                </select>
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                  Minimo estrellas
                </span>
                <select
                  className={inputClass}
                  value={form.minStars}
                  onChange={(event) =>
                    updateForm("minStars", Number(event.target.value))
                  }
                  disabled={!canMutate}
                >
                  <option value={4}>4+</option>
                  <option value={5}>5</option>
                </select>
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                  Color
                </span>
                <input
                  className="h-12 w-full rounded-[14px] border border-[color:var(--border)] bg-[color:var(--surface)] p-1"
                  type="color"
                  value={form.primaryColor}
                  onChange={(event) =>
                    updateForm("primaryColor", event.target.value)
                  }
                  disabled={!canMutate}
                />
              </label>
            </div>

            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                Titulo opcional
              </span>
              <input
                className={inputClass}
                value={form.title}
                onChange={(event) => updateForm("title", event.target.value)}
                disabled={!canMutate}
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={!canMutate || saving}
                className="rounded-[16px] bg-[color:var(--brand-primary)] px-5 py-3 text-sm font-semibold text-white hover:bg-[color:var(--brand-accent)] disabled:opacity-60"
              >
                {saving ? "Guardando..." : activeToast ? "Guardar" : "Crear"}
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard
          title="Preview"
          description={`${preview?.summary.totalReviews ?? 0} reseñas disponibles.`}
          tone="tinted"
        >
          {loading ? (
            <div className="h-72 animate-pulse rounded-[20px] bg-[color:var(--surface-muted)]" />
          ) : (
            <ToastPreview
              review={preview?.reviews[0]}
              color={form.primaryColor}
              position={form.position}
              businessName={business?.name ?? "Flikker"}
            />
          )}
        </SectionCard>
      </section>

      <SectionCard
        title="Snippet"
        description="Codigo generado para este negocio."
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <pre className="overflow-x-auto rounded-[18px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4 text-xs leading-6 text-[color:var(--foreground)]">
            {snippet || "Cargando..."}
          </pre>
          <button
            type="button"
            onClick={() => void copySnippet()}
            disabled={!snippet}
            className="h-12 rounded-[16px] border border-[color:var(--border)] bg-[color:var(--surface)] px-5 text-sm font-semibold text-[color:var(--foreground)] hover:border-[color:var(--brand-accent)] disabled:opacity-60"
          >
            Copiar
          </button>
        </div>
      </SectionCard>
    </div>
  );
}
