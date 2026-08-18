"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Loader2, MapPin, Search } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import GoogleLogo from "@/components/icons/google-logo";
import { useIsOwnerOrAdmin } from "../../role-context";
import { Stars, relativeDay } from "../customers/loyalty-ui";
import GoogleConnectModal from "./google-connect-modal";
import ReviewsChart from "./reviews-chart";

/**
 * Reseñas — vista analítica, no una bandeja de comentarios: números,
 * gráfico y el local vinculado. Sin listas de reseñas ni de feedback (ni
 * comentarios de clientes) — eso vive en otro lado del producto; acá solo
 * el pulso de la reputación en Google.
 */

const PERIODS = [
  { days: 7, label: "7 días" },
  { days: 30, label: "30 días" },
  { days: 90, label: "90 días" },
] as const;

interface Overview {
  periodDays: number;
  google: {
    connected: boolean;
    profileUrl: string | null;
    lastSyncedAt: string | null;
    placeDisplayName: string | null;
    placeRating: number | null;
    placeUserRatingCount: number | null;
    placeReviewsUri: string | null;
    /** Cuándo se conectó el Place actual — `null` para conexiones viejas. */
    connectedAt: string | null;
  };
  summary: {
    rating: number | null;
    total: number;
    inPeriod: number;
    /** "Desde que usás Flikker" — `null` si no hay ancla real (`connectedAt`). */
    sinceConnected: number | null;
    feedbackInPeriod: number;
    ratingDistribution: Record<string, number>;
  };
  /** Serie diaria de reseñas nuevas, un punto por día del período elegido. */
  chart: { date: string; count: number }[];
}

