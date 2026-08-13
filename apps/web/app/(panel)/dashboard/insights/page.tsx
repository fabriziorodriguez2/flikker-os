import { redirect } from "next/navigation";
import { redirectIfAbsorbed } from "@/components/panel/absorbed-route";
import { ArrowRight, QrCode, Star, UserRoundCheck } from "lucide-react";
import { apiFetch, isUnauthorizedApiError } from "@/lib/api";
import { getEffectiveApiContext, getSession } from "@/lib/auth";
import SectionCard from "@/components/ui/section-card";
import PageHeader from "@/components/ui/page-header";
import ActivityEvolutionChart from "../activity-evolution-chart";
import ActivityFilters, { type ActivityGranularity } from "../activity-filters";
import { ACTIVITY_SERIES } from "../activity-series";
import NegativeFeedbackList from "../negative-feedback-list";

interface KpiMetric {
  current: number;
  previous: number;
  delta: number;
}

interface MetricsOverview {
  month: {
    currentStart: string;
    previousStart: string;
  };
  kpis: {
    reviewsGenerated: KpiMetric;
    averageRating: KpiMetric;
    reactivatedCustomers: KpiMetric;
  };
  activityByMonth: Array<{
    month: string;
    label: string;
    messagesSent: number;
    reviewsGenerated: number;
    reactivatedCustomers: number;
  }>;
  activityRange: {
    granularity: ActivityGranularity;
    from: string;
    to: string;
  };
  negativeFeedback: Array<{
    id: string;
    createdAt: string;
    customerName: string;
    customerPhone: string | null;
    score: number;
    comment: string | null;
    acknowledgedByOwner: boolean;
  }>;
}

interface GoogleStats {
  total: number;
  thisMonth: number;
  avgStars: number;
  ratingDistribution: Record<string, number>;
}

interface ContactsStats {
  total: number;
  byOrigin: { qr: number; manual: number; whatsapp: number };
  newThisMonth: number;
}

interface ConversionSummary {
  sentMessages: number;
  sentMessagesRecent: number;
  attributedReviews: number;
  conversionRate: number | null;
  insufficientData: boolean;
}

interface FunnelStep {
  key: string;
  label: string;
  count: number;
}

interface ConversionFunnel {
  steps: FunnelStep[];
}

interface InsightsPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function buildMetricsPath(params: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  const granularity = firstValue(params.granularity);
  const from = firstValue(params.from);
  const to = firstValue(params.to);
  if (granularity) query.set("granularity", granularity);
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const serialized = query.toString();
  return serialized ? `/metrics/overview?${serialized}` : "/metrics/overview";
}

// ── Compact KPI card — same visual language as /dashboard ──────────────────────

function MiniKpiCard({
  label,
  value,
  sub,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "violet" | "warm";
  icon: typeof Star;
}) {
  const toneClasses =
    tone === "violet"
      ? {
          card: "border-[#5C6BC0]/20 bg-[linear-gradient(135deg,#F8F8FF_0%,#ECEEFC_100%)]",
          badge: "bg-white text-[#5C6BC0] shadow-[0_4px_12px_rgba(92,107,192,0.18)]",
          label: "text-[#5C6BC0]",
          value: "text-[#1A202C]",
          sub: "text-[#777F96]",
        }
      : {
          card: "border-[#F9A148]/30 bg-gradient-to-br from-[#FBB25A] to-[#F5842A] shadow-[0_12px_30px_rgba(245,132,42,0.22)]",
          badge: "bg-white/25 text-white",
          label: "text-white/85",
          value: "text-white",
          sub: "text-white/80",
        };

  return (
    <article
      className={`group relative flex items-start justify-between gap-4 overflow-hidden rounded-[16px] border p-5 shadow-[0_8px_24px_rgba(56,45,125,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_34px_rgba(56,45,125,0.13)] ${toneClasses.card}`}
    >
      <div className="min-w-0">
        <p
          className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${toneClasses.label}`}
        >
          {label}
        </p>
        <p className={`mt-3 text-[32px] font-bold leading-none ${toneClasses.value}`}>
          {value}
        </p>
        <p className={`mt-3 text-xs ${toneClasses.sub}`}>{sub}</p>
      </div>
      <span
        aria-hidden="true"
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-transform duration-300 group-hover:scale-105 ${toneClasses.badge}`}
      >
        <Icon className="h-5 w-5" />
      </span>
    </article>
  );
}

