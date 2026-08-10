// Tipos del frontend que reflejan exactamente la respuesta de
// `GET /dashboard/overview?period=7|30|90` (ver
// apps/api/src/modules/dashboard/dashboard-overview.service.ts). No inventar
// campos: si algo no está acá, no existe en el backend todavía.
import type { GoalView, PlanType } from "./page";

export type ExperienceVersion = "LEGACY" | "CHECKIN_V2";
export type PeriodDays = 7 | 30 | 90;

export interface PeriodChange {
  absolute: number;
  /** null cuando el período anterior era 0 — nunca mostrar "+∞%". */
  percent: number | null;
}

export interface DashboardObjective {
  goal: GoalView | null;
  currentPlan: { type: PlanType } | null;
}

export interface DashboardRating {
  current: number | null;
  totalReviews: number;
  newInPeriod: number;
  newInPreviousPeriod: number;
  change: PeriodChange;
  ratingDelta: number | null;
}

export interface DashboardActiveCustomers {
  available: true;
  current: number;
  previous: number;
  change: PeriodChange;
  trend: number[];
}

export interface DashboardQrActivity {
  label: string;
  current: number;
  previous: number;
  change: PeriodChange;
  trend: number[];
}

export interface PerformanceKpi {
  key: string;
  label: string;
  current: number;
}

export interface PerformancePoint {
  date: string;
  [seriesKey: string]: string | number;
}

export interface DashboardPerformance {
  kpis: PerformanceKpi[];
  series: PerformancePoint[];
}

export type RecentActivityType =
  | "review"
  | "benefit_redeemed"
  | "visit"
  | "visit_source_created"
  | "campaign_sent"
  | "reward_goal_unlocked"
  | "customer_recovered";

export interface RecentActivityItem {
  id: string;
  type: RecentActivityType;
  title: string;
  subtitle: string | null;
  occurredAt: string;
}

export interface DashboardNextStep {
  id: string;
  title: string;
  description: string;
  ctaHref: string;
  ctaLabel: string;
}

export type RetentionSignalStatus = "LEARNING" | "SIGNAL" | "NO_DIFFERENCE";

export interface DashboardRetentionSignal {
  atRisk: number;
  contacted: number;
  returned: number;
  status: RetentionSignalStatus;
  hasExperiment: boolean;
}

export interface DashboardRewardGoalsSignal {
  inProgress: number;
  unlockedInPeriod: number;
  redeemedInPeriod: number;
}

export interface DashboardOverview {
  period: { days: PeriodDays; from: string; to: string };
  experienceVersion: ExperienceVersion;
  objective: DashboardObjective;
  rating: DashboardRating;
  activeCustomers: DashboardActiveCustomers | null;
  qrActivity: DashboardQrActivity;
  performance: DashboardPerformance;
  recentActivity: RecentActivityItem[];
  nextSteps: DashboardNextStep[];
  retentionSignal: DashboardRetentionSignal | null;
  rewardGoalsSignal: DashboardRewardGoalsSignal | null;
}
