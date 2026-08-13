import { redirect } from "next/navigation";
import { apiFetch, isUnauthorizedApiError } from "@/lib/api";
import { getEffectiveApiContext, getSession } from "@/lib/auth";
import { isClinicVertical } from "@/lib/verticals";
import QuickAttend from "./quick-attend";
import MonthlyGoalCard from "./monthly-goal-card";
import RatingCard from "./rating-card";
import ActiveCustomersCard from "./active-customers-card";
import QrActivityCard from "./qr-activity-card";
import PerformanceSection from "./performance-section";
import RecentActivityCard from "./recent-activity-card";
import QuickActions from "./quick-actions";
import NextStepsCard from "./next-steps-card";
import RetentionSignalCard from "./retention-signal-card";
import RewardGoalsStrip from "./reward-goals-strip";
import PeriodFilter from "./period-filter";
import type { DashboardOverview, PeriodDays } from "./dashboard-overview-types";

interface RecentAttendance {
  id: string;
  customerName: string;
  eventAt: string;
  hasReview: boolean;
  messageSent: boolean;
}

export type PlanType = "FREE_TRIAL" | "BASE" | "PRO";
export type GoalType = "REVIEWS" | "CONTACTS";

export interface GoalView {
  source: "trial" | "user";
  type: GoalType;
  /** What the number actually counts — drives the honest label in the UI. */
  metric?: "google_reviews_since_start" | "unique_contacts";
  target: number;
  current: number;
  deadline: string | null;
  startedAt: string;
}

interface PanelStats {
  reviews: {
    thisMonth: number;
    lastMonth: number;
    delta: number;
  };
  attended: {
    today: number;
    thisWeek: number;
  };
  messages: {
    today: number;
    thisMonth: number;
    quotaLimit: number;
  };
  currentPlan: { type: PlanType } | null;
  goalView: GoalView | null;
  recentAttendances: RecentAttendance[];
}

