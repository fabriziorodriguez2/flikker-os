"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Check, ChevronLeft, ChevronRight } from "lucide-react";
import Switch from "@/components/ui/switch";
import PoweredByFlikker from "@/components/ui/powered-by-flikker";
import type { Widget } from "@/components/widgets/types";

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
  summary: { averageRating: number; totalReviews: number };
  reviews: PreviewReview[];
}

const MODE_OPTIONS = [
  { value: "toast", label: "Toast" },
  { value: "carousel", label: "Carrusel" },
  { value: "grid", label: "Grid" },
] as const;

const POSITION_OPTIONS = [
  { value: "bottom_left", label: "Inferior izquierda" },
  { value: "bottom_right", label: "Inferior derecha" },
] as const;

const STAR_OPTIONS = [1, 2, 3, 4, 5] as const;

function daysAgo(value: string) {
  const days = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 86400000),
  );
  if (days === 0) return "hoy";
  if (days === 1) return "hace 1 día";
  if (days < 30) return `hace ${days} días`;
  const months = Math.max(1, Math.round(days / 30));
  if (months < 12) return `hace ${months} mes${months > 1 ? "es" : ""}`;
  const years = Math.max(1, Math.round(months / 12));
  return `hace ${years} año${years > 1 ? "s" : ""}`;
}

