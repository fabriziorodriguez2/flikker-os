import { redirect } from "next/navigation";
import { apiFetch, isUnauthorizedApiError } from "@/lib/api";
import { getEffectiveApiContext, getSession } from "@/lib/auth";
import SectionCard from "@/components/ui/section-card";
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
  attributedReviews: number;
  conversionRate: number | null;
  insufficientData: boolean;
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
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <article className="rounded-[12px] border border-[#E8EAF0] bg-white p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8891A4]">
        {label}
      </p>
      <p className="mt-3 text-[32px] font-bold leading-none text-[#1A202C]">
        {value}
      </p>
      <p className="mt-3 text-xs text-[#8891A4]">{sub}</p>
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
    <div className="relative mx-auto h-[150px] w-[150px] shrink-0">
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
      title="Conversión a reseñas"
      description="Cuántos de tus mensajes de los últimos 30 días terminaron en una reseña ⭐"
    >
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-center sm:gap-8">
        <ConversionRing pct={conversion.conversionRate ?? 0} muted={muted} />
        <div className="max-w-xs text-center sm:text-left">
          {muted ? (
            <p className="text-sm text-[#8891A4]">
              Todavía no hay datos suficientes. Necesitás al menos 30 mensajes
              enviados (llevás{" "}
              <span className="font-semibold text-[#1A202C]">
                {conversion.sentMessages}
              </span>
              ) para ver tu tasa de conversión. ¡Seguí mandando! 💪
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

export default async function InsightsPage({ searchParams }: InsightsPageProps) {
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
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#1A202C]">
          Tu resumen
        </h1>
        <p className="mt-1 text-sm text-[#8891A4]">
          Mirá cómo evoluciona tu reputación y qué te está trayendo reseñas 📈
        </p>
      </div>

      {/* Friendly trend summary */}
      <div
        className={`rounded-[14px] border px-5 py-4 text-sm font-semibold ${
          revUp
            ? "border-[#1D9E75]/20 bg-[#1D9E75]/10 text-[#12795A]"
            : "border-[#E8EAF0] bg-[#F9F9FB] text-[#4A5568]"
        }`}
      >
        {revSummary}
      </div>

      {/* KPI row — contacts + rating, same visual language as /dashboard */}
      <div className="grid gap-4 sm:grid-cols-2">
        <MiniKpiCard
          label="Contactos"
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

      {/* Conversion rate */}
      <ConversionCard conversion={conversion} />

      {/* Activity chart */}
      <SectionCard
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

      {/* Negative feedback */}
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
  );
}