function MessageQuotaBanner({
  used,
  limit,
}: {
  used: number;
  limit: number;
}) {
  if (!limit) return null;
  const pct = Math.round((used / limit) * 100);
  if (pct < 80) return null;

  const isBlocked = pct >= 100;
  const isCritical = pct >= 95;
  const classes =
    isBlocked || isCritical
      ? "border-[#C0392B]/25 bg-[#C0392B]/10 text-[#8F2A20]"
      : "border-[#FFAB76]/35 bg-[#FFF4E5] text-[#8A520D]";
  const dotClass = isBlocked || isCritical ? "bg-[#C0392B]" : "bg-[#D4600A]";
  const title = isBlocked
    ? "Llegaste al límite mensual de mensajes"
    : isCritical
      ? "Estás por llegar al límite mensual de mensajes"
      : "Estás cerca del límite mensual de mensajes";

  return (
    <div className={`rounded-[12px] border px-4 py-3 text-sm ${classes}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <span aria-hidden="true" className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} />
          <div>
            <p className="font-bold">{title}</p>
            <p className="mt-1">
              Usaste{" "}
              <span className="font-semibold">
                {used.toLocaleString("es-UY")} de {limit.toLocaleString("es-UY")}
              </span>{" "}
              mensajes este mes ({pct}%).
            </p>
          </div>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/70 sm:w-44">
          <div
            className={`h-full rounded-full ${dotClass}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function greetingForTimezone(timezone: string): string {
  let hour = 12;
  try {
    hour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "2-digit",
        hourCycle: "h23",
      }).format(new Date()),
    );
  } catch {
    // Invalid timezone → fall back to midday greeting.
  }
  if (!Number.isFinite(hour)) hour = 12;
  if (hour < 12) return "Buen día";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

function longDateForTimezone(timezone: string): string {
  try {
    const formatted = new Intl.DateTimeFormat("es-UY", {
      timeZone: timezone,
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date());
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  } catch {
    return new Date().toLocaleDateString("es-UY");
  }
}

function parsePeriod(raw: string | string[] | undefined): PeriodDays {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "7" || value === "30" || value === "90") {
    return Number(value) as PeriodDays;
  }
  return 30;
}

interface DashboardPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardLegacyPage({ searchParams }: DashboardPageProps) {
  const session = await getSession();
  if (!session?.activeBusinessId) redirect("/login");

  const { accessToken, businessId } = getEffectiveApiContext(session);
  if (!businessId) redirect("/login");

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const period = parsePeriod(resolvedSearchParams.period);

  let overview: DashboardOverview | null = null;
  let error: string | null = null;
  let sessionExpired = false;
  try {
    overview = await apiFetch<DashboardOverview>(
      `/dashboard/overview?period=${period}`,
      accessToken,
      { businessId },
    );
  } catch (e) {
    if (isUnauthorizedApiError(e)) sessionExpired = true;
    else error = e instanceof Error ? e.message : "Error al cargar el panel";
  }
  if (sessionExpired) redirect("/session-expired");

  // Datos secundarios best-effort: cuota de mensajes, atención clínica y el
  // saludo por horario. Si fallan, el panel principal igual se muestra.
  let vertical: string | null = null;
  let timezone = "America/Montevideo";
  let panelStats: PanelStats | null = null;
  try {
    const [biz, panel] = await Promise.all([
      apiFetch<{ vertical: string | null; timezone?: string | null }>(
        "/businesses/current",
        accessToken,
        { businessId },
      ),
      apiFetch<PanelStats>("/metrics/panel", accessToken, { businessId }),
    ]);
    vertical = biz.vertical ?? null;
    if (biz.timezone) timezone = biz.timezone;
    panelStats = panel;
  } catch {
    // Best-effort: greeting defaults to midday, clinic widget hidden, quota
    // banner hidden.
  }
  const isClinic = isClinicVertical(vertical);
  const greeting = greetingForTimezone(timezone);
  const longDate = longDateForTimezone(timezone);

  const firstName = session.user?.firstName?.trim();

  if (error || !overview) {
    return (
      <div className="max-w-3xl">
        <h1 className="font-display text-2xl font-bold text-[#1A202C]">Panel</h1>
        <div className="mt-5 rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
          {error ?? "Error al cargar datos"}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 xl:max-w-7xl 2xl:max-w-[1600px]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#1A202C] sm:text-[28px]">
            {greeting}
            {firstName ? `, ${firstName}` : ""} <span aria-hidden="true">👋</span>
          </h1>
          <p className="mt-1.5 text-sm text-[#8891A4]">Así va tu negocio hoy, {longDate}</p>
        </div>
        <PeriodFilter period={period} />
      </header>

      {panelStats && (
        <MessageQuotaBanner
          used={panelStats.messages.thisMonth}
          limit={panelStats.messages.quotaLimit}
        />
      )}

      {/* 4 cards principales */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MonthlyGoalCard goalView={overview.objective.goal} currentPlan={overview.objective.currentPlan} />
        <RatingCard rating={overview.rating} />
        <ActiveCustomersCard data={overview.activeCustomers} />
        <QrActivityCard data={overview.qrActivity} />
      </div>

      {overview.rewardGoalsSignal && <RewardGoalsStrip signal={overview.rewardGoalsSignal} />}

      {/* Rendimiento + Actividad reciente */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <article className="rounded-[16px] border border-[#E8EAF0] bg-white p-5">
          <h2 className="text-base font-bold text-[#1A202C]">Rendimiento</h2>
          <p className="mt-1 text-sm text-[#8891A4]">
            Cómo se mueven tus números en los últimos {overview.period.days} días.
          </p>
          <div className="mt-4">
            <PerformanceSection performance={overview.performance} />
          </div>
        </article>

        <RecentActivityCard items={overview.recentActivity} />
      </div>

      {/* Acciones rápidas */}
      <div>
        <h2 className="mb-3 text-base font-bold text-[#1A202C]">Acciones rápidas</h2>
        <QuickActions />
      </div>

      {/* Próximos pasos + señal de Retención */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={overview.retentionSignal ? undefined : "lg:col-span-2"}>
          <NextStepsCard steps={overview.nextSteps} />
        </div>
        {overview.retentionSignal && <RetentionSignalCard signal={overview.retentionSignal} />}
      </div>

      {isClinic ? <QuickAttend /> : null}
    </div>
  );
}
