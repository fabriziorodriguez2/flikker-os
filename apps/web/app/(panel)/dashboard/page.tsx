import { redirect } from "next/navigation";
import { apiFetch, isUnauthorizedApiError } from "@/lib/api";
import { getEffectiveApiContext, getSession } from "@/lib/auth";
import PageHeader from "@/components/ui/page-header";
import SectionCard from "@/components/ui/section-card";
import ActivityEvolutionChart from "./activity-evolution-chart";
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
  reviewsByMonth: Array<{
    month: string;
    label: string;
    total: number;
  }>;
  activityByMonth: Array<{
    month: string;
    label: string;
    messagesSent: number;
    reviewsGenerated: number;
    reactivatedCustomers: number;
  }>;
  negativeFeedback: Array<{
    id: string;
    createdAt: string;
    customerName: string;
    score: number;
    comment: string | null;
    acknowledgedByOwner: boolean;
  }>;
}

function formatMonthRange(start: string) {
  return new Intl.DateTimeFormat("es-UY", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(start));
}

function formatKpiValue(value: number, decimals = 0) {
  return value.toLocaleString("es-UY", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatDelta(delta: number, decimals = 0) {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${formatKpiValue(delta, decimals)}`;
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
  note,
}: {
  label: string;
  value: string;
  metric: KpiMetric;
  decimals?: number;
  note?: string;
}) {
  const isPositive = metric.delta >= 0;
  const deltaClass = isPositive
    ? "bg-[color:rgba(46,125,77,0.1)] text-[color:#2e7d4d]"
    : "bg-[color:rgba(161,45,58,0.1)] text-[color:#a12d3a]";

  return (
    <article className="rounded-[20px] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold text-[color:var(--foreground)]">
        {value}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`rounded-full px-2.5 py-1 font-semibold ${deltaClass}`}
        >
          {isPositive ? "↑" : "↓"} {formatDelta(metric.delta, decimals)}
        </span>
        <span className="text-[color:var(--text-muted)]">
          vs mes anterior ({formatKpiValue(metric.previous, decimals)})
        </span>
      </div>
      {note ? (
        <p className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
          {note}
        </p>
      ) : null}
    </article>
  );
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session?.activeBusinessId) redirect("/dashboard");

  const { accessToken, businessId } = getEffectiveApiContext(session);
  if (!businessId) redirect("/dashboard");
  let business: Business | null = null;
  let metrics: MetricsOverview | null = null;
  let error: string | null = null;

  try {
    [business, metrics] = await Promise.all([
      apiFetch<Business>("/businesses/current", accessToken, {
        businessId,
      }),
      apiFetch<MetricsOverview>("/metrics/overview", accessToken, {
        businessId,
      }),
    ]);
  } catch (e) {
    if (isUnauthorizedApiError(e)) redirect("/session-expired");
    error = e instanceof Error ? e.message : "Error al cargar datos";
  }

  if (error || !metrics) {
    return (
      <div className="max-w-3xl">
        <PageHeader
          eyebrow="Inicio"
          title="Resumen"
          subtitle="No pudimos cargar el dashboard del negocio activo."
        />
        <div
          className="mt-5 rounded-[20px] border px-4 py-3 text-sm text-[color:var(--danger-text)]"
          style={{
            backgroundColor: "var(--danger-bg)",
            borderColor: "rgba(161,45,58,0.16)",
          }}
        >
          {error ?? "Error al cargar datos"}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        eyebrow="Inicio"
        title={business?.name ?? "Flikker"}
        logoUrl={business?.logoUrl}
        subtitle={`Panel MVP de ${formatMonthRange(metrics.month.currentStart)}${
          business?.industry ? ` · ${business.industry}` : ""
        }`}
      />

      {shouldShowGoogleImportBanner(business) ? (
        <div className="flex items-center gap-2 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span
            aria-hidden="true"
            className="h-3 w-3 animate-spin rounded-full border-2 border-amber-300 border-t-amber-700"
          />
          <span>
            Importando reseñas de Google... Esto puede tardar algunos minutos.
          </span>
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        <KpiCard
          label="Resenas detectadas"
          value={formatKpiValue(metrics.kpis.reviewsGenerated.current)}
          metric={metrics.kpis.reviewsGenerated}
          note="Estimacion: algunas pueden no estar atribuidas"
        />
        <KpiCard
          label="Calificacion promedio"
          value={formatKpiValue(metrics.kpis.averageRating.current, 1)}
          metric={metrics.kpis.averageRating}
          decimals={1}
        />
        <KpiCard
          label="Clientes reactivados"
          value={formatKpiValue(metrics.kpis.reactivatedCustomers.current)}
          metric={metrics.kpis.reactivatedCustomers}
        />
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
        <SectionCard
          title="Evolución de actividad"
          description="Mensajes enviados, reseñas generadas y clientes reactivados en los últimos 6 meses."
        >
          <ActivityEvolutionChart data={metrics.activityByMonth} />
        </SectionCard>

        <SectionCard
          title="Comentarios negativos"
          description="Respuestas con score menor a 4, ordenadas por fecha."
          tone="tinted"
        >
          <NegativeFeedbackList items={metrics.negativeFeedback} />
        </SectionCard>
      </section>
    </div>
  );
}
