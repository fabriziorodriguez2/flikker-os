import { redirect } from "next/navigation";
import { apiFetch, isUnauthorizedApiError } from "@/lib/api";
import { getEffectiveApiContext, getSession } from "@/lib/auth";
import SectionCard from "@/components/ui/section-card";
import ActivityEvolutionChart from "./activity-evolution-chart";
import ActivityFilters, { type ActivityGranularity } from "./activity-filters";
import { ACTIVITY_SERIES } from "./activity-series";
import NegativeFeedbackList from "./negative-feedback-list";

interface Business {
  name: string;
  industry: string | null;
  logoUrl: string | null;
  createdAt: string;
  googlePlaceId: string | null;
  googleReviewsLastSyncAt: string | null;
}

interface KpiMetric {
  current: number;
  previous: number;
  delta: number;
}

interface MetricsOverview {
  month: {
    currentStart: string;
    currentEnd: string;
    previousStart: string;
    previousEnd: string;
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
    score: number;
    comment: string | null;
    acknowledgedByOwner: boolean;
  }>;
}

interface DashboardPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function formatMonthRange(start: string) {
  return new Intl.DateTimeFormat("es-UY", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(start));
}

function formatPrevMonth(start: string) {
  return new Intl.DateTimeFormat("es-UY", {
    month: "short",
    timeZone: "UTC",
  })
    .format(new Date(start))
    .replace(".", "");
}

function formatKpiValue(value: number, decimals = 0) {
  return value.toLocaleString("es-UY", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
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

function shouldShowGoogleImportBanner(business: Business | null) {
  if (!business?.googlePlaceId || business.googleReviewsLastSyncAt) return false;
  const createdAt = new Date(business.createdAt).getTime();
  if (Number.isNaN(createdAt)) return false;
  return Date.now() - createdAt < 24 * 60 * 60 * 1000;
}

function KpiCard({
  label,
  value,
  metric,
  decimals = 0,
  percentageDelta = false,
  prevMonth,
  note,
}: {
  label: string;
  value: string;
  metric: KpiMetric;
  decimals?: number;
  percentageDelta?: boolean;
  prevMonth: string;
  note?: string;
}) {
  const isPositive = metric.delta >= 0;
  const deltaClass = isPositive
    ? "bg-[color:rgba(99,153,34,0.12)] text-[#639922]"
    : "bg-[color:rgba(192,57,43,0.1)] text-[#C0392B]";
  const deltaText = `${formatKpiValue(Math.abs(metric.delta), decimals)}${percentageDelta ? "%" : ""}`;

  return (
    <article className="rounded-[12px] border border-[#E8EAF0] bg-white p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8891A4]">
        {label}
      </p>
      <p className="mt-3 text-[32px] font-bold leading-none text-[#1A202C]">
        {value}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-2.5 py-1 font-semibold ${deltaClass}`}>
          {isPositive ? "↑" : "↓"} {deltaText}
        </span>
        <span className="text-[#8891A4]">vs {prevMonth}</span>
      </div>
      {note ? <p className="mt-2 text-xs text-[#8891A4]">{note}</p> : null}
    </article>
  );
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const session = await getSession();
  if (!session?.activeBusinessId) redirect("/dashboard");

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const { accessToken, businessId } = getEffectiveApiContext(session);
  if (!businessId) redirect("/dashboard");

  let business: Business | null = null;
  let metrics: MetricsOverview | null = null;
  let error: string | null = null;

  try {
    [business, metrics] = await Promise.all([
      apiFetch<Business>("/businesses/current", accessToken, { businessId }),
      apiFetch<MetricsOverview>(buildMetricsPath(resolvedSearchParams), accessToken, { businessId }),
    ]);
  } catch (e) {
    if (isUnauthorizedApiError(e)) redirect("/session-expired");
    error = e instanceof Error ? e.message : "Error al cargar datos";
  }

  if (error || !metrics) {
    return (
      <div className="max-w-3xl">
        <h1 className="font-display text-2xl font-bold text-[#1A202C]">Panel</h1>
        <p className="mt-2 text-sm text-[#8891A4]">
          No pudimos cargar el dashboard del negocio activo.
        </p>
        <div className="mt-5 rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
          {error ?? "Error al cargar datos"}
        </div>
      </div>
    );
  }

  const prevMonth = formatPrevMonth(metrics.month.previousStart);
  const unread = metrics.negativeFeedback.filter((f) => !f.acknowledgedByOwner).length;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#1A202C]">Panel</h1>
        <p className="mt-1 text-sm text-[#8891A4]">
          {business?.name ?? "Negocio"} · {formatMonthRange(metrics.month.currentStart)}
        </p>
      </div>

      {shouldShowGoogleImportBanner(business) ? (
        <div className="flex items-center gap-2 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span
            aria-hidden="true"
            className="h-3 w-3 animate-spin rounded-full border-2 border-amber-300 border-t-amber-700"
          />
          <span>Importando reseñas de Google... Esto puede tardar algunos minutos.</span>
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <KpiCard
          label="Reseñas este mes"
          value={formatKpiValue(metrics.kpis.reviewsGenerated.current)}
          metric={metrics.kpis.reviewsGenerated}
          percentageDelta
          prevMonth={prevMonth}
          note="Estimación: algunas pueden no estar atribuidas"
        />
        <KpiCard
          label="Calificación promedio"
          value={formatKpiValue(metrics.kpis.averageRating.current, 1)}
          metric={metrics.kpis.averageRating}
          decimals={1}
          prevMonth={prevMonth}
        />
        <KpiCard
          label="Pacientes reactivados"
          value={formatKpiValue(metrics.kpis.reactivatedCustomers.current)}
          metric={metrics.kpis.reactivatedCustomers}
          percentageDelta
          prevMonth={prevMonth}
        />
      </section>

      <SectionCard
        title="Actividad últimos 6 meses"
        description="Comparativo mensual de mensajes, reseñas y reactivaciones."
        action={
          <div className="hidden items-center gap-4 sm:flex">
            {ACTIVITY_SERIES.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 text-xs text-[#8891A4]">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-[3px]"
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
        title="Comentarios negativos recientes"
        description="No se publicaron en Google. Respondé al paciente antes de que escale."
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