export default function ReviewsClient({
  businessName,
}: {
  businessName: string;
}) {
  const canConnect = useIsOwnerOrAdmin();

  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingUrl, setSavingUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [editingUrl, setEditingUrl] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);

  const load = useCallback(async (period: number) => {
    setError(null);
    try {
      const res = await fetch(`/api/proxy/reviews/overview?days=${period}`);
      if (!res.ok) throw new Error("No pudimos cargar tus reseñas.");
      setData((await res.json()) as Overview);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  /** Reusa el mecanismo que ya existe: la URL vive en el perfil del negocio. */
  async function saveGoogleUrl() {
    setSavingUrl(true);
    try {
      const res = await fetch("/api/proxy/businesses/current/brand", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleBusinessProfileUrl: urlDraft.trim() }),
      });
      if (res.ok) {
        setEditingUrl(false);
        await load(days);
      } else {
        setError("Ese link no se pudo guardar. Revisalo e intentá de nuevo.");
      }
    } finally {
      setSavingUrl(false);
    }
  }

  if (error && !data) {
    return (
      <div className="space-y-3">
        <PageHeader title="Reseñas" />
        <p className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
          {error}
        </p>
        <button
          type="button"
          onClick={() => void load(days)}
          className="flk-glossy-secondary inline-flex h-10 items-center rounded-[10px] border border-[#E3E5F0] bg-white px-4 text-sm font-semibold text-[#202333] hover:border-[#5C6BC0]"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[#5C6BC0]" />
      </div>
    );
  }

  const { google, summary } = data;

  return (
    <div className="space-y-7">
      <PageHeader
        title="Reseñas"
        subtitle="Seguí lo que dicen tus clientes y fortalecé tu reputación en Google."
        actions={
          google.connected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF7EF] px-3 py-1.5 text-xs font-semibold text-[#147A5B]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#22A06B]" />
              Google conectado
              {google.placeRating != null ? (
                <span className="font-normal text-[#147A5B]/70">
                  · {google.placeRating.toFixed(1)}★
                  {google.placeUserRatingCount != null
                    ? ` (${google.placeUserRatingCount})`
                    : ""}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF7EE] px-3 py-1.5 text-xs font-semibold text-[#8A520D]">
              Google pendiente
            </span>
          )
        }
      />

      {/* ── Google sin conectar ───────────────────────────────────────── */}
      {!google.connected ? (
        <section className="rounded-[20px] border border-[#E8EAF0] bg-white px-6 py-12 text-center shadow-[0_2px_8px_rgba(17,22,59,0.025)]">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F5F6FA]">
            <GoogleLogo className="h-7 w-7" />
          </span>
          <p className="mt-5 font-display text-lg font-semibold text-[#202333]">
            Ningún local vinculado
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#7F879C]">
            Conectá el perfil de Google de tu negocio para ver tus reseñas y
            permitir que tus clientes compartan su experiencia después de una
            visita.
          </p>
          {canConnect ? (
            <div className="mx-auto mt-6 max-w-md">
              <button
                type="button"
                onClick={() => setShowSearchModal(true)}
                className="flk-glossy inline-flex h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-[#5C6BC0] px-5 text-sm font-semibold text-white hover:bg-[#4f5eb0]"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                Buscar mi negocio en Google
              </button>

              {editingUrl ? (
                <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
                  <input
                    value={urlDraft}
                    onChange={(e) => setUrlDraft(e.target.value)}
                    placeholder="https://g.page/tu-negocio"
                    aria-label="Link de tu ficha en Google"
                    className="h-11 flex-1 rounded-[11px] border border-[#E3E5F0] bg-white px-4 text-sm text-[#202333] outline-none placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]"
                  />
                  <button
                    type="button"
                    onClick={() => void saveGoogleUrl()}
                    disabled={savingUrl || urlDraft.trim().length < 5}
                    className="flk-glossy-secondary inline-flex h-11 items-center justify-center rounded-[11px] border border-[#E3E5F0] bg-white px-5 text-sm font-semibold text-[#202333] hover:border-[#5C6BC0] disabled:opacity-50"
                  >
                    Guardar link
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingUrl(true)}
                  className="mt-3 text-xs font-semibold text-[#8891A4] hover:text-[#5C6BC0] hover:underline"
                >
                  ¿No lo encontrás? Pegá el link de tu ficha a mano
                </button>
              )}
            </div>
          ) : (
            <p className="mt-4 text-xs text-[#8891A4]">
              Pedile al dueño o a un administrador que lo conecte.
            </p>
          )}
        </section>
      ) : null}

      {showSearchModal ? (
        <GoogleConnectModal
          businessName={businessName}
          onClose={() => setShowSearchModal(false)}
          onConnected={() => {
            setShowSearchModal(false);
            void load(days);
          }}
        />
      ) : null}

      {/*
        ── Métricas + gráfico + local vinculado ─────────────────────────
        Solo con Google conectado: sin eso no hay nada real que graficar, y
        mostrar la grilla en "—" justo debajo del CTA de conectar es ruido,
        no información.
      */}
      {google.connected ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1.5">
              {PERIODS.map((p) => (
                <button
                  key={p.days}
                  type="button"
                  onClick={() => setDays(p.days)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    days === p.days
                      ? "border-[#5C6BC0] bg-[#EEF0FB] text-[#4A56A6]"
                      : "border-[#E3E5F0] bg-white text-[#7F879C] hover:border-[#5C6BC0]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label="Reseñas con Flikker"
              value={
                summary.sinceConnected !== null
                  ? String(summary.sinceConnected)
                  : String(summary.total)
              }
              hint={
                summary.sinceConnected !== null
                  ? "Desde que conectaste tu perfil"
                  : "Historial disponible en Google"
              }
            />
            <Kpi
              label="Nuevas"
              value={String(summary.inPeriod)}
              hint={`En los últimos ${data.periodDays} días`}
            />
            <Kpi
              label="Calificación"
              value={summary.rating !== null ? `${summary.rating} ★` : "—"}
              hint={summary.rating === null ? "Todavía sin reseñas" : "En Google"}
            />
            <Kpi
              label="Feedback recibido"
              value={String(summary.feedbackInPeriod)}
              hint={`En los últimos ${data.periodDays} días`}
            />
          </div>

          <section className="rounded-[18px] border border-[#E8EAF0] bg-white p-5 shadow-[0_2px_8px_rgba(17,22,59,0.025)] sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
              Reseñas — últimos {data.periodDays} días
            </p>
            <div className="mt-3">
              <ReviewsChart data={data.chart} />
            </div>
          </section>

          <section>
            <SectionTitle>Locales vinculados</SectionTitle>
            <div className="mt-3 rounded-[18px] border border-[#E8EAF0] bg-white p-5 shadow-[0_2px_8px_rgba(17,22,59,0.025)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F5F6FA]">
                    <MapPin className="h-4 w-4 text-[#7F879C]" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-display text-base font-semibold text-[#202333]">
                      {google.placeDisplayName ?? businessName}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {google.placeRating != null ? (
                        <>
                          <Stars score={Math.round(google.placeRating)} />
                          <span className="text-sm font-semibold text-[#202333]">
                            {google.placeRating.toFixed(1)}
                          </span>
                        </>
                      ) : null}
                      {google.placeUserRatingCount != null ? (
                        <span className="text-sm text-[#8891A4]">
                          {google.placeUserRatingCount}{" "}
                          {google.placeUserRatingCount === 1
                            ? "reseña"
                            : "reseñas"}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                {canConnect ? (
                  <button
                    type="button"
                    onClick={() => {
                      setUrlDraft(google.profileUrl ?? "");
                      setEditingUrl((v) => !v);
                    }}
                    className="shrink-0 text-xs font-semibold text-[#5C6BC0] hover:underline"
                  >
                    Cambiar link
                  </button>
                ) : null}
              </div>

              {google.placeReviewsUri ?? google.profileUrl ? (
                <div className="mt-4 flex items-center gap-2 rounded-[10px] bg-[#F7F8FC] px-3.5 py-2.5">
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#8891A4]" />
                  <a
                    href={google.placeReviewsUri ?? google.profileUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate text-xs text-[#5F6780] hover:text-[#5C6BC0] hover:underline"
                  >
                    {google.placeReviewsUri ?? google.profileUrl}
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      void navigator.clipboard.writeText(
                        google.placeReviewsUri ?? google.profileUrl ?? "",
                      )
                    }
                    aria-label="Copiar link"
                    className="shrink-0 text-[#8891A4] hover:text-[#5C6BC0]"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}

              <p className="mt-3 text-xs leading-5 text-[#8891A4]">
                {google.lastSyncedAt
                  ? `Última actualización: ${relativeDay(google.lastSyncedAt)}`
                  : "Todavía no encontramos reseñas nuevas."}
              </p>

              {editingUrl ? (
                <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
                  <input
                    value={urlDraft}
                    onChange={(e) => setUrlDraft(e.target.value)}
                    aria-label="Link de tu ficha en Google"
                    className="h-10 flex-1 rounded-[10px] border border-[#E3E5F0] bg-white px-3.5 text-sm text-[#202333] outline-none focus:border-[#5C6BC0]"
                  />
                  <button
                    type="button"
                    onClick={() => void saveGoogleUrl()}
                    disabled={savingUrl}
                    className="flk-glossy inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
                  >
                    {savingUrl ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Guardar
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[14px] border border-[#E8EAF0] bg-white px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
        {label}
      </p>
      {/* Montserrat (font-sans), no Syne — pedido explícito para los KPIs. */}
      <p className="mt-1.5 font-sans text-2xl font-semibold tracking-[-0.02em] text-[#202333]">
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-[#B0B8C9]">{hint}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8891A4]">
      {children}
    </h2>
  );
}
