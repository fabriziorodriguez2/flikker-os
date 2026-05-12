import { redirect } from "next/navigation";
import { apiFetch, isUnauthorizedApiError } from "@/lib/api";
import { getSession } from "@/lib/auth";
import PageHeader from "@/components/ui/page-header";
import SectionCard from "@/components/ui/section-card";
import NegativeFeedbackList from "./negative-feedback-list";

interface Business {
  name: string;
  industry: string | null;
  logoUrl: string | null;
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

  const { accessToken, activeBusinessId } = session;
  let business: Business | null = null;
  let metrics: MetricsOverview | null = null;
  let error: string | null = null;

  try {
    [business, metrics] = await Promise.all([
      apiFetch<Business>("/businesses/current", accessToken, {
        businessId: activeBusinessId,
      }),
      apiFetch<MetricsOverview>("/metrics/overview", accessToken, {
        businessId: activeBusinessId,
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

  const maxMonthlyReviews = Math.max(
    1,
    ...metrics.reviewsByMonth.map((month) => month.total),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        eyebrow="Inicio"
        title={business?.name ?? "Flikker"}
        logoUrl={business?.logoUrl}
        subtitle={`Dashboard MVP de ${formatMonthRange(metrics.month.currentStart)}${
          business?.industry ? ` · ${business.industry}` : ""
        }`}
      />

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
          title="Evolucion mensual"
          description="Resenas detectadas: estimacion; algunas pueden no estar atribuidas."
        >
          <div className="flex h-64 items-end gap-2 sm:gap-3">
            {metrics.reviewsByMonth.map((month) => {
              const height = Math.max(
                8,
                (month.total / maxMonthlyReviews) * 100,
              );

              return (
                <div
                  key={month.month}
                  className="flex min-w-0 flex-1 flex-col items-center gap-2"
                >
                  <div className="flex h-48 w-full items-end rounded-[12px] bg-[color:rgba(145,136,245,0.08)] p-1">
                    <div
                      className="w-full rounded-[10px] bg-[color:var(--brand-primary)]"
                      style={{ height: `${height}%` }}
                      aria-label={`${month.total} resenas en ${month.label}`}
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-[color:var(--foreground)]">
                      {month.total}
                    </p>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                      {month.label}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard
          title="Feedback negativo"
          description="Respuestas con score menor a 4, ordenadas por fecha."
          tone="tinted"
        >
          <NegativeFeedbackList items={metrics.negativeFeedback} />
        </SectionCard>
      </section>
    </div>
  );
}
