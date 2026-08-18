"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Check,
  ExternalLink,
  Loader2,
  QrCode,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import GoogleLogo from "@/components/icons/google-logo";
import { useIsCheckinV2 } from "../../experience-context";
import { useIsOwnerOrAdmin } from "../../role-context";
import { Stars, relativeDay, shortDate } from "../customers/loyalty-ui";
import GoogleConnectModal from "./google-connect-modal";

/**
 * Reseñas — la reputación del negocio, con Google como parte nativa.
 *
 * Dos ideas que NUNCA se mezclan, y por eso viven en pestañas separadas:
 *
 *  - **Google**: opiniones públicas que cualquiera ve en el perfil del
 *    negocio. Flikker las lee; no las escribe.
 *  - **Feedback privado**: lo que el cliente contesta después de una visita.
 *    No es público y no llega a Google.
 *
 * Sobre el embudo: el paso de Google se llama "abrieron Google" y no "dejaron
 * una reseña", porque un click es lo único observable. Que alguien abra el
 * perfil no prueba que haya publicado nada, y la pantalla no lo insinúa.
 */

const PERIODS = [
  { days: 7, label: "7 días" },
  { days: 30, label: "30 días" },
  { days: 90, label: "90 días" },
] as const;

const FLIKKER_WHATSAPP = "59891624988";

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
  };
  summary: {
    rating: number | null;
    total: number;
    inPeriod: number;
    feedbackInPeriod: number;
    ratingDistribution: Record<string, number>;
  };
  reviews: {
    id: string;
    author: string | null;
    stars: number;
    text: string | null;
    postedAt: string;
    linkedToFlikkerActivity: boolean;
  }[];
  feedback: {
    id: string;
    customer: { id: string; name: string } | null;
    score: number;
    comment: string | null;
    createdAt: string;
    gaveBonusStamp: boolean;
  }[];
  toReview: {
    id: string;
    customer: { id: string; name: string } | null;
    score: number;
    comment: string | null;
    createdAt: string;
  }[];
  funnel: {
    visits: number;
    feedback: number;
    openedGoogle: number;
    linkedReviews: number;
  };
}

type Tab = "google" | "feedback";
type StarFilter = "todas" | "5" | "4" | "3" | "2" | "1";
type FeedbackFilter = "todos" | "positivos" | "neutros" | "revisar";

