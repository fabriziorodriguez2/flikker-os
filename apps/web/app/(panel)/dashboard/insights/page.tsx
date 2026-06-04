import { redirect } from "next/navigation";
import { apiFetch, isUnauthorizedApiError } from "@/lib/api";
import { getEffectiveApiContext, getSession } from "@/lib/auth";
import SectionCard from "@/components/ui/section-card";
import ActivityEvolutionChart from "../activity-evolution-chart";
import ActivityFilters, { type ActivityGranularity } from "../activity-filters";
import { ACTIVITY_SERIES } from "../activity-series";
import NegativeFeedbackList from "../negative-feedback-list";
import ConversionSection from "../conversion-section";

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

function AvgRatingCard({ stats }: { stats: GoogleStats }) {
  const dist = stats.ratingDistribution;
  const maxCount = Math.max(...[5, 4, 3, 2, 1].map((s) => dist[s] ?? 0), 1);

  return (
    <SectionCard
      title="Calificación promedio en Google"
      description={`${stats.total.toLocaleString("es-UY")} reseñas en total · ${stats.thisMonth} este mes`}
    >
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex flex-col items-center gap-1">
          <p className="text-[44px] font-bold leading-none text-[#1A202C]">
            {stats.avgStars.toLocaleString("es-UY", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            })}
          </p>
          <span className="text-xl text-amber-400" aria-hidden="true">★★★★★</span>
          <p className="text-xs text-[#8891A4]">promedio</p>
        </div>
        <div className="flex-1 min-w-[160px] space-y-2">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = dist[star] ?? 0;
            const pct = Math.round((count / maxCount) * 100);
            return (
              <div key={star} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-right text-xs font-semibold text-[#8891A4]">
                  {star}
                </span>
                <span className="text-amber-400 text-xs" aria-hidden="true">★</span>
                <div className="flex-1 overflow-hidden rounded-full bg-[#F0F2FA] h-2">
                  {count > 0 && (
                    <div
                      className="h-full rounded-full bg-amber-400"
                      style={{ width: `${pct}%` }}
                    />
                  )}
                </div>
                <span className="w-8 shrink-0 text-right text-xs tabular-nums text-[#8891A4]">
                  {count}
                </span>
              </div>
            );
          })}
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

  try {
    [metrics, googleStats] = await Promise.all([
      apiFetch<MetricsOverview>(buildMetricsPath(resolvedSearchParams), accessToken, { businessId }),
      apiFetch<GoogleStats>("/reviews/google/stats", accessToken, { businessId }),
    ]);
  } catch (e) {
    if (isUnauthorizedApiError(e)) redirect("/session-expired");
    error = e instanceof Error ? e.message : "Error al cargar datos";
  }

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

  const unread = metrics.negativeFeedback.filter((f) => !f.acknowledgedByOwner).length;
  const showReactivated = metrics.kpis.reactivatedCustomers.current > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#1A202C]">Insights</h1>
        <p className="mt-1 text-sm text-[#8891A4]">
          Análisis de actividad, conversión y reputación
        </p>
      </div>

      {/* Activity chart */}
      <SectionCard
        title="Actividad"
        description="Mensajes, reseñas y reactivaciones por período."
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

      {/* Conversion */}
      <ConversionSection rawRange={firstValue(resolvedSearchParams.cvRange)} />

      {/* Avg rating */}
      {googleStats ? <AvgRatingCard stats={googleStats} /> : null}

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
        title="Comentarios negativos recientes"
        description="No se publicaron en Google. Respondé al cliente antes de que escale."
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