// ── Conversion rate — circular chart, friendly when data is short ──────────────

function conversionRingColor(pct: number): string {
  if (pct >= 20) return "#1D9E75";
  if (pct >= 10) return "#FAAB4B";
  return "#9188F5";
}

function ConversionRing({ pct, muted }: { pct: number; muted: boolean }) {
  const r = 58;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  const offset = circumference * (1 - clamped / 100);
  const color = muted ? "#D0D5DD" : conversionRingColor(clamped);

  return (
    <div className="relative mx-auto h-[150px] w-[150px] shrink-0 transition-transform duration-300 group-hover/conversion:scale-[1.04]">
      <svg viewBox="0 0 150 150" className="h-full w-full -rotate-90">
        <circle cx="75" cy="75" r={r} fill="none" stroke="#EEF0FB" strokeWidth="12" />
        {!muted && (
          <circle
            cx="75"
            cy="75"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {muted ? (
          <span className="text-3xl font-bold text-[#B0B8C9]">—</span>
        ) : (
          <span className="text-3xl font-bold text-[#1A202C]">
            {clamped.toLocaleString("es-UY", { maximumFractionDigits: 1 })}%
          </span>
        )}
        <span className="mt-0.5 text-xs font-medium text-[#8891A4]">conversión</span>
      </div>
    </div>
  );
}

function ConversionCard({ conversion }: { conversion: ConversionSummary | null }) {
  if (!conversion) return null;

  const muted = conversion.insufficientData || conversion.conversionRate === null;

  return (
    <SectionCard
      tone="tinted"
      interactive
      title="Conversión a reseñas"
      description="Cuántos de tus mensajes de los últimos 30 días terminaron en una reseña ⭐"
    >
      <div className="group/conversion flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-center sm:gap-8">
        <ConversionRing pct={conversion.conversionRate ?? 0} muted={muted} />
        <div className="max-w-xs text-center sm:text-left">
          {muted ? (
            <p className="text-sm text-[#8891A4]">
              {conversion.sentMessages === 0 && conversion.sentMessagesRecent === 0 ? (
                "Todavía no mandaste mensajes. En cuanto empieces, vas a ver acá tu tasa de conversión."
              ) : conversion.sentMessages === 0 ? (
                <>
                  Mandaste{" "}
                  <span className="font-semibold text-[#1A202C]">
                    {conversion.sentMessagesRecent}
                  </span>{" "}
                  {conversion.sentMessagesRecent === 1 ? "mensaje" : "mensajes"}{" "}
                  hace poco — como son muy recientes, todavía no dio tiempo a
                  que llegue una reseña. Dale unos días más. 💪
                </>
              ) : (
                <>
                  Necesitás al menos 30 mensajes con tiempo suficiente para
                  contar. Llevás{" "}
                  <span className="font-semibold text-[#1A202C]">
                    {conversion.sentMessages}
                  </span>
                  {conversion.sentMessagesRecent > 0 && (
                    <>
                      {" "}
                      (+{conversion.sentMessagesRecent} más recientes, todavía
                      no cuentan)
                    </>
                  )}
                  . ¡Seguí mandando! 💪
                </>
              )}
            </p>
          ) : (
            <p className="text-sm text-[#4A5568]">
              <span className="font-semibold text-[#1A202C]">
                {conversion.attributedReviews}
              </span>{" "}
              {conversion.attributedReviews === 1 ? "reseña" : "reseñas"} de{" "}
              <span className="font-semibold text-[#1A202C]">
                {conversion.sentMessages}
              </span>{" "}
              mensajes enviados.
            </p>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

// ── QR funnel — scan → capture → review, all in one glance ─────────────────────

function stepCount(steps: FunnelStep[], key: string): number {
  return steps.find((s) => s.key === key)?.count ?? 0;
}

function QrFunnelCard({ funnel }: { funnel: ConversionFunnel | null }) {
  if (!funnel) return null;

  const scanned = stepCount(funnel.steps, "scanned");
  // "captured" = contact form submitted (Customer row), independent of whether
  // the follow-up WhatsApp review-request later succeeded — do not use "sent"
  // here, it undercounts whenever that message stays queued/failed.
  const captured = stepCount(funnel.steps, "captured");
  // Google reviews received since the business started using Flikker. It is a
  // period metric, not a causal one: Flikker cannot prove it produced them, so
  // it must never be presented as "reseñas generadas por Flikker" — and for the
  // same reason there is no contacts→reseñas conversion rate here, since these
  // reviews are not tied to those specific contacts.
  const reviewed = stepCount(funnel.steps, "reviews_since_flikker");
  const notCaptured = Math.max(0, scanned - captured);
  const captureRate = Math.round((captured / scanned) * 100);

  if (scanned === 0) {
    return (
      <SectionCard
        title="Tu QR"
        description="Cómo se comportan las personas que escanean tu QR de captación."
      >
        <p className="text-sm text-[#8891A4]">
          Todavía no registramos escaneos. Compartí tu QR con tus clientes para
          empezar a ver estos números.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      interactive
      title="Tu QR"
      description="Cómo se comportan las personas que escanean tu QR de captación."
    >
      <div className="qr-funnel-container min-w-0 rounded-[18px] border border-[#E3E5F0] bg-[#F9FAFD]/85 p-3 sm:p-5">
        <div className="qr-funnel-flow grid min-w-0 items-center gap-2">
          <div className="group/step flex min-w-0 items-center gap-3 rounded-[14px] p-3 transition-colors duration-300 hover:bg-white hover:shadow-[0_8px_22px_rgba(56,45,125,0.08)]">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-[#EEF0FB] text-[#5C6BC0] transition-transform duration-300 group-hover/step:scale-105 group-hover/step:-rotate-3">
              <QrCode className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
                Escaneos
              </p>
              <p className="mt-1 text-[28px] font-bold leading-none text-[#1A202C]">
                {scanned.toLocaleString("es-UY")}
              </p>
            </div>
          </div>

          <div className="qr-funnel-arrow flex flex-col items-center gap-1">
            <ArrowRight className="h-4 w-4 text-[#B0B8C9]" aria-hidden="true" />
            <span className="text-[10px] font-semibold text-[#5C6BC0]">
              {captureRate}%
            </span>
          </div>

          <div className="group/step flex min-w-0 items-center gap-3 rounded-[14px] p-3 transition-colors duration-300 hover:bg-white hover:shadow-[0_8px_22px_rgba(56,45,125,0.08)]">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-[#EEF0FB] text-[#5C6BC0] transition-transform duration-300 group-hover/step:scale-105 group-hover/step:rotate-3">
              <UserRoundCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
                Contactos
              </p>
              <p className="mt-1 text-[28px] font-bold leading-none text-[#1A202C]">
                {captured.toLocaleString("es-UY")}
              </p>
            </div>
          </div>

          {/* No percentage between contacts and reviews on purpose: these
              reviews are not attributed to those specific contacts. */}
          <div className="qr-funnel-arrow flex flex-col items-center gap-1.5">
            <ArrowRight className="h-4 w-4 text-[#B0B8C9]" aria-hidden="true" />
          </div>

          <div className="group/step flex min-w-0 items-center gap-3 rounded-[14px] p-3 transition-colors duration-300 hover:bg-white hover:shadow-[0_8px_22px_rgba(56,45,125,0.08)]">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-[#FFF0E5] text-[#E07C3E] transition-transform duration-300 group-hover/step:scale-105 group-hover/step:rotate-6">
              <Star className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
                Reseñas desde Flikker
              </p>
              <p className="mt-1 text-[28px] font-bold leading-none text-[#1A202C]">
                {reviewed.toLocaleString("es-UY")}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-[#E5E7F0] px-3 pt-3 text-xs text-[#777F96]">
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#B0B8C9]" />
            {notCaptured.toLocaleString("es-UY")} escaneos no dejaron datos
          </span>
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#FFAB76]" />
            Reseñas de Google recibidas desde que empezaste a usar Flikker
          </span>
        </div>
      </div>
    </SectionCard>
  );
}

export default async function InsightsPage({ searchParams }: InsightsPageProps) {
  // Insights se repartió: la actividad quedó en Inicio y la reputación en
  // Reseñas. El endpoint de métricas sigue existiendo intacto.
  await redirectIfAbsorbed("/dashboard");

  const session = await getSession();
  if (!session?.activeBusinessId) redirect("/login");

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const { accessToken, businessId } = getEffectiveApiContext(session);
  if (!businessId) redirect("/login");

  let metrics: MetricsOverview | null = null;
  let googleStats: GoogleStats | null = null;
  let error: string | null = null;

  let sessionExpired = false;
  try {
    [metrics, googleStats] = await Promise.all([
      apiFetch<MetricsOverview>(buildMetricsPath(resolvedSearchParams), accessToken, { businessId }),
      apiFetch<GoogleStats>("/reviews/google/stats", accessToken, { businessId }),
    ]);
  } catch (e) {
    if (isUnauthorizedApiError(e)) sessionExpired = true;
    else error = e instanceof Error ? e.message : "Error al cargar datos";
  }
  if (sessionExpired) redirect("/session-expired");

  if (error || !metrics) {
    return (
      <div className="max-w-3xl">
        <h1 className="font-display text-2xl font-bold text-[#1A202C]">Insights</h1>
        <div className="mt-5 rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
          {error ?? "Error al cargar datos"}
        </div>
      </div>
    );
  }

  // Best-effort secondary data: a failure here shouldn't break the whole page,
  // the affected card is simply omitted.
  let contactsStats: ContactsStats | null = null;
  try {
    contactsStats = await apiFetch<ContactsStats>("/contacts/stats", accessToken, {
      businessId,
    });
  } catch {
    // card omitted below
  }

  let conversion: ConversionSummary | null = null;
  try {
    conversion = await apiFetch<ConversionSummary>(
      "/metrics/conversion?range=last_30_days&attribution_window_days=7",
      accessToken,
      { businessId },
    );
  } catch {
    // card omitted below
  }

  let qrFunnel: ConversionFunnel | null = null;
  try {
    qrFunnel = await apiFetch<ConversionFunnel>(
      "/metrics/conversion/funnel?attribution_window_days=7&origin=qr",
      accessToken,
      { businessId },
    );
  } catch {
    // card omitted below
  }

  const unread = metrics.negativeFeedback.filter((f) => !f.acknowledgedByOwner).length;
  const showReactivated = metrics.kpis.reactivatedCustomers.current > 0;

  const rev = metrics.kpis.reviewsGenerated;
  const revUp = rev.current > rev.previous;
  const revSummary = revUp
    ? `¡Vas en subida! Este mes sumaste ${rev.current} ${rev.current === 1 ? "reseña" : "reseñas"}${rev.previous > 0 ? `, más que el mes pasado (${rev.previous})` : ""}. Seguí así 🚀`
    : rev.current === rev.previous
      ? `Vas parejo: ${rev.current} ${rev.current === 1 ? "reseña" : "reseñas"} este mes, igual que el anterior. Un empujoncito y crecés 💪`
      : `Este mes sumaste ${rev.current} ${rev.current === 1 ? "reseña" : "reseñas"} (${rev.previous} el mes pasado). Buen momento para pedir algunas más 🙌`;

  return (
    <div className="mx-auto max-w-6xl space-y-5 xl:max-w-7xl 2xl:max-w-[1600px]">
      <PageHeader
        title="Insights"
        subtitle="Evolución de tu reputación y rendimiento de las reseñas."
      />

      <div
        className={`rounded-[14px] border px-5 py-4 text-sm font-semibold shadow-[0_6px_18px_rgba(56,45,125,0.05)] ${
          revUp
            ? "border-[#1D9E75]/18 bg-[#EFF9F5] text-[#12795A]"
            : "border-[#5C6BC0]/16 bg-[#F3F4FC] text-[#4F5EAD]"
        }`}
      >
        {revSummary}
      </div>

      {/* KPI row — contacts + rating, same visual language as /dashboard */}
      <div className="grid gap-4 sm:grid-cols-2">
        <MiniKpiCard
          label="Contactos"
          tone="violet"
          icon={UserRoundCheck}
          value={(contactsStats?.total ?? 0).toLocaleString("es-UY")}
          sub={
            contactsStats
              ? contactsStats.newThisMonth > 0
                ? `+${contactsStats.newThisMonth.toLocaleString("es-UY")} este mes`
                : "sin nuevos este mes"
              : "—"
          }
        />
        <MiniKpiCard
          label="Tu rating en Google"
          tone="warm"
          icon={Star}
          value={
            googleStats
              ? `${googleStats.avgStars.toLocaleString("es-UY", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ★`
              : "—"
          }
          sub={
            googleStats
              ? `${googleStats.total.toLocaleString("es-UY")} reseñas en total · ${googleStats.thisMonth} este mes`
              : "—"
          }
        />
      </div>

      {/* Conversión + QR — antes apilados a lo largo de toda la página, ahora
          en la misma fila: son dos vistas de un mismo tema (qué tan bien
          convierte tu captación) y se leen mejor una al lado de la otra. */}
      <div className="grid gap-4 xl:grid-cols-2">
        <div className={`min-w-0 ${qrFunnel ? "" : "xl:col-span-2"}`}>
          <ConversionCard conversion={conversion} />
        </div>
        <div className={`min-w-0 ${conversion ? "" : "xl:col-span-2"}`}>
          <QrFunnelCard funnel={qrFunnel} />
        </div>
      </div>

      {/* Actividad + Comentarios — mismo motivo: "Comentarios para atender"
          vacío es una card chica, no necesita todo el ancho para sí sola. */}
      <div className="grid items-start gap-4 xl:grid-cols-[2fr_1fr]">
        <SectionCard
          interactive
          title="Tu actividad"
          description="Cómo se mueven tus mensajes y reseñas con el tiempo."
          action={
            <div className="hidden items-center gap-4 sm:flex">
              {ACTIVITY_SERIES.map((s) => (
                <span key={s.key} className="flex items-center gap-1.5 text-xs text-[#8891A4]">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  {s.label}
                </span>
              ))}
            </div>
          }
        >
          <div className="space-y-4">
            <ActivityFilters granularity={metrics.activityRange.granularity} />
            <ActivityEvolutionChart data={metrics.activityByMonth} />
          </div>
        </SectionCard>

        <SectionCard
          title="Comentarios para atender"
          description="No se publicaron en Google. Un mensaje a tiempo hace la diferencia 💬"
          action={
            unread > 0 ? (
              <span className="rounded-full bg-[#FFAB76]/20 px-3 py-1.5 text-xs font-semibold text-[#D4600A]">
                {unread} sin leer
              </span>
            ) : undefined
          }
        >
          <NegativeFeedbackList items={metrics.negativeFeedback} />
        </SectionCard>
      </div>

      {/* Reactivated customers — only if there's data */}
      {showReactivated && (
        <SectionCard
          title="Clientes reactivados este mes"
          description="Campañas que lograron que un cliente respondiera después de tiempo inactivo."
        >
          <p className="text-[44px] font-bold leading-none text-[#1A202C]">
            {metrics.kpis.reactivatedCustomers.current.toLocaleString("es-UY")}
          </p>
          <p className="mt-2 text-sm text-[#8891A4]">
            {metrics.kpis.reactivatedCustomers.previous > 0
              ? `${metrics.kpis.reactivatedCustomers.previous} el mes anterior`
              : "Sin datos del mes anterior"}
          </p>
        </SectionCard>
      )}
    </div>
  );
}
