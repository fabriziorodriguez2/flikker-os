import { redirect } from "next/navigation";
import { apiFetch, isUnauthorizedApiError } from "@/lib/api";
import { getEffectiveApiContext, getSession } from "@/lib/auth";
import PageHeader from "@/components/ui/page-header";
import SummaryCard, { type InsightsSummaryView } from "./summary-card";
import InsightCards, { type InsightStatement } from "./insight-cards";
import ImpactCard, { type BusinessImpactMetricsView } from "./impact-card";

interface InsightsOverviewResponse {
  insights: InsightStatement[];
  impact: BusinessImpactMetricsView;
}

/**
 * Insights (Check-in V2) — "qué está pasando en tu negocio y qué debería
 * hacer", no otro dashboard de gráficos. Las afirmaciones ya vienen
 * narradas por el backend (`insights-narrator.ts`); esta pantalla solo las
 * pinta, junto con el resumen de IA cacheado.
 */
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
  } catch (e) {
    if (isUnauthorizedApiError(e)) sessionExpired = true;
  }
  if (sessionExpired) redirect("/session-expired");

  // El resumen IA es aparte y best-effort: si el negocio no tiene IA
  // habilitada (default) o algo falla, la pantalla de insights determinísticos
  // sigue funcionando igual.
  let summary: InsightsSummaryView | null = null;
  try {
    summary = await apiFetch<InsightsSummaryView | null>(
      "/insights/summary",
      accessToken,
      { businessId },
    );
  } catch {
    // card oculta/vacía, el resto de la pantalla sigue.
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Insights"
        subtitle="Qué está pasando en tu negocio y qué convendría hacer."
      />

      {overview && <ImpactCard impact={overview.impact} />}

      <SummaryCard initialSummary={summary} />

      {overview ? (
        <InsightCards insights={overview.insights} />
      ) : (
        <div className="rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
          No pudimos cargar los insights ahora. Probá de nuevo en un momento.
        </div>
      )}
    </div>
  );
}
