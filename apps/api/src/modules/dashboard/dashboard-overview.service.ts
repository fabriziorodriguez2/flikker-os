import { Injectable } from '@nestjs/common';
import { ExperienceVersion, RewardGoalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isCheckinV2 } from '../../common/experience/experience.util';
import { MetricsService } from '../metrics/metrics.service';
import { ReviewsRepository } from '../reviews/reviews.repository';
import { RetentionSettingsService } from '../retention-v2/retention-settings.service';
import { RetentionResultsOverviewService } from '../retention-v2/retention-results-overview.service';
import {
  computeChange,
  dayKeysBetween,
  dayKeyOf,
  parsePeriodDays,
  resolvePeriod,
  type DashboardPeriod,
} from './dashboard-period';
import { computeNextSteps, type NextStep } from './dashboard-next-steps';

const RECENT_ACTIVITY_LIMIT = 10;

export interface DashboardOverviewQuery {
  period?: string;
}

@Injectable()
export class DashboardOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly reviews: ReviewsRepository,
    private readonly retentionSettings: RetentionSettingsService,
    private readonly retentionOverview: RetentionResultsOverviewService,
  ) {}

  async getOverview(businessId: string, query: DashboardOverviewQuery) {
    const periodDays = parsePeriodDays(query.period);
    const period = resolvePeriod(periodDays);

    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: {
        experienceVersion: true,
        retentionEngineV2Enabled: true,
        timezone: true,
      },
    });
    const checkinV2 = isCheckinV2(business);
    const experienceVersion: ExperienceVersion = checkinV2
      ? ExperienceVersion.CHECKIN_V2
      : ExperienceVersion.LEGACY;
    const retentionEnabled = checkinV2 && !!business?.retentionEngineV2Enabled;

    const [
      objectiveCard,
      ratingCard,
      activeCustomersCard,
      qrActivityCard,
      performance,
      recentActivity,
      nextStepsFacts,
      retentionSignal,
      rewardGoalsSignal,
    ] = await Promise.all([
      this.buildObjectiveCard(businessId),
      this.buildRatingCard(businessId, period),
      checkinV2 ? this.buildActiveCustomersCard(businessId, period) : null,
      this.buildQrActivityCard(businessId, period, checkinV2),
      this.buildPerformance(businessId, period, checkinV2),
      this.buildRecentActivity(businessId, checkinV2, retentionEnabled),
      this.gatherNextStepsFacts(businessId, checkinV2, retentionEnabled),
      retentionEnabled ? this.buildRetentionSignal(businessId, period) : null,
      this.buildRewardGoalsSignal(businessId, period),
    ]);

    const nextSteps: NextStep[] = computeNextSteps({
      experienceVersion,
      retentionEngineEnabled: retentionEnabled,
      retentionDryRunEnabled: nextStepsFacts.dryRunEnabled,
      hasRetentionExperiment: nextStepsFacts.hasRetentionExperiment,
      rewardGoalsEnabled: nextStepsFacts.rewardGoalsEnabled,
      hasAnyBenefit: nextStepsFacts.hasAnyBenefit,
      hasAuthorizedBenefit: nextStepsFacts.hasAuthorizedBenefit,
      hasActiveVisitSource: nextStepsFacts.hasActiveVisitSource,
      reviewsTotal: ratingCard.totalReviews,
      reviewsInPeriod: ratingCard.newInPeriod,
    });

    return {
      period: {
        days: period.days,
        from: period.from.toISOString(),
        to: period.to.toISOString(),
      },
      experienceVersion,
      objective: objectiveCard,
      rating: ratingCard,
      activeCustomers: activeCustomersCard,
      qrActivity: qrActivityCard,
      performance,
      recentActivity,
      nextSteps,
      retentionSignal,
      rewardGoalsSignal,
    };
  }

  // ── Card A — Objetivo de reseñas ──────────────────────────────────────────
  // Reutiliza tal cual la misma lógica de meta que ya usa /metrics/panel — no
  // es período-dependiente (una meta corre desde que se creó, no "últimos N
  // días"), así que no toma el selector de período.
  private async buildObjectiveCard(businessId: string) {
    const panel = await this.metrics.getPanelStats(businessId);
    return {
      goal: panel.goalView,
      currentPlan: panel.currentPlan,
    };
  }

  // ── Card B — Calificación promedio ────────────────────────────────────────
  private async buildRatingCard(businessId: string, period: DashboardPeriod) {
    const [
      stats,
      reviewsInPeriod,
      reviewsInPreviousPeriod,
      currentAvg,
      previousAvg,
    ] = await Promise.all([
      this.reviews.getGoogleStats(businessId),
      this.metrics.countGoogleReviews(businessId, period.from, period.to),
      this.metrics.countGoogleReviews(
        businessId,
        period.previousFrom,
        period.previousTo,
      ),
      this.prisma.googleReview.aggregate({
        where: { businessId, postedAt: { gte: period.from, lt: period.to } },
        _avg: { stars: true },
      }),
      this.prisma.googleReview.aggregate({
        where: {
          businessId,
          postedAt: { gte: period.previousFrom, lt: period.previousTo },
        },
        _avg: { stars: true },
      }),
    ]);

    const currentPeriodAvg = currentAvg._avg.stars;
    const previousPeriodAvg = previousAvg._avg.stars;
    const ratingDelta =
      currentPeriodAvg != null && previousPeriodAvg != null
        ? Math.round((currentPeriodAvg - previousPeriodAvg) * 10) / 10
        : null;

    return {
      current: stats.total > 0 ? stats.avgStars : null,
      totalReviews: stats.total,
      newInPeriod: reviewsInPeriod,
      newInPreviousPeriod: reviewsInPreviousPeriod,
      change: computeChange(reviewsInPeriod, reviewsInPreviousPeriod),
      ratingDelta,
    };
  }

  // ── Card C — Clientes activos (solo Check-in V2: requiere Visit) ─────────
  private async buildActiveCustomersCard(
    businessId: string,
    period: DashboardPeriod,
  ) {
    const [currentRows, previousRows] = await Promise.all([
      this.prisma.visit.groupBy({
        by: ['customerId'],
        where: { businessId, occurredAt: { gte: period.from, lt: period.to } },
      }),
      this.prisma.visit.groupBy({
        by: ['customerId'],
        where: {
          businessId,
          occurredAt: { gte: period.previousFrom, lt: period.previousTo },
        },
      }),
    ]);

    // Tendencia diaria — clientes ÚNICOS por día (no visitas), calculada acá
    // porque no hay una query de Prisma que dé "distinct por día" directo.
    const dailyRows = await this.prisma.visit.findMany({
      where: { businessId, occurredAt: { gte: period.from, lt: period.to } },
      select: { occurredAt: true, customerId: true },
    });
    const byDay = new Map<string, Set<string>>();
    for (const row of dailyRows) {
      const key = dayKeyOf(row.occurredAt);
      if (!byDay.has(key)) byDay.set(key, new Set());
      byDay.get(key)!.add(row.customerId);
    }
    const trend = dayKeysBetween(period.from, period.to).map(
      (key) => byDay.get(key)?.size ?? 0,
    );

    return {
      available: true as const,
      current: currentRows.length,
      previous: previousRows.length,
      change: computeChange(currentRows.length, previousRows.length),
      trend,
    };
  }

  // ── Card D — Actividad QR (label real según experiencia) ─────────────────
  private async buildQrActivityCard(
    businessId: string,
    period: DashboardPeriod,
    checkinV2: boolean,
  ) {
    if (checkinV2) {
      // No hay historial de "escaneos" con fecha (VisitSource.scannedCount es
      // un contador acumulado, sin timestamp) — el check-in ES el evento con
      // fecha real más cercano a "un escaneo que importó".
      const [current, previous, dailyRows] = await Promise.all([
        this.prisma.visit.count({
          where: {
            businessId,
            occurredAt: { gte: period.from, lt: period.to },
          },
        }),
        this.prisma.visit.count({
          where: {
            businessId,
            occurredAt: { gte: period.previousFrom, lt: period.previousTo },
          },
        }),
        this.prisma.visit.findMany({
          where: {
            businessId,
            occurredAt: { gte: period.from, lt: period.to },
          },
          select: { occurredAt: true },
        }),
      ]);
      return {
        label: 'Check-ins',
        current,
        previous,
        change: computeChange(current, previous),
        trend: bucketByDay(
          dailyRows.map((r) => r.occurredAt),
          period,
        ),
      };
    }

    // LEGACY: ScanEvent sí tiene timestamp real por evento.
    const [current, previous, dailyRows] = await Promise.all([
      this.prisma.scanEvent.count({
        where: { businessId, scannedAt: { gte: period.from, lt: period.to } },
      }),
      this.prisma.scanEvent.count({
        where: {
          businessId,
          scannedAt: { gte: period.previousFrom, lt: period.previousTo },
        },
      }),
      this.prisma.scanEvent.findMany({
        where: { businessId, scannedAt: { gte: period.from, lt: period.to } },
        select: { scannedAt: true },
      }),
    ]);
    return {
      label: 'Escaneos QR',
      current,
      previous,
      change: computeChange(current, previous),
      trend: bucketByDay(
        dailyRows.map((r) => r.scannedAt),
        period,
      ),
    };
  }

  // ── Rendimiento — mini KPIs + serie diaria ────────────────────────────────
  private async buildPerformance(
    businessId: string,
    period: DashboardPeriod,
    checkinV2: boolean,
  ) {
    const days = dayKeysBetween(period.from, period.to);

    if (checkinV2) {
      const [visits, reviews, newCustomers] = await Promise.all([
        this.prisma.visit.findMany({
          where: {
            businessId,
            occurredAt: { gte: period.from, lt: period.to },
          },
          select: { occurredAt: true, isReturn: true },
        }),
        this.prisma.googleReview.findMany({
          where: { businessId, postedAt: { gte: period.from, lt: period.to } },
          select: { postedAt: true },
        }),
        this.prisma.customer.findMany({
          where: { businessId, createdAt: { gte: period.from, lt: period.to } },
          select: { createdAt: true },
        }),
      ]);

      const checkins = bucketByDay(
        visits.map((v) => v.occurredAt),
        period,
      );
      const returning = bucketByDay(
        visits.filter((v) => v.isReturn).map((v) => v.occurredAt),
        period,
      );
      const reviewsSeries = bucketByDay(
        reviews.map((r) => r.postedAt),
        period,
      );
      const newCustomersSeries = bucketByDay(
        newCustomers.map((c) => c.createdAt),
        period,
      );

      return {
        kpis: [
          { key: 'checkins', label: 'Check-ins', current: sum(checkins) },
          { key: 'reviews', label: 'Reseñas', current: sum(reviewsSeries) },
          {
            key: 'newCustomers',
            label: 'Clientes nuevos',
            current: sum(newCustomersSeries),
          },
          { key: 'returning', label: 'Recurrentes', current: sum(returning) },
        ],
        series: days.map((date, i) => ({
          date,
          checkins: checkins[i],
          reviews: reviewsSeries[i],
          newCustomers: newCustomersSeries[i],
          returning: returning[i],
        })),
      };
    }

    const [scans, reviews, newCustomers, messages] = await Promise.all([
      this.prisma.scanEvent.findMany({
        where: { businessId, scannedAt: { gte: period.from, lt: period.to } },
        select: { scannedAt: true },
      }),
      this.prisma.googleReview.findMany({
        where: { businessId, postedAt: { gte: period.from, lt: period.to } },
        select: { postedAt: true },
      }),
      this.prisma.customer.findMany({
        where: { businessId, createdAt: { gte: period.from, lt: period.to } },
        select: { createdAt: true },
      }),
      this.prisma.message.findMany({
        where: { businessId, sentAt: { gte: period.from, lt: period.to } },
        select: { sentAt: true },
      }),
    ]);

    const scansSeries = bucketByDay(
      scans.map((s) => s.scannedAt),
      period,
    );
    const reviewsSeries = bucketByDay(
      reviews.map((r) => r.postedAt),
      period,
    );
    const newCustomersSeries = bucketByDay(
      newCustomers.map((c) => c.createdAt),
      period,
    );
    const messagesSeries = bucketByDay(
      messages.filter((m) => m.sentAt).map((m) => m.sentAt as Date),
      period,
    );

    return {
      kpis: [
        { key: 'scans', label: 'Escaneos', current: sum(scansSeries) },
        { key: 'reviews', label: 'Reseñas', current: sum(reviewsSeries) },
        {
          key: 'newCustomers',
          label: 'Clientes nuevos',
          current: sum(newCustomersSeries),
        },
        {
          key: 'messages',
          label: 'Mensajes enviados',
          current: sum(messagesSeries),
        },
      ],
      series: days.map((date, i) => ({
        date,
        scans: scansSeries[i],
        reviews: reviewsSeries[i],
        newCustomers: newCustomersSeries[i],
        messages: messagesSeries[i],
      })),
    };
  }

  // ── Actividad reciente ─────────────────────────────────────────────────────
  private async buildRecentActivity(
    businessId: string,
    checkinV2: boolean,
    retentionEnabled: boolean,
  ) {
    const take = RECENT_ACTIVITY_LIMIT;

    const [
      reviews,
      benefitRedemptions,
      campaignExecutions,
      visits,
      visitSources,
      rewardGoalUnlocks,
      recoveries,
    ] = await Promise.all([
      this.prisma.googleReview.findMany({
        where: { businessId },
        orderBy: { postedAt: 'desc' },
        take,
        select: { id: true, postedAt: true, reviewerName: true, stars: true },
      }),
      this.prisma.benefitParticipation.findMany({
        where: { businessId, redeemedAt: { not: null } },
        orderBy: { redeemedAt: 'desc' },
        take,
        select: {
          id: true,
          redeemedAt: true,
          benefit: { select: { title: true } },
          customer: { select: { name: true } },
        },
      }),
      this.prisma.campaignExecution.findMany({
        where: { businessId, sentAt: { not: null } },
        orderBy: { sentAt: 'desc' },
        take: take * 2,
        select: {
          id: true,
          sentAt: true,
          campaign: { select: { id: true, name: true } },
        },
      }),
      checkinV2
        ? this.prisma.visit.findMany({
            where: { businessId },
            orderBy: { occurredAt: 'desc' },
            take,
            select: {
              id: true,
              occurredAt: true,
              isReturn: true,
              customer: { select: { name: true } },
            },
          })
        : Promise.resolve(
            [] as {
              id: string;
              occurredAt: Date;
              isReturn: boolean;
              customer: { name: string } | null;
            }[],
          ),
      checkinV2
        ? this.prisma.visitSource.findMany({
            where: { businessId },
            orderBy: { createdAt: 'desc' },
            take: 3,
            select: { id: true, createdAt: true, name: true },
          })
        : Promise.resolve(
            [] as { id: string; createdAt: Date; name: string }[],
          ),
      this.prisma.customerRewardGoal.findMany({
        where: { businessId, unlockedAt: { not: null } },
        orderBy: { unlockedAt: 'desc' },
        take,
        select: {
          id: true,
          unlockedAt: true,
          customer: { select: { name: true } },
          incentiveDefinition: { select: { name: true } },
        },
      }),
      retentionEnabled
        ? this.prisma.retentionOutcome.findMany({
            where: { businessId, returned: true, returnedAt: { not: null } },
            orderBy: { returnedAt: 'desc' },
            take,
            select: {
              id: true,
              returnedAt: true,
              customer: { select: { name: true } },
            },
          })
        : Promise.resolve(
            [] as {
              id: string;
              returnedAt: Date | null;
              customer: { name: string } | null;
            }[],
          ),
    ]);

    // Campañas: se agrupan por campaña (varios envíos individuales = un solo
    // evento "Campaña X enviada · N mensajes"), usando el envío más reciente
    // como fecha del evento.
    const campaignGroups = new Map<
      string,
      { name: string; count: number; latest: Date }
    >();
    for (const exec of campaignExecutions) {
      if (!exec.sentAt) continue;
      const existing = campaignGroups.get(exec.campaign.id);
      if (existing) {
        existing.count += 1;
        if (exec.sentAt > existing.latest) existing.latest = exec.sentAt;
      } else {
        campaignGroups.set(exec.campaign.id, {
          name: exec.campaign.name,
          count: 1,
          latest: exec.sentAt,
        });
      }
    }

    type Item = {
      id: string;
      type: string;
      title: string;
      subtitle: string | null;
      occurredAt: Date;
    };
    const items: Item[] = [
      ...reviews.map((r) => ({
        id: `review-${r.id}`,
        type: 'review',
        title: `Nueva reseña de ${r.reviewerName ?? 'un cliente'}`,
        subtitle: '★'.repeat(r.stars) + '☆'.repeat(5 - r.stars),
        occurredAt: r.postedAt,
      })),
      ...benefitRedemptions.map((p) => ({
        id: `redemption-${p.id}`,
        type: 'benefit_redeemed',
        title: `Beneficio "${p.benefit.title}" usado`,
        subtitle: p.customer?.name ?? null,
        occurredAt: p.redeemedAt as Date,
      })),
      ...visits.map((v) => ({
        id: `visit-${v.id}`,
        type: 'visit',
        title: v.isReturn
          ? 'Check-in de cliente recurrente'
          : 'Nuevo check-in registrado',
        subtitle: v.customer?.name ?? null,
        occurredAt: v.occurredAt,
      })),
      ...visitSources.map((s) => ({
        id: `source-${s.id}`,
        type: 'visit_source_created',
        title: 'Nueva fuente QR agregada',
        subtitle: s.name,
        occurredAt: s.createdAt,
      })),
      ...[...campaignGroups.values()].map((g, i) => ({
        id: `campaign-${i}`,
        type: 'campaign_sent',
        title: `Campaña "${g.name}" enviada`,
        subtitle: `${g.count} ${g.count === 1 ? 'mensaje' : 'mensajes'}`,
        occurredAt: g.latest,
      })),
      ...rewardGoalUnlocks.map((g) => ({
        id: `reward-goal-${g.id}`,
        type: 'reward_goal_unlocked',
        title: 'Recompensa desbloqueada',
        subtitle: [g.customer?.name, g.incentiveDefinition?.name]
          .filter(Boolean)
          .join(' — '),
        occurredAt: g.unlockedAt as Date,
      })),
      ...recoveries.map((r) => ({
        id: `recovered-${r.id}`,
        type: 'customer_recovered',
        title: 'Cliente recuperado',
        subtitle: r.customer?.name ?? null,
        occurredAt: r.returnedAt as Date,
      })),
    ];

    return items
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, RECENT_ACTIVITY_LIMIT)
      .map((item) => ({ ...item, occurredAt: item.occurredAt.toISOString() }));
  }

  // ── Insumos para "próximos pasos" ─────────────────────────────────────────
  private async gatherNextStepsFacts(
    businessId: string,
    checkinV2: boolean,
    retentionEnabled: boolean,
  ) {
    const [
      settings,
      hasAnyBenefit,
      hasAuthorizedBenefit,
      hasActiveVisitSource,
      hasRetentionExperiment,
    ] = await Promise.all([
      this.retentionSettings.getOrCreate(businessId),
      this.prisma.benefit.count({ where: { businessId } }),
      this.prisma.retentionIncentiveDefinition.count({
        where: {
          businessId,
          OR: [{ automationEligible: true }, { rewardGoalEligible: true }],
        },
      }),
      checkinV2
        ? this.prisma.visitSource.count({
            where: { businessId, isActive: true },
          })
        : Promise.resolve(0),
      checkinV2
        ? this.prisma.retentionExperiment.count({ where: { businessId } })
        : Promise.resolve(0),
    ]);

    return {
      dryRunEnabled: settings.dryRunEnabled,
      rewardGoalsEnabled: settings.rewardGoalsEnabled,
      hasAnyBenefit: hasAnyBenefit > 0,
      hasAuthorizedBenefit: hasAuthorizedBenefit > 0,
      hasActiveVisitSource: hasActiveVisitSource > 0,
      hasRetentionExperiment: retentionEnabled && hasRetentionExperiment > 0,
    };
  }

  // ── Señal simple de Retención V2 ───────────────────────────────────────────
  private async buildRetentionSignal(
    businessId: string,
    period: DashboardPeriod,
  ) {
    const [atRisk, contacted, returned, overviews] = await Promise.all([
      this.prisma.retentionAssignment.count({
        where: { businessId, assignedAt: { gte: period.from, lt: period.to } },
      }),
      this.prisma.retentionAssignment.count({
        where: {
          businessId,
          status: 'SENT',
          sentAt: { gte: period.from, lt: period.to },
        },
      }),
      this.prisma.retentionOutcome.count({
        where: {
          businessId,
          returned: true,
          returnedAt: { gte: period.from, lt: period.to },
        },
      }),
      this.retentionOverview.forBusiness(businessId),
    ]);

    // El experimento más reciente es la señal "primaria" a mostrar — mismo
    // criterio que ya usa PilotSummarySection en el frontend (overviews[0]).
    const primary = overviews[0] ?? null;
    let status: 'LEARNING' | 'SIGNAL' | 'NO_DIFFERENCE' = 'LEARNING';
    if (primary && primary.winner.kind !== 'NO_CONCLUSION') {
      status =
        (primary.upliftBestVariant ?? 0) > 0 ? 'SIGNAL' : 'NO_DIFFERENCE';
    }

    return { atRisk, contacted, returned, status, hasExperiment: !!primary };
  }

  // ── Señal simple de Reward Goals ───────────────────────────────────────────
  private async buildRewardGoalsSignal(
    businessId: string,
    period: DashboardPeriod,
  ) {
    const settings = await this.retentionSettings.getOrCreate(businessId);
    if (!settings.rewardGoalsEnabled) return null;

    const [inProgress, unlockedInPeriod, redeemedInPeriod] = await Promise.all([
      this.prisma.customerRewardGoal.count({
        where: { businessId, status: RewardGoalStatus.ACTIVE },
      }),
      this.prisma.customerRewardGoal.count({
        where: {
          businessId,
          unlockedAt: { gte: period.from, lt: period.to },
        },
      }),
      this.prisma.customerRewardGoal.count({
        where: {
          businessId,
          redeemedAt: { gte: period.from, lt: period.to },
        },
      }),
    ]);

    return { inProgress, unlockedInPeriod, redeemedInPeriod };
  }
}

/** Cuenta cuántas `dates` caen en cada día del período, en orden. */
function bucketByDay(dates: Date[], period: DashboardPeriod): number[] {
  const keys = dayKeysBetween(period.from, period.to);
  const counts = new Map<string, number>();
  for (const date of dates) {
    const key = dayKeyOf(date);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return keys.map((key) => counts.get(key) ?? 0);
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}
