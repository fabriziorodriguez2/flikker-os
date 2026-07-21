import Link from "next/link";
import { redirect } from "next/navigation";
import { apiFetch, isUnauthorizedApiError } from "@/lib/api";
import { getEffectiveApiContext, getSession } from "@/lib/auth";
import { isClinicVertical } from "@/lib/verticals";
import QuickAttend from "./quick-attend";
import MonthlyGoalCard from "./monthly-goal-card";
import { RatingProgressCard, type RatingData } from "./rating-progress-card";

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
  rating: RatingData | null;
  recentAttendances: RecentAttendance[];
}

function KpiCard({
  label,
  value,
  sub,
  badge,
  badgeVariant,
}: {
  label: string;
  value: string | number;
  sub?: string;
  badge?: string;
  badgeVariant?: "positive" | "negative" | "neutral";
}) {
  const badgeClass =
    badgeVariant === "positive"
      ? "bg-[color:rgba(99,153,34,0.12)] text-[#639922]"
      : badgeVariant === "negative"
        ? "bg-[color:rgba(192,57,43,0.1)] text-[#C0392B]"
        : "bg-[#EEF0FB] text-[#5C6BC0]";

  return (
    <article className="rounded-[12px] border border-[#E8EAF0] bg-white p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8891A4]">
        {label}
      </p>
      <p className="mt-3 text-[32px] font-bold leading-none text-[#1A202C]">
        {value}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {badge ? (
          <span className={`rounded-full px-2.5 py-1 font-semibold ${badgeClass}`}>
            {badge}
          </span>
        ) : null}
        {sub ? <span className="text-[#8891A4]">{sub}</span> : null}
      </div>
    </article>
  );
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

export default async function DashboardPage() {
  const session = await getSession();
  if (!session?.activeBusinessId) redirect("/login");

  const { accessToken, businessId } = getEffectiveApiContext(session);
  if (!businessId) redirect("/login");

  let stats: PanelStats | null = null;
  let error: string | null = null;

  let sessionExpired = false;
  try {
    stats = await apiFetch<PanelStats>("/metrics/panel", accessToken, { businessId });
  } catch (e) {
    if (isUnauthorizedApiError(e)) sessionExpired = true;
    else error = e instanceof Error ? e.message : "Error al cargar datos";
  }
  if (sessionExpired) redirect("/session-expired");

  // Attendance UI (marcar atendido / últimas atenciones) is clinic-only.
  // We also read the timezone to greet by local time of day.
  let vertical: string | null = null;
  let timezone = "America/Montevideo";
  try {
    const biz = await apiFetch<{
      vertical: string | null;
      timezone?: string | null;
    }>("/businesses/current", accessToken, { businessId });
    vertical = biz.vertical ?? null;
    if (biz.timezone) timezone = biz.timezone;
  } catch {
    // Best-effort: default to non-clinic (attendance UI hidden) on failure.
  }
  const isClinic = isClinicVertical(vertical);
  const greeting = greetingForTimezone(timezone);

  if (error || !stats) {
    return (
      <div className="max-w-3xl">
        <h1 className="font-display text-2xl font-bold text-[#1A202C]">Panel</h1>
        <div className="mt-5 rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
          {error ?? "Error al cargar datos"}
        </div>
      </div>
    );
  }

  const reviewBadge =
    stats.reviews.delta > 0
      ? `↑ ${stats.reviews.delta}% vs mes anterior`
      : stats.reviews.delta < 0
        ? `↓ ${Math.abs(stats.reviews.delta)}% vs mes anterior`
        : "Igual que el mes anterior";

  const reviewVariant =
    stats.reviews.delta > 0 ? "positive" : stats.reviews.delta < 0 ? "negative" : "neutral";

  const firstName = session.user?.firstName?.trim();
  const heroSubtitle = isClinic
    ? stats.attended.today === 0
      ? "Todavía no marcaste a nadie. Un cliente por vez."
      : `Van ${stats.attended.today.toLocaleString("es-UY")} atendidos hoy. ¡Seguí así!`
    : "Este es el resumen de tu reputación. Seguí sumando reseñas ✨";

  const secondaryKpi = isClinic ? (
    <KpiCard
      label="Clientes atendidos hoy"
      value={stats.attended.today.toLocaleString("es-UY")}
      sub={`${stats.attended.thisWeek.toLocaleString("es-UY")} esta semana`}
      badgeVariant="neutral"
    />
  ) : (
    <KpiCard
      label="Mensajes enviados hoy"
      value={stats.messages.today.toLocaleString("es-UY")}
      sub={`${stats.messages.thisMonth.toLocaleString("es-UY")} este mes`}
      badgeVariant="neutral"
    />
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="text-center">
        <h1 className="font-display text-2xl font-bold text-[#1A202C] sm:text-[28px]">
          {greeting}
          {firstName ? `, ${firstName}` : ""}{" "}
          <span aria-hidden="true">👋</span>
        </h1>
        <p className="mt-1.5 text-sm text-[#8891A4]">{heroSubtitle}</p>
      </header>

      <MessageQuotaBanner
        used={stats.messages.thisMonth}
        limit={stats.messages.quotaLimit}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <MonthlyGoalCard
          goalView={stats.goalView}
          currentPlan={stats.currentPlan}
        />

        <div className="flex flex-col gap-4">
          {stats.rating && <RatingProgressCard rating={stats.rating} />}
          <div className="grid grid-cols-2 gap-4">
            <KpiCard
              label="Reseñas este mes"
              value={stats.reviews.thisMonth.toLocaleString("es-UY")}
              badge={reviewBadge}
              badgeVariant={reviewVariant}
            />
            {secondaryKpi}
          </div>
        </div>
      </div>

      <Link
        href="/dashboard/reviews"
        className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#5C6BC0] px-6 py-4 text-base font-bold text-white shadow-[0_10px_24px_rgba(92,107,192,0.28)] transition-colors hover:bg-[#4f5eb0]"
      >
        Ver reseñas nuevas <span aria-hidden="true">→</span>
      </Link>

      {isClinic ? <QuickAttend /> : null}
    </div>
  );
}