export default function ReviewsClient({
  businessName,
}: {
  businessName: string;
}) {
  const isCheckinV2 = useIsCheckinV2();
  const canConnect = useIsOwnerOrAdmin();

  const [days, setDays] = useState<number>(30);
  const [tab, setTab] = useState<Tab>("google");
  const [starFilter, setStarFilter] = useState<StarFilter>("todas");
  const [feedbackFilter, setFeedbackFilter] = useState<FeedbackFilter>("todos");
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

  const { google, summary, funnel } = data;

  const reviews =
    starFilter === "todas"
      ? data.reviews
      : data.reviews.filter((r) => r.stars === Number(starFilter));

  const feedback = data.feedback.filter((f) => {
    if (feedbackFilter === "positivos") return f.score >= 4;
    if (feedbackFilter === "neutros") return f.score === 3;
    if (feedbackFilter === "revisar") return f.score <= 3 && f.comment !== null;
    return true;
  });

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

      {/* ── Período + KPIs ────────────────────────────────────────────── */}
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
          label="Calificación"
          value={summary.rating !== null ? `${summary.rating} ★` : "—"}
          hint={summary.rating === null ? "Todavía sin reseñas" : "En Google"}
        />
        <Kpi label="Reseñas totales" value={String(summary.total)} hint="En Google" />
        <Kpi
          label="Nuevas"
          value={String(summary.inPeriod)}
          hint={`En los últimos ${data.periodDays} días`}
        />
        <Kpi
          label="Feedback recibido"
          value={String(summary.feedbackInPeriod)}
          hint={`En los últimos ${data.periodDays} días`}
        />
      </div>

      {/* ── Tabs Google / Feedback ────────────────────────────────────── */}
      <div>
        <div
          role="tablist"
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
        >
          <TabButton
            active={tab === "google"}
            onClick={() => setTab("google")}
            label="Reseñas de Google"
          />
          <TabButton
            active={tab === "feedback"}
            onClick={() => setTab("feedback")}
            label="Feedback privado"
          />
        </div>

        <p className="mt-3 text-sm leading-6 text-[#7F879C]">
          {tab === "google"
            ? "Opiniones públicas que aparecen en tu perfil de Google."
            : "Comentarios privados que tus clientes dejan después de una visita."}
        </p>
      </div>

      {/* ── Google ────────────────────────────────────────────────────── */}
      {tab === "google" ? (
        <section className="space-y-4">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {(["todas", "5", "4", "3", "2", "1"] as StarFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStarFilter(f)}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  starFilter === f
                    ? "border-[#5C6BC0] bg-[#EEF0FB] text-[#4A56A6]"
                    : "border-[#E3E5F0] bg-white text-[#7F879C] hover:border-[#5C6BC0]"
                }`}
              >
                {f === "todas" ? "Todas" : `${f} ★`}
              </button>
            ))}
          </div>

          {reviews.length === 0 ? (
            <Empty>
              {!google.connected
                ? "Conectá Google para ver tus reseñas acá."
                : "Todavía no encontramos reseñas."}
            </Empty>
          ) : (
            // Cards, no tabla: en el celular una tabla de reseñas es ilegible.
            <ul className="space-y-3">
              {reviews.map((review) => (
                <li
                  key={review.id}
                  className="rounded-[16px] border border-[#E8EAF0] bg-white px-5 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Stars score={review.stars} />
                      <span className="text-sm font-semibold text-[#202333]">
                        {review.author ?? "Cliente de Google"}
                      </span>
                    </div>
                    <span className="text-xs text-[#8891A4]">
                      {relativeDay(review.postedAt)}
                    </span>
                  </div>

                  {review.text ? (
                    <p className="mt-2 text-sm leading-6 text-[#5F6780]">
                      {review.text}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {/*
                      Flikker no puede escribir respuestas en Google: las
                      reseñas se leen, no se contestan desde acá. En vez de
                      simular un envío que no ocurre, se abre el perfil real
                      para que el dueño responda donde sí se puede.
                    */}
                    {google.profileUrl ? (
                      <a
                        href={google.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5C6BC0] hover:underline"
                      >
                        Responder en Google
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                    {/*
                      Asociación temporal, no causalidad: la reseña apareció
                      después de un mensaje nuestro. No afirmamos haberla
                      generado.
                    */}
                    {review.linkedToFlikkerActivity ? (
                      <span className="text-xs text-[#8891A4]">
                        Asociada a actividad de Flikker
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {/* ── Feedback privado ──────────────────────────────────────────── */}
      {tab === "feedback" ? (
        <section className="space-y-4">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {(
              [
                ["todos", "Todos"],
                ["positivos", "Positivos"],
                ["neutros", "Neutros"],
                ["revisar", "Para revisar"],
              ] as [FeedbackFilter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFeedbackFilter(key)}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  feedbackFilter === key
                    ? "border-[#5C6BC0] bg-[#EEF0FB] text-[#4A56A6]"
                    : "border-[#E3E5F0] bg-white text-[#7F879C] hover:border-[#5C6BC0]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {feedback.length === 0 ? (
            <Empty>Tus clientes todavía no dejaron feedback.</Empty>
          ) : (
            <ul className="space-y-3">
              {feedback.map((item) => (
                <li
                  key={item.id}
                  className="rounded-[16px] border border-[#E8EAF0] bg-white px-5 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Stars score={item.score} />
                      {item.customer ? (
                        <Link
                          href={`/dashboard/customers/${item.customer.id}`}
                          className="text-sm font-semibold text-[#5C6BC0] hover:underline"
                        >
                          {item.customer.name}
                        </Link>
                      ) : null}
                    </div>
                    <span className="text-xs text-[#8891A4]">
                      {shortDate(item.createdAt)}
                    </span>
                  </div>

                  {/* Sin comentario se muestran solo las estrellas. */}
                  {item.comment ? (
                    <p className="mt-2 text-sm leading-6 text-[#5F6780]">
                      “{item.comment}”
                    </p>
                  ) : null}

                  {/* El sello es por el feedback, nunca por publicar en Google. */}
                  {item.gaveBonusStamp ? (
                    <p className="mt-2 text-xs text-[#8891A4]">
                      +1 sello otorgado
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {/* ── Comentarios para revisar ──────────────────────────────────── */}
      {isCheckinV2 ? (
        <section>
          <SectionTitle>Comentarios para revisar</SectionTitle>
          {data.toReview.length === 0 ? (
            <p className="mt-3 rounded-[16px] border border-dashed border-[#DDE1EC] bg-white px-5 py-6 text-center text-sm text-[#8891A4]">
              Todo al día.
            </p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {data.toReview.map((item) => (
                <li
                  key={item.id}
                  className="rounded-[14px] border border-[#FFE0C2] bg-[#FFFBF6] px-5 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <Stars score={item.score} />
                      {item.customer ? (
                        <Link
                          href={`/dashboard/customers/${item.customer.id}`}
                          className="text-sm font-semibold text-[#5C6BC0] hover:underline"
                        >
                          {item.customer.name}
                        </Link>
                      ) : null}
                    </div>
                    <span className="text-xs text-[#8891A4]">
                      {shortDate(item.createdAt)}
                    </span>
                  </div>
                  {item.comment ? (
                    <p className="mt-2 text-sm leading-6 text-[#5F6780]">
                      “{item.comment}”
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {/* ── Embudo ────────────────────────────────────────────────────── */}
      {isCheckinV2 && funnel.visits > 0 ? (
        <section>
          <SectionTitle>Cómo llegan tus reseñas</SectionTitle>
          <div className="mt-3 grid gap-2.5 rounded-[16px] border border-[#E8EAF0] bg-white p-5 sm:grid-cols-4">
            <FunnelStep label="Visitas" value={funnel.visits} />
            <FunnelStep label="Dejaron feedback" value={funnel.feedback} />
            <FunnelStep label="Abrieron Google" value={funnel.openedGoogle} />
            <FunnelStep
              label="Reseñas asociadas"
              value={funnel.linkedReviews}
            />
          </div>
          {/*
            La aclaración no es opcional: sin esto "Abrieron Google" y
            "Reseñas asociadas" se leen como el mismo embudo lineal, y el
            dueño concluiría que Flikker le generó N reseñas.
          */}
          <p className="mt-2 text-xs leading-5 text-[#8891A4]">
            Abrir Google no significa haber publicado una reseña: Flikker no
            puede saber si el cliente la dejó. “Reseñas asociadas” son las que
            aparecieron después de un mensaje nuestro.
          </p>
        </section>
      ) : null}

      {/* ── Conseguí más reseñas ──────────────────────────────────────── */}
      {isCheckinV2 ? (
        <section>
          <SectionTitle>Conseguí más reseñas</SectionTitle>
          <div className="mt-3 rounded-[16px] border border-[#E8EAF0] bg-white p-5 sm:p-6">
            <p className="max-w-2xl text-sm leading-6 text-[#5F6780]">
              Después de una visita, Flikker puede pedirle feedback al cliente y
              ofrecerle compartir su experiencia en Google.
            </p>

            {/* El orden importa: el sello es por el feedback, y Google es opcional. */}
            <ol className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
              <Step>Visita</Step>
              <Arrow />
              <Step>Feedback</Step>
              <Arrow />
              <Step muted>Google (opcional)</Step>
            </ol>
            <p className="mt-3 text-xs leading-5 text-[#8891A4]">
              El sello extra se otorga por completar el feedback, sin importar
              el puntaje. Nunca por publicar una reseña en Google.
            </p>

            {/* Un solo acceso: no existe un QR de reseñas aparte. */}
            <div className="mt-5 rounded-[12px] bg-[#F7F8FC] px-4 py-3.5">
              <p className="text-sm font-semibold text-[#202333]">
                Tu QR y NFC de Flikker ya sirven para esto.
              </p>
              <Link
                href="/dashboard/qr"
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-[#5C6BC0] hover:underline"
              >
                <QrCode className="h-4 w-4" />
                Ver mi QR y NFC
              </Link>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[#EFF1F7] pt-4">
              <Sparkles className="h-4 w-4 shrink-0 text-[#5C6BC0]" />
              <p className="min-w-0 flex-1 text-sm text-[#5F6780]">
                ¿Querés poner Flikker en el mostrador? Pedí tu soporte QR + NFC.
              </p>
              <a
                href={`https://wa.me/${FLIKKER_WHATSAPP}?text=${encodeURIComponent(
                  `Hola, quiero pedir un soporte QR + NFC para ${businessName}.`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flk-glossy-secondary inline-flex h-10 items-center rounded-[10px] border border-[#E3E5F0] bg-white px-4 text-sm font-semibold text-[#5C6BC0] hover:border-[#5C6BC0]"
              >
                Pedir soporte
              </a>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Sincronización ───────────────────────────────────────────── */}
      {google.connected ? (
        <section>
          <SectionTitle>Sincronización con Google</SectionTitle>
          <div className="mt-3 rounded-[16px] border border-[#E8EAF0] bg-white px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <RefreshCw className="h-4 w-4 text-[#5C6BC0]" />
                <div>
                  <p className="text-sm font-semibold text-[#202333]">
                    Conectado
                  </p>
                  <p className="mt-0.5 text-xs text-[#8891A4]">
                    {google.lastSyncedAt
                      ? `Última actualización: ${relativeDay(google.lastSyncedAt)}`
                      : "Todavía no encontramos reseñas nuevas"}
                  </p>
                </div>
              </div>
              {canConnect ? (
                <button
                  type="button"
                  onClick={() => {
                    setUrlDraft(google.profileUrl ?? "");
                    setEditingUrl((v) => !v);
                  }}
                  className="text-xs font-semibold text-[#5C6BC0] hover:underline"
                >
                  Cambiar link
                </button>
              ) : null}
            </div>

            <p className="mt-3 text-xs leading-5 text-[#8891A4]">
              Flikker revisa periódicamente las reseñas nuevas de tu negocio.
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
      ) : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
        active
          ? "border-[#5C6BC0] bg-[#EEF0FB] text-[#4A56A6]"
          : "border-[#E3E5F0] bg-white text-[#7F879C] hover:border-[#5C6BC0]"
      }`}
    >
      {label}
    </button>
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
      <p className="mt-1.5 font-display text-2xl font-semibold tracking-[-0.02em] text-[#202333]">
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

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[16px] border border-dashed border-[#DDE1EC] bg-white px-5 py-10 text-center text-sm text-[#8891A4]">
      {children}
    </p>
  );
}

function FunnelStep({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
        {label}
      </p>
      <p className="mt-1 font-display text-xl font-semibold text-[#202333]">
        {value}
      </p>
    </div>
  );
}

function Step({
  children,
  muted,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <li
      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
        muted ? "bg-[#F3F4F8] text-[#6B7280]" : "bg-[#EEF0FB] text-[#4A56A6]"
      }`}
    >
      {children}
    </li>
  );
}

function Arrow() {
  return (
    <li aria-hidden="true" className="text-[#C8D0E0]">
      →
    </li>
  );
}