function initial(name: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function StarRow({ rating }: { rating: number }) {
  return (
    <span className="text-xs text-amber-400">
      {Array.from({ length: 5 }, (_, i) => (i < rating ? "★" : "☆")).join("")}
    </span>
  );
}

function Avatar({
  name,
  color,
  size = "md",
}: {
  name: string | null;
  color: string;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  return (
    <div
      className={`${dim} flex shrink-0 items-center justify-center rounded-full font-bold text-white`}
      style={{ backgroundColor: color }}
    >
      {initial(name)}
    </div>
  );
}

function EmptyState({ minStars }: { minStars: number }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center rounded-[12px] bg-[#F5F6FA] p-6 text-center">
      <p className="text-sm text-[#8891A4]">
        No hay reseñas con {minStars}★ o más todavía.
      </p>
    </div>
  );
}

function ToastPreview({
  review,
  color,
  position,
  minStars,
}: {
  review?: PreviewReview;
  color: string;
  position: string;
  minStars: number;
}) {
  return (
    <div className="relative min-h-[220px] overflow-hidden rounded-[12px] bg-[#F5F6FA]">
      {!review ? (
        <EmptyState minStars={minStars} />
      ) : (
        <div
          className={`absolute bottom-4 w-[min(300px,calc(100%-24px))] ${
            position === "bottom_left" ? "left-3" : "right-3"
          }`}
        >
          <article className="relative grid grid-cols-[40px_1fr] gap-2.5 rounded-[16px] border border-[rgba(93,104,135,0.18)] bg-[#e8eefb] py-4 pl-4 pr-10 shadow-[0_12px_32px_rgba(5,12,35,0.18)]">
            <button
              type="button"
              aria-label="Cerrar"
              className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white/60 text-[14px] leading-none text-[#6d7691]"
            >
              ×
            </button>
            <div
              className="flex h-[36px] w-[36px] items-center justify-center rounded-[9px] text-lg font-extrabold text-white"
              style={{ backgroundColor: color }}
            >
              ★
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-extrabold leading-tight text-[#10183d]">
                {review.authorDisplayName ?? "Alguien"} nos dejó{" "}
                {review.rating} estrellas
              </p>
              <p className="mt-1.5 text-[12px] font-bold text-[#ff9f1c]">
                {"★".repeat(review.rating)}
                {"☆".repeat(5 - review.rating)}
              </p>
              <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-[#69718f]">
                <span className="truncate">{daysAgo(review.reviewedAt)}</span>
                <span>·</span>
                <PoweredByFlikker className="shrink-0" />
              </div>
            </div>
          </article>
        </div>
      )}
    </div>
  );
}

function CarouselPreview({
  reviews,
  color,
  bgColor,
  minStars,
}: {
  reviews: PreviewReview[];
  color: string;
  bgColor: string;
  minStars: number;
}) {
  const [idx, setIdx] = useState(0);

  if (!reviews.length) return <EmptyState minStars={minStars} />;

  const total = reviews.length;
  const review = reviews[idx];

  return (
    <div className="rounded-[12px] p-4" style={{ background: bgColor === "transparent" ? "#F5F6FA" : bgColor }}>
      <div className="rounded-[12px] border border-[#E8EAF0] bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <Avatar name={review.authorDisplayName} color={color} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-[#1A202C]">
              {review.authorDisplayName ?? "Anónimo"}
            </p>
            <StarRow rating={review.rating ?? 5} />
          </div>
        </div>
        {review.content && (
          <p className="mt-3 line-clamp-4 text-[13px] leading-relaxed text-[#4A5568]">
            {review.content}
          </p>
        )}
        <p className="mt-2 text-[11px] text-[#A0AEC0]">
          {daysAgo(review.reviewedAt)}
        </p>
      </div>

      {total > 1 && (
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E8EAF0] bg-white text-[#718096] disabled:opacity-30 hover:border-current"
            style={{ color: idx === 0 ? undefined : color }}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="flex gap-1.5">
            {reviews.map((_, i) => (
              <div
                key={i}
                className="h-1.5 rounded-full transition-all duration-200"
                style={{
                  width: i === idx ? "16px" : "6px",
                  backgroundColor: i === idx ? color : "#E2E8F0",
                }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
            disabled={idx === total - 1}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E8EAF0] bg-white text-[#718096] disabled:opacity-30 hover:border-current"
            style={{ color: idx === total - 1 ? undefined : color }}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <p className="mt-2 flex items-center justify-center text-[10px] text-[#CBD5E0]">
        <PoweredByFlikker />
      </p>
    </div>
  );
}

function GridPreview({
  reviews,
  color,
  bgColor,
  minStars,
}: {
  reviews: PreviewReview[];
  color: string;
  bgColor: string;
  minStars: number;
}) {
  if (!reviews.length) return <EmptyState minStars={minStars} />;

  const shown = reviews.slice(0, 6);

  return (
    <div className="rounded-[12px] p-4" style={{ background: bgColor === "transparent" ? "#F5F6FA" : bgColor }}>
      <div className="grid grid-cols-2 gap-2.5">
        {shown.map((review, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-[10px] border border-[#E8EAF0] bg-white p-3"
          >
            <div className="flex items-center gap-2">
              <Avatar name={review.authorDisplayName} color={color} size="sm" />
              <p className="min-w-0 flex-1 truncate text-xs font-bold text-[#1A202C]">
                {review.authorDisplayName ?? "Anónimo"}
              </p>
            </div>
            <StarRow rating={review.rating ?? 5} />
            {review.content && (
              <p className="line-clamp-3 text-[11px] leading-relaxed text-[#4A5568]">
                {review.content}
              </p>
            )}
            <p className="mt-auto text-[10px] text-[#A0AEC0]">
              {daysAgo(review.reviewedAt)}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-2 flex items-center justify-end text-[10px] text-[#CBD5E0]">
        <PoweredByFlikker />
      </p>
    </div>
  );
}

function buildSnippet(
  businessId: string,
  mode: string,
  minStars: number,
  color: string,
  position: string,
  bgColor: string,
) {
  if (typeof window === "undefined") return "";
  const base = window.location.origin;
  const hasBg = (mode === "carousel" || mode === "grid") && bgColor !== "transparent";
  const lines = [
    `<script async`,
    `  src="${base}/widget.js"`,
    `  data-business="${businessId}"`,
    `  data-mode="${mode}"`,
    `  data-min-stars="${minStars}"`,
    `  data-color="${color}"`,
    ...(mode === "toast" ? [`  data-position="${position}"`] : []),
    ...(hasBg ? [`  data-bg="${bgColor}"`] : []),
    `></script>`,
  ];
  return lines.join("\n");
}

function SegmentedButtons<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-[8px] border border-[#E8EAF0] text-xs font-semibold">
      {options.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-2 transition-colors ${i > 0 ? "border-l border-[#E8EAF0]" : ""} ${
            value === opt.value
              ? "bg-[#5C6BC0] text-white"
              : "bg-white text-[#8891A4] hover:bg-[#F5F6FA]"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function WidgetsPage() {
  const [business, setBusiness] = useState<Business | null>(null);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [mode, setMode] = useState<string>("toast");
  const [position, setPosition] = useState<string>("bottom_right");
  const [minStars, setMinStars] = useState(4);
  const [color, setColor] = useState("#5C6BC0");
  const [bgColor, setBgColor] = useState("transparent");
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const activeWidget = useMemo(
    () => widgets.find((w) => w.mode === mode) ?? widgets[0] ?? null,
    [widgets, mode],
  );

  const isActive = activeWidget?.status === "ACTIVE";

  const snippet = useMemo(
    () =>
      business
        ? buildSnippet(business.id, mode, minStars, color, position, bgColor)
        : "",
    [business, mode, minStars, color, position, bgColor],
  );

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bizRes, widRes] = await Promise.all([
        fetch("/api/proxy/businesses/current"),
        fetch("/api/proxy/widgets"),
      ]);
      if (!bizRes.ok || !widRes.ok) throw new Error("No se pudo cargar widgets");
      setBusiness((await bizRes.json()) as Business);
      const ws = (await widRes.json()) as Widget[];
      setWidgets(ws);
      const first = ws.find((w) => w.mode === "toast") ?? ws[0];
      if (first) {
        setMode(first.mode);
        setPosition(first.position);
        setMinStars(first.minStars);
        setColor(first.primaryColor ?? "#5C6BC0");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar widgets");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPreview = useCallback(async (stars: number) => {
    setPreviewLoading(true);
    try {
      const res = await fetch(
        `/api/proxy/widgets/preview/reviews?minStars=${stars}`,
      );
      if (!res.ok) throw new Error("No se pudo cargar la vista previa");
      setPreview((await res.json()) as PreviewPayload);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    void loadPreview(minStars);
  }, [minStars, loadPreview]);

  async function saveWidget(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const path = activeWidget
        ? `/api/proxy/widgets/${activeWidget.id}`
        : "/api/proxy/widgets";
      const res = await fetch(path, {
        method: activeWidget ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Widget principal",
          type: "REVIEW_LIST",
          mode,
          position,
          minStars,
          primaryColor: color,
          maxItems: 6,
          rotationSeconds: 10,
          showAuthorName: true,
          showDate: true,
          title: "",
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(data.message ?? "No se pudo guardar el widget");
      }
      setSaved(true);
      await loadPage();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar widget");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus() {
    if (!activeWidget) return;
    const widgetId = activeWidget.id;
    const nextStatus = isActive ? "INACTIVE" : "ACTIVE";
    const previousWidgets = widgets;

    setTogglingStatus(true);
    setError(null);
    setWidgets((current) =>
      current.map((widget) =>
        widget.id === widgetId ? { ...widget, status: nextStatus } : widget,
      ),
    );

    try {
      const res = await fetch(`/api/proxy/widgets/${widgetId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(data.message ?? "No se pudo actualizar estado");
      }
      const updatedWidget = (await res.json()) as Widget;
      setWidgets((current) =>
        current.map((widget) =>
          widget.id === updatedWidget.id ? updatedWidget : widget,
        ),
      );
    } catch (e) {
      setWidgets(previousWidgets);
      setError(e instanceof Error ? e.message : "Error al actualizar estado");
    } finally {
      setTogglingStatus(false);
    }
  }

  async function copySnippet() {
    if (!snippet) return;
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <h1 className="font-display text-[22px] font-bold text-[#1A202C]">
        Widget
      </h1>

      {error ? (
        <div className="rounded-[12px] border border-red-200 bg-red-50 p-4 text-sm text-[#C0392B]">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="h-[400px] animate-pulse rounded-[12px] bg-[#F5F6FA]" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
          {/* Config card */}
          <section className="rounded-[12px] border border-[#E8EAF0] bg-white">
            {/* Mostrar widget toggle */}
            <div className="flex items-center justify-between border-b border-[#E8EAF0] px-5 py-4">
              <div>
                <p className="text-sm font-bold text-[#1A202C]">
                  Mostrar widget
                </p>
                <p className="mt-0.5 text-xs text-[#8891A4]">
                  {isActive
                    ? "El widget está visible en tu sitio."
                    : "El widget está oculto."}
                </p>
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={() => void toggleStatus()}
                disabled={togglingStatus || !activeWidget}
                label={isActive ? "Desactivar widget" : "Activar widget"}
              />
            </div>

            {/* Form */}
            <form onSubmit={(e) => void saveWidget(e)} className="space-y-5 p-5">
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-[#8891A4]">
                  Modo
                </p>
                <SegmentedButtons
                  options={MODE_OPTIONS}
                  value={mode as (typeof MODE_OPTIONS)[number]["value"]}
                  onChange={(v) => setMode(v)}
                />
              </div>

              {mode === "toast" && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-[#8891A4]">
                    Posición
                  </p>
                  <SegmentedButtons
                    options={POSITION_OPTIONS}
                    value={
                      position as (typeof POSITION_OPTIONS)[number]["value"]
                    }
                    onChange={(v) => setPosition(v)}
                  />
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-[#8891A4]">
                  Mínimo de estrellas
                </p>
                <div className="inline-flex overflow-hidden rounded-[8px] border border-[#E8EAF0] text-xs font-semibold">
                  {STAR_OPTIONS.map((s, i) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setMinStars(s)}
                      className={`px-3 py-2 transition-colors ${i > 0 ? "border-l border-[#E8EAF0]" : ""} ${
                        minStars === s
                          ? "bg-[#5C6BC0] text-white"
                          : "bg-white text-[#8891A4] hover:bg-[#F5F6FA]"
                      }`}
                    >
                      {s}★
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-[#8891A4]">
                  Color primario
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-10 w-10 cursor-pointer rounded-[8px] border border-[#E8EAF0] p-0.5"
                  />
                  <span className="font-mono text-sm text-[#1A202C]">
                    {color}
                  </span>
                </div>
              </div>

              {(mode === "carousel" || mode === "grid") && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-[#8891A4]">
                    Color de fondo
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={bgColor === "transparent" ? "#ffffff" : bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="h-10 w-10 cursor-pointer rounded-[8px] border border-[#E8EAF0] p-0.5"
                    />
                    <span className="font-mono text-sm text-[#1A202C]">
                      {bgColor}
                    </span>
                    {bgColor !== "transparent" && (
                      <button
                        type="button"
                        onClick={() => setBgColor("transparent")}
                        className="text-xs text-[#8891A4] underline-offset-2 hover:text-[#1A202C] hover:underline"
                      >
                        Transparente
                      </button>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-[#8891A4]">
                    Usalo si el fondo de tu página no es blanco.
                  </p>
                </div>
              )}

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex h-9 items-center rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#4A5AB0] disabled:opacity-60"
                >
                  {saving ? "Guardando..." : saved ? "Guardado ✓" : "Guardar cambios"}
                </button>
              </div>
            </form>
          </section>

          {/* Right column */}
          <div className="space-y-4">
            {/* Preview card */}
            <section className="rounded-[12px] border border-[#E8EAF0] bg-white">
              <div className="border-b border-[#E8EAF0] px-5 py-4">
                <h2 className="text-sm font-bold text-[#1A202C]">
                  Vista previa
                </h2>
                <p className="mt-0.5 text-xs text-[#8891A4]">
                  {previewLoading
                    ? "Cargando..."
                    : `${preview?.summary.totalReviews ?? 0} reseñas disponibles`}
                </p>
              </div>
              <div className="p-4">
                {previewLoading ? (
                  <div className="h-[220px] animate-pulse rounded-[12px] bg-[#F5F6FA]" />
                ) : mode === "carousel" ? (
                  <CarouselPreview
                    reviews={preview?.reviews ?? []}
                    color={color}
                    bgColor={bgColor}
                    minStars={minStars}
                  />
                ) : mode === "grid" ? (
                  <GridPreview
                    reviews={preview?.reviews ?? []}
                    color={color}
                    bgColor={bgColor}
                    minStars={minStars}
                  />
                ) : (
                  <ToastPreview
                    review={preview?.reviews[0]}
                    color={color}
                    position={position}
                    minStars={minStars}
                  />
                )}
              </div>
            </section>

            {/* Snippet card */}
            <section className="rounded-[12px] border border-[#E8EAF0] bg-white">
              <div className="flex items-center justify-between border-b border-[#E8EAF0] px-5 py-4">
                <div>
                  <h2 className="text-sm font-bold text-[#1A202C]">
                    Código de instalación
                  </h2>
                  <p className="mt-0.5 text-xs text-[#8891A4]">
                    Pegá este script en el HTML de tu sitio.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void copySnippet()}
                  disabled={!snippet}
                  className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#E8EAF0] px-3 py-1.5 text-xs font-semibold text-[#1A202C] hover:bg-[#F5F6FA] disabled:opacity-50"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-[#639922]" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copiar
                    </>
                  )}
                </button>
              </div>
              <div className="p-4">
                <pre className="overflow-x-auto rounded-[8px] bg-[#F5F6FA] p-3 text-[11px] leading-5 text-[#1A202C]">
                  {snippet || "Cargando..."}
                </pre>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
