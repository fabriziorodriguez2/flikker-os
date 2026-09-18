import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { apiFetch, isUnauthorizedApiError } from "@/lib/api";
import { getEffectiveApiContext, getSession } from "@/lib/auth";
import PageHeader from "@/components/ui/page-header";
import SummaryCard, { type InsightsSummaryView } from "./summary-card";
import InsightCards from "./insight-cards";
import ImpactCard from "./impact-card";
import RecoveryOpportunityCard from "./recovery-opportunity-card";
import PlanLimitSignal from "./plan-limit-signal";
import {
  parseFreePlanUsage,
  type FreePlanUsage,
} from "@/lib/free-plan-usage";
import { CustomerCompositionChart, VisitTrendChart } from "./insights-charts";
import {
  buildRecommendation,
  FlikkerPerformance,
  LoyaltyHealthCard,
  RecommendationCard,
  ReputationCard,
} from "./insights-story";
import type {
  BusinessImpactMetricsView,
  InsightsMetricsView,
  InsightStatement,
} from "./types";

interface InsightsOverviewResponse {
  metrics: InsightsMetricsView;
  insights: InsightStatement[];
  impact: BusinessImpactMetricsView;
}

export default async function InsightsV2Page() {
  const session = await getSession();
  if (!session?.activeBusinessId) redirect("/login");
  const { accessToken, businessId } = getEffectiveApiContext(session);
  if (!businessId) redirect("/login");

  let overview: InsightsOverviewResponse | null = null;
  let sessionExpired = false;
  try {
    overview = await apiFetch<InsightsOverviewResponse>(
      "/insights/overview",
      accessToken,
      { businessId },
    );
  } catch (error) {
    if (isUnauthorizedApiError(error)) sessionExpired = true;
  }
  if (sessionExpired) redirect("/session-expired");

  /*
    Estado de plan, solo para decidir si mostrar la oportunidad de
    recuperación. Best-effort igual que el resumen: si falla, se asume Pro
    — el default que NO muestra el paywall. Ante la duda, no vender.
  */
  let isPro = true;
  let freePlanUsage: FreePlanUsage | null = null;
  try {
    const subscription = await apiFetch<{
      isPro?: boolean;
      freePlanUsage?: unknown;
    }>("/businesses/current/subscription", accessToken, { businessId });
    isPro = subscription?.isPro !== false;
    freePlanUsage = parseFreePlanUsage(subscription?.freePlanUsage);
  } catch {
    // Sin dato de plan no se muestra ningún prompt.
  }

  let summary: InsightsSummaryView | null = null;
  try {
    summary = await apiFetch<InsightsSummaryView | null>(
      "/insights/summary",
      accessToken,
      { businessId },
    );
  } catch {
    // El resumen es best-effort. Insights funciona con métricas determinísticas.
  }

  if (!overview) {
    return (
      <div
        className="space-y-7"
        style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
      >
        <PageHeader
          title="Insights"
          subtitle="Señales clave de clientes, fidelización y reputación."
        />
        <div className="rounded-[var(--panel-radius-card)] border border-[color:var(--panel-danger-border)] bg-[color:var(--panel-danger-bg)] px-4 py-3 text-sm text-[color:var(--panel-danger-text)]">
          No pudimos cargar los insights ahora. Probá de nuevo en un momento.
        </div>
      </div>
    );
  }

  const recommendation =
    summary?.recommendations[0] ?? buildRecommendation(overview.metrics);

  return (
    <div
      className="space-y-7 pb-10"
      style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
    >
      <PageHeader
        title="Insights"
        subtitle="Señales clave de clientes, fidelización y reputación."
        actions={
          <span className="inline-flex h-9 items-center gap-2 rounded-[var(--panel-radius-control)] border border-[color:var(--panel-border)] bg-[color:var(--panel-surface)] px-3 text-xs font-medium text-[color:var(--panel-text-secondary)]">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            Actividad: últimos {overview.metrics.windowDays} días
          </span>
        }
      />

      <ImpactCard impact={overview.impact} metrics={overview.metrics} />

      {/* Oportunidad, no resultado — va DESPUÉS del impacto real para que
          nunca se lea como algo que ya ocurrió. */}
      <RecoveryOpportunityCard metrics={overview.metrics} isPro={isPro} />

      {/* Capacidad del plan, no performance del negocio. Separado a
          propósito de `FlikkerPerformance`, que empieza justo abajo. */}
      <PlanLimitSignal usage={freePlanUsage} />

      <FlikkerPerformance metrics={overview.metrics} />

      <section className="grid gap-4 lg:grid-cols-2" aria-label="Gráficos">
        <CustomerCompositionChart metrics={overview.metrics} />
        <VisitTrendChart metrics={overview.metrics} />
      </section>

      <section
        className="grid gap-4 lg:grid-cols-2"
        aria-label="Reputación y fidelización"
      >
        <ReputationCard metrics={overview.metrics} />
        <LoyaltyHealthCard metrics={overview.metrics} />
      </section>

      <section
        className={`grid items-start gap-4 ${summary ? "lg:grid-cols-[minmax(0,1fr)_340px]" : ""}`}
      >
        <InsightCards insights={overview.insights} />
        <SummaryCard initialSummary={summary} />
      </section>

      <RecommendationCard text={recommendation} />
    </div>
  );
}
