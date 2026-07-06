import { redirect } from "next/navigation";
import { apiFetch, isUnauthorizedApiError } from "@/lib/api";
import { getEffectiveApiContext, getSession } from "@/lib/auth";
import QuickAttend from "./quick-attend";
import FlikPanel from "./flik-panel";
import OnboardingTour from "./onboarding-tour";
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

export default async function DashboardPage() {
  const session = await getSession();
  if (!session?.activeBusinessId) redirect("/login");

  const { accessToken, businessId } = getEffectiveApiContext(session);
  if (!businessId) redirect("/login");

  let stats: PanelStats | null = null;
  let onboardingCompletedAt: string | null = null;
  let error: string | null = null;

  let sessionExpired = false;
  try {
    const [statsRes, meRes] = await Promise.all([
      apiFetch<PanelStats>("/metrics/panel", accessToken, { businessId }),
      apiFetch<{ onboardingCompletedAt: string | null }>(
        "/auth/me",
        session.accessToken,
      ).catch(() => ({ onboardingCompletedAt: null })),
    ]);
    stats = statsRes;
    onboardingCompletedAt = meRes.onboardingCompletedAt;
  } catch (e) {
    if (isUnauthorizedApiError(e)) sessionExpired = true;
    else error = e instanceof Error ? e.message : "Error al cargar datos";
  }
  if (sessionExpired) redirect("/session-expired");

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

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#1A202C]">Panel</h1>
        <p className="mt-1 text-sm text-[#8891A4]">
          Vista operativa del día
        </p>
      </div>

      <MessageQuotaBanner
        used={stats.messages.thisMonth}
        limit={stats.messages.quotaLimit}
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Reseñas este mes"
          value={stats.reviews.thisMonth.toLocaleString("es-UY")}
          badge={reviewBadge}
          badgeVariant={reviewVariant}
        />
        <KpiCard
          label="Clientes atendidos hoy"
          value={stats.attended.today.toLocaleString("es-UY")}
          sub={`${stats.attended.thisWeek.toLocaleString("es-UY")} esta semana`}
          badgeVariant="neutral"
        />
        <KpiCard
          label="Mensajes enviados hoy"
          value={stats.messages.today.toLocaleString("es-UY")}
          sub={`${stats.messages.thisMonth.toLocaleString("es-UY")} este mes`}
          badgeVariant="neutral"
        />
      </section>

      {stats.rating && <RatingProgressCard rating={stats.rating} />}

      <FlikPanel
        attendedToday={stats.attended.today}
        currentPlan={stats.currentPlan}
        goalView={stats.goalView}
        recentAttendances={stats.recentAttendances}
      />

      <QuickAttend />

      <OnboardingTour
        alreadyCompleted={onboardingCompletedAt !== null}
      />
    </div>
  );
}
