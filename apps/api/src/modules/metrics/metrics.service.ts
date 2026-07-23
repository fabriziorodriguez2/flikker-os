import { Injectable, Logger } from '@nestjs/common';
import { CampaignExecutionStatus, MessageStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

interface KpiMetric {
  current: number;
  previous: number;
  delta: number;
}

interface MonthlyReviewTotal {
  month: string;
  label: string;
  total: number;
}

interface MonthlyActivityTotal {
  month: string;
  label: string;
  messagesSent: number;
  reviewsGenerated: number;
  reactivatedCustomers: number;
}

type ActivityGranularity = 'day' | 'week' | 'month';

interface MetricsOverviewOptions {
  granularity?: string;
  from?: string;
  to?: string;
}

interface ActivityWindow {
  start: Date;
  end: Date;
  label: string;
}

interface NegativeFeedbackItem {
  id: string;
  createdAt: string;
  customerName: string;
  customerPhone: string | null;
  score: number;
  comment: string | null;
  acknowledgedByOwner: boolean;
}

export interface MetricsOverview {
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
  reviewsByMonth: MonthlyReviewTotal[];
  activityByMonth: MonthlyActivityTotal[];
  activityRange: {
    granularity: ActivityGranularity;
    from: string;
    to: string;
  };
  messageQuota: {
    used: number;
    limit: number;
    percentage: number;
  };
  negativeFeedback: NegativeFeedbackItem[];
}

// ── Conversion interfaces ──────────────────────────────────────────────────

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
}

export interface ConversionSummary {
  range: string;
  from: string | null;
  to: string;
  attributionWindowDays: number;
  sentMessages: number;
  attributedReviews: number;
  conversionRate: number | null;
  insufficientData: boolean;
  clickedMessages: number;
  clickRate: number | null;
  positiveFeedback: number;
  positiveFeedbackRate: number | null;
  medianTimeToReviewHours: number | null;
  messagesNotSent: { queued: number; failed: number };
  benchmark: null;
}

export interface ConversionFunnel {
  attributionWindowDays: number;
  steps: FunnelStep[];
  topDropOffStep: { step: string; ratio: number } | null;
}

export interface ConversionTimeSeries {
  granularity: string;
  attributionWindowDays: number;
  series: Array<{
    label: string;
    start: string;
    sent: number;
    attributed: number;
    rate: number | null;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────

const GOOGLE_REVIEW_LIMIT = 100;
const NEGATIVE_FEEDBACK_LIMIT = 10;
const CONVERSION_MIN_SAMPLE = 30;

const SENT_STATUSES: MessageStatus[] = [
  MessageStatus.sent,
  MessageStatus.delivered,
  MessageStatus.read,
];

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getOverview(
    businessId: string,
    options: MetricsOverviewOptions = {},
  ): Promise<MetricsOverview> {
    const now = new Date();
    const currentStart = startOfMonth(now);
    const currentEnd = addMonths(currentStart, 1);
    const previousStart = addMonths(currentStart, -1);
    const previousEnd = currentStart;
    const chartMonths = buildMonthWindows(currentStart, 6);
    const activityWindows = buildActivityWindows(now, options);

    const [
      currentReviews,
      previousReviews,
      currentRatingReviews,
      previousRatingReviews,
      currentReactivatedCustomers,
      previousReactivatedCustomers,
      monthlyReviewCounts,
      monthlyActivityCounts,
      negativeFeedback,
      businessQuota,
    ] = await Promise.all([
      this.countGoogleReviews(businessId, currentStart, currentEnd),
      this.countGoogleReviews(businessId, previousStart, previousEnd),
      this.findRatingSample(businessId),
      this.findRatingSample(businessId, undefined, currentStart),
      this.countReactivatedCustomers(businessId, currentStart, currentEnd),
      this.countReactivatedCustomers(businessId, previousStart, previousEnd),
      Promise.all(
        chartMonths.map(({ start, end }) =>
          this.countGoogleReviews(businessId, start, end),
        ),
      ),
      Promise.all(
        activityWindows.windows.map(async ({ start, end }) => {
          const [messagesSent, reviewsGenerated, reactivatedCustomers] =
            await Promise.all([
              this.countMessagesSent(businessId, start, end),
              this.countGoogleReviews(businessId, start, end),
              this.countReactivatedCustomersByExecutionDate(
                businessId,
                start,
                end,
              ),
            ]);

          return {
            messagesSent,
            reviewsGenerated,
            reactivatedCustomers,
          };
        }),
      ),
      this.prisma.feedbackResponse.findMany({
        where: {
          businessId,
          score: { lt: 4 },
        },
        orderBy: { createdAt: 'desc' },
        take: NEGATIVE_FEEDBACK_LIMIT,
        select: {
          id: true,
          createdAt: true,
          score: true,
          comment: true,
          acknowledgedByOwner: true,
          customer: {
            select: {
              name: true,
              phoneE164: true,
            },
          },
        },
      }),
      this.prisma.business.findUnique({
        where: { id: businessId },
        select: {
          messageCountCurrentMonth: true,
          messageQuotaMonthly: true,
        },
      }),
    ]);

    const quotaUsed = businessQuota?.messageCountCurrentMonth ?? 0;
    const quotaLimit = businessQuota?.messageQuotaMonthly ?? 0;

    return {
      month: {
        currentStart: currentStart.toISOString(),
        currentEnd: currentEnd.toISOString(),
        previousStart: previousStart.toISOString(),
        previousEnd: previousEnd.toISOString(),
      },
      kpis: {
        reviewsGenerated: buildKpi(currentReviews, previousReviews),
        averageRating: buildKpi(
          averageRating(currentRatingReviews),
          averageRating(previousRatingReviews),
        ),
        reactivatedCustomers: buildKpi(
          currentReactivatedCustomers,
          previousReactivatedCustomers,
        ),
      },
      reviewsByMonth: chartMonths.map((month, index) => ({
        month: month.start.toISOString(),
        label: formatMonthLabel(month.start),
        total: monthlyReviewCounts[index] ?? 0,
      })),
      activityByMonth: activityWindows.windows.map((window, index) => ({
        month: window.start.toISOString(),
        label: window.label,
        messagesSent: monthlyActivityCounts[index]?.messagesSent ?? 0,
        reviewsGenerated: monthlyActivityCounts[index]?.reviewsGenerated ?? 0,
        reactivatedCustomers:
          monthlyActivityCounts[index]?.reactivatedCustomers ?? 0,
      })),
      activityRange: {
        granularity: activityWindows.granularity,
        from: activityWindows.from.toISOString(),
        to: activityWindows.to.toISOString(),
      },
      messageQuota: {
        used: quotaUsed,
        limit: quotaLimit,
        percentage:
          quotaLimit > 0 ? Math.round((quotaUsed / quotaLimit) * 100) : 0,
      },
      negativeFeedback: negativeFeedback.map((item) => ({
        id: item.id,
        createdAt: item.createdAt.toISOString(),
        customerName: item.customer.name,
        customerPhone: item.customer.phoneE164 ?? null,
        score: item.score,
        comment: item.comment,
        acknowledgedByOwner: item.acknowledgedByOwner,
      })),
    };
  }

  // ── Conversion metrics ─────────────────────────────────────────────────────

  async getConversionSummary(
    businessId: string,
    range: string = 'last_30_days',
    attributionWindowDays: number = 7,
  ): Promise<ConversionSummary> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - attributionWindowDays * 86_400_000);
    const from = buildRangeFrom(range, now);
    const baseWhere = this.sentMessageWhere(businessId, from, cutoff);
    const notSentBase = {
      businessId,
      createdAt: { lt: cutoff, ...(from ? { gte: from } : {}) },
    };

    const [
      sentMessages,
      attributedReviews,
      clickedMessages,
      positiveFeedback,
      queuedMessages,
      failedMessages,
      medianTimeToReviewHours,
    ] = await Promise.all([
      this.prisma.message.count({ where: baseWhere }),
      this.prisma.message.count({
        where: { ...baseWhere, attributedGoogleReviews: { some: {} } },
      }),
      this.prisma.message.count({
        where: { ...baseWhere, clickedAt: { not: null } },
      }),
      this.prisma.message.count({
        where: {
          ...baseWhere,
          feedbackResponses: { some: { score: { gte: 4 } } },
        },
      }),
      this.prisma.message.count({
        where: { ...notSentBase, status: MessageStatus.queued },
      }),
      this.prisma.message.count({
        where: { ...notSentBase, status: MessageStatus.failed },
      }),
      this.getMedianTimeToReviewHours(businessId, from, cutoff),
    ]);

    const insufficientData = sentMessages < CONVERSION_MIN_SAMPLE;

    return {
      range: normalizeRange(range),
      from: from?.toISOString() ?? null,
      to: cutoff.toISOString(),
      attributionWindowDays,
      sentMessages,
      attributedReviews,
      conversionRate: insufficientData
        ? null
        : roundRate(attributedReviews, sentMessages),
      insufficientData,
      clickedMessages,
      clickRate: roundRate(clickedMessages, sentMessages),
      positiveFeedback,
      positiveFeedbackRate: roundRate(positiveFeedback, sentMessages),
      medianTimeToReviewHours,
      messagesNotSent: { queued: queuedMessages, failed: failedMessages },
      benchmark: null,
    };
  }

  async getConversionFunnel(
    businessId: string,
    attributionWindowDays: number = 7,
    origin?: string,
  ): Promise<ConversionFunnel> {
    const cutoff = new Date(Date.now() - attributionWindowDays * 86_400_000);
    const baseWhere = this.sentMessageWhere(businessId, null, cutoff, origin);

    const [
      sent,
      clicked,
      positiveFeedback,
      negativeFeedback,
      reviewDetected,
      scanned,
    ] = await Promise.all([
      this.prisma.message.count({ where: baseWhere }),
      this.prisma.message.count({
        where: { ...baseWhere, clickedAt: { not: null } },
      }),
      this.prisma.message.count({
        where: {
          ...baseWhere,
          feedbackResponses: { some: { score: { gte: 4 } } },
        },
      }),
      this.prisma.message.count({
        where: {
          ...baseWhere,
          feedbackResponses: { some: { score: { lt: 4 } } },
        },
      }),
      this.prisma.message.count({
        where: { ...baseWhere, attributedGoogleReviews: { some: {} } },
      }),
      origin === 'qr' ? this.countQrScans(businessId) : Promise.resolve(null),
    ]);

    const steps: FunnelStep[] = [];
    // Scanning is the QR-only entry point of the funnel — a scan doesn't need
    // to "wait" like a review does, so it's counted all-time, no cutoff.
    if (scanned !== null) {
      steps.push({ key: 'scanned', label: 'Escanearon el QR', count: scanned });
    }
    steps.push(
      { key: 'sent', label: 'Mensajes enviados', count: sent },
      { key: 'clicked', label: 'Abrieron el link', count: clicked },
      {
        key: 'positive_feedback',
        label: 'Dieron 4-5 estrellas',
        count: positiveFeedback,
      },
      {
        key: 'negative_feedback_filtered',
        label: 'Filtrados antes de Google (feedback negativo)',
        count: negativeFeedback,
      },
      {
        key: 'review_detected',
        label: 'Dejaron reseña en Google',
        count: reviewDetected,
      },
    );

    return {
      attributionWindowDays,
      steps,
      topDropOffStep: computeTopDropOffStep(
        sent,
        clicked,
        positiveFeedback,
        reviewDetected,
      ),
    };
  }

  /**
   * Scans of the business's QR capture campaign (the one behind /dashboard/qr
   * and the public /qr/:businessId landing) — all-time, not cutoff-bound.
   * Other campaign channels (QR_TABLE, QR_COUNTER, etc.) also produce
   * ScanEvent rows, so this must be scoped to the specific campaign, not just
   * the business.
   */
  private async countQrScans(businessId: string): Promise<number> {
    const campaign = await this.prisma.campaign.findFirst({
      where: { businessId, status: 'ACTIVE', templateKind: 'qr_capture' },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!campaign) return 0;

    return this.prisma.scanEvent.count({
      where: { businessId, campaignId: campaign.id },
    });
  }

  async getConversionTimeSeries(
    businessId: string,
    granularity: string = 'month',
    attributionWindowDays: number = 7,
  ): Promise<ConversionTimeSeries> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - attributionWindowDays * 86_400_000);
    const gran = granularity === 'week' ? 'week' : 'month';

    const windowFrom =
      gran === 'month'
        ? addMonths(startOfMonth(now), -5)
        : addWeeks(startOfWeek(now), -7);
    const windowTo =
      gran === 'month'
        ? addMonths(startOfMonth(now), 1)
        : addWeeks(startOfWeek(now), 1);
    const windows = buildWindows(windowFrom, windowTo, gran);

    const series = await Promise.all(
      windows.map(async ({ start, end, label }) => {
        // Skip windows entirely within the attribution window — no data yet
        if (start >= cutoff) {
          return {
            label,
            start: start.toISOString(),
            sent: 0,
            attributed: 0,
            rate: null,
          };
        }
        const effectiveEnd = end > cutoff ? cutoff : end;
        const baseWhere = this.sentMessageWhere(
          businessId,
          start,
          effectiveEnd,
        );

        const [sent, attributed] = await Promise.all([
          this.prisma.message.count({ where: baseWhere }),
          this.prisma.message.count({
            where: { ...baseWhere, attributedGoogleReviews: { some: {} } },
          }),
        ]);

        return {
          label,
          start: start.toISOString(),
          sent,
          attributed,
          rate:
            sent < CONVERSION_MIN_SAMPLE ? null : roundRate(attributed, sent),
        };
      }),
    );

    return { granularity: gran, attributionWindowDays, series };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private sentMessageWhere(
    businessId: string,
    from: Date | null,
    cutoff: Date,
    origin?: string,
  ) {
    return {
      businessId,
      status: { in: SENT_STATUSES },
      sentAt: {
        lt: cutoff,
        ...(from ? { gte: from } : {}),
      },
      ...(origin ? { customer: { origin } } : {}),
    };
  }

  private async getMedianTimeToReviewHours(
    businessId: string,
    from: Date | null,
    cutoff: Date,
  ): Promise<number | null> {
    const reviews = await this.prisma.googleReview.findMany({
      where: {
        businessId,
        attributedMessageId: { not: null },
        attributedMessage: {
          sentAt: {
            lt: cutoff,
            ...(from ? { gte: from } : {}),
          },
        },
      },
      select: {
        postedAt: true,
        attributedMessage: { select: { sentAt: true } },
      },
    });

    const deltas = reviews
      .filter((r) => r.attributedMessage?.sentAt != null)
      .map(
        (r) =>
          (r.postedAt.getTime() - r.attributedMessage!.sentAt!.getTime()) /
          3_600_000,
      )
      .filter((h) => h >= 0)
      .sort((a, b) => a - b);

    if (!deltas.length) return null;

    const mid = Math.floor(deltas.length / 2);
    const median =
      deltas.length % 2 === 0
        ? (deltas[mid - 1] + deltas[mid]) / 2
        : deltas[mid];

    return Math.round(median * 10) / 10;
  }

  // ──────────────────────────────────────────────────────────────────────────

  async getPanelStats(businessId: string) {
    try {
      return await this._getPanelStats(businessId);
    } catch (error) {
      this.logger.error(
        `[getPanelStats] failed for business ${businessId}: ${error instanceof Error ? error.stack : String(error)}`,
      );
      throw error;
    }
  }

  private async _getPanelStats(businessId: string) {
    const now = new Date();

    // Uruguay is UTC-3: business day starts at 03:00 UTC
    const todayStart = new Date();
    todayStart.setUTCHours(3, 0, 0, 0);
    if (now.getTime() < todayStart.getTime()) {
      todayStart.setUTCDate(todayStart.getUTCDate() - 1);
    }

    // Week start (Monday) in UTC-3
    const weekStart = startOfWeek(todayStart);

    const monthStart = startOfMonth(now);
    const prevMonthStart = addMonths(monthStart, -1);
    const nextMonthStart = addMonths(monthStart, 1);

    const [
      reviewsThisMonth,
      reviewsLastMonth,
      attendedToday,
      attendedThisWeek,
      messagesToday,
      business,
      recentEvents,
      currentPlan,
      activeGoal,
      googleRatingAgg,
      fiveStarThisMonth,
    ] = await Promise.all([
      this.countGoogleReviews(businessId, monthStart, nextMonthStart),
      this.countGoogleReviews(businessId, prevMonthStart, monthStart),
      this.prisma.serviceEvent.count({
        where: { businessId, eventAt: { gte: todayStart } },
      }),
      this.prisma.serviceEvent.count({
        where: { businessId, eventAt: { gte: weekStart } },
      }),
      this.countMessagesSent(businessId, todayStart, now),
      this.prisma.business.findUnique({
        where: { id: businessId },
        select: {
          messageCountCurrentMonth: true,
          messageQuotaMonthly: true,
        },
      }),
      this.prisma.serviceEvent.findMany({
        where: { businessId },
        include: {
          customer: { select: { name: true } },
          messages: {
            select: {
              status: true,
              attributedGoogleReviews: { select: { id: true }, take: 1 },
            },
          },
        },
        orderBy: { eventAt: 'desc' },
        take: 5,
      }),
      this.prisma.businessPlan.findFirst({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        select: {
          plan: true,
          trialGoal: true,
          trialStart: true,
          createdAt: true,
        },
      }),
      this.prisma.businessGoal.findFirst({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        select: {
          type: true,
          target: true,
          deadline: true,
          createdAt: true,
        },
      }),
      this.prisma.googleReview.aggregate({
        where: { businessId },
        _avg: { stars: true },
        _count: { id: true },
      }),
      this.prisma.googleReview.count({
        where: { businessId, stars: 5, postedAt: { gte: monthStart } },
      }),
    ]);

    const reviewsDelta =
      reviewsLastMonth > 0
        ? Math.round(
            ((reviewsThisMonth - reviewsLastMonth) / reviewsLastMonth) * 100,
          )
        : reviewsThisMonth > 0
          ? 100
          : 0;

    const goalView = await this.buildGoalView(
      businessId,
      currentPlan,
      activeGoal,
    );

    // Rating progress toward next decimal milestone
    const rawAvg = googleRatingAgg._avg.stars;
    const ratingTotal = googleRatingAgg._count.id;
    type RatingData = {
      current: number;
      rawAverage: number;
      total: number;
      goal: number;
      reviewsNeeded: number;
      fiveStarThisMonth: number;
    };
    let ratingData: RatingData | null = null;
    if (rawAvg !== null && ratingTotal > 0) {
      const currentTenths = Math.round(rawAvg * 10);
      const current = currentTenths / 10;
      if (current >= 5.0) {
        ratingData = {
          current: 5.0,
          rawAverage: rawAvg,
          total: ratingTotal,
          goal: 5.0,
          reviewsNeeded: 0,
          fiveStarThisMonth,
        };
      } else {
        const goal = (currentTenths + 1) / 10;
        const sumaActual = current * ratingTotal;
        let reviewsNeeded: number;
        if (goal >= 5.0) {
          // Threshold 4.95 avoids division by zero when goal === 5.0
          const thr = 4.95;
          reviewsNeeded = Math.max(
            0,
            Math.ceil((thr * ratingTotal - sumaActual) / (5 - thr)),
          );
        } else {
          reviewsNeeded = Math.max(
            0,
            Math.ceil((goal * ratingTotal - sumaActual) / (5 - goal)),
          );
        }
        ratingData = {
          current,
          rawAverage: rawAvg,
          total: ratingTotal,
          goal,
          reviewsNeeded,
          fiveStarThisMonth,
        };
      }
    }

    return {
      reviews: {
        thisMonth: reviewsThisMonth,
        lastMonth: reviewsLastMonth,
        delta: reviewsDelta,
      },
      attended: {
        today: attendedToday,
        thisWeek: attendedThisWeek,
      },
      messages: {
        today: messagesToday,
        thisMonth: business?.messageCountCurrentMonth ?? 0,
        quotaLimit: business?.messageQuotaMonthly ?? 0,
      },
      currentPlan: currentPlan ? { type: currentPlan.plan } : null,
      goalView,
      rating: ratingData,
      recentAttendances: recentEvents.map((e) => ({
        id: e.id,
        customerName: e.customer?.name ?? 'Cliente',
        eventAt: e.eventAt.toISOString(),
        hasReview: e.messages.some((m) => m.attributedGoogleReviews.length > 0),
        messageSent: e.messages.some(
          (m) => m.status !== 'queued' && m.status !== 'failed',
        ),
      })),
    };
  }

  private async buildGoalView(
    businessId: string,
    plan: {
      plan: 'FREE_TRIAL' | 'BASE' | 'PRO';
      trialGoal: number | null;
      trialStart: Date | null;
      createdAt: Date;
    } | null,
    goal: {
      type: 'REVIEWS' | 'CONTACTS' | 'CAMPAIGN';
      target: number;
      deadline: Date;
      createdAt: Date;
    } | null,
  ) {
    // FREE_TRIAL: progress comes from the plan's trialGoal, REVIEWS type
    if (plan?.plan === 'FREE_TRIAL' && plan.trialGoal && plan.trialGoal > 0) {
      const startedAt = plan.trialStart ?? plan.createdAt;
      const current = await this.prisma.googleReview.count({
        where: { businessId, postedAt: { gte: startedAt } },
      });
      return {
        source: 'trial' as const,
        type: 'REVIEWS' as const,
        target: plan.trialGoal,
        current,
        deadline: null as string | null,
        startedAt: startedAt.toISOString(),
      };
    }

    // BASE / PRO with an active user goal (REVIEWS or CONTACTS)
    if (goal && goal.type !== 'CAMPAIGN') {
      let current = 0;
      if (goal.type === 'REVIEWS') {
        current = await this.prisma.googleReview.count({
          where: { businessId, postedAt: { gte: goal.createdAt } },
        });
      } else {
        current = await this.prisma.customer.count({
          where: {
            businessId,
            origin: 'qr',
            createdAt: { gte: goal.createdAt },
          },
        });
      }
      return {
        source: 'user' as const,
        type: goal.type,
        target: goal.target,
        current,
        deadline: goal.deadline.toISOString(),
        startedAt: goal.createdAt.toISOString(),
      };
    }

    return null;
  }

  async acknowledgeNegativeFeedback(businessId: string, feedbackId: string) {
    const feedback = await this.prisma.feedbackResponse.findFirst({
      where: {
        id: feedbackId,
        businessId,
        score: { lt: 4 },
      },
      select: { id: true },
    });

    if (!feedback) return null;

    return this.prisma.feedbackResponse.update({
      where: { id: feedbackId },
      data: { acknowledgedByOwner: true },
      select: {
        id: true,
        acknowledgedByOwner: true,
      },
    });
  }

  private countGoogleReviews(
    businessId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    return this.prisma.googleReview.count({
      where: {
        businessId,
        postedAt: {
          gte: from,
          lt: to,
        },
      },
    });
  }

  private countMessagesSent(
    businessId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    return this.prisma.message.count({
      where: {
        businessId,
        sentAt: {
          gte: from,
          lt: to,
        },
      },
    });
  }

  private findRatingSample(businessId: string, from?: Date, to?: Date) {
    const postedAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lt: to } : {}),
    };

    return this.prisma.googleReview.findMany({
      where: {
        businessId,
        ...(from || to ? { postedAt } : {}),
      },
      orderBy: { postedAt: 'desc' },
      take: GOOGLE_REVIEW_LIMIT,
      select: {
        stars: true,
      },
    });
  }

  private async countReactivatedCustomers(
    businessId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    const executions = await this.prisma.campaignExecution.findMany({
      where: {
        businessId,
        status: CampaignExecutionStatus.responded,
        respondedAt: {
          gte: from,
          lt: to,
        },
      },
      distinct: ['customerId'],
      select: {
        customerId: true,
      },
    });

    return executions.length;
  }

  private async countReactivatedCustomersByExecutionDate(
    businessId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    const executions = await this.prisma.campaignExecution.findMany({
      where: {
        businessId,
        status: CampaignExecutionStatus.responded,
        executedAt: {
          gte: from,
          lt: to,
        },
      },
      distinct: ['customerId'],
      select: {
        customerId: true,
      },
    });

    return executions.length;
  }
}

function buildKpi(current: number, previous: number): KpiMetric {
  return {
    current,
    previous,
    delta: Number((current - previous).toFixed(1)),
  };
}

function averageRating(reviews: { stars: number }[]): number {
  if (reviews.length === 0) return 0;

  const total = reviews.reduce((sum, review) => sum + review.stars, 0);
  return Number((total / reviews.length).toFixed(1));
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(date: Date, months: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
}

function startOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function startOfWeek(date: Date): Date {
  const day = date.getUTCDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  return addDays(startOfDay(date), -daysFromMonday);
}

function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

function buildMonthWindows(currentStart: Date, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const start = addMonths(currentStart, index - count + 1);
    return {
      start,
      end: addMonths(start, 1),
    };
  });
}

function formatMonthLabel(date: Date): string {
  const labels = [
    'Ene',
    'Feb',
    'Mar',
    'Abr',
    'May',
    'Jun',
    'Jul',
    'Ago',
    'Sep',
    'Oct',
    'Nov',
    'Dic',
  ];
  return labels[date.getUTCMonth()];
}

function formatDayLabel(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${day} ${formatMonthLabel(date)}`;
}

function formatWeekLabel(date: Date): string {
  return `Sem ${formatDayLabel(date)}`;
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeGranularity(value?: string): ActivityGranularity {
  return value === 'day' || value === 'week' || value === 'month'
    ? value
    : 'month';
}

function chooseGranularity(from: Date, to: Date): ActivityGranularity {
  const days = Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
  if (days <= 31) return 'day';
  if (days <= 120) return 'week';
  return 'month';
}

function buildActivityWindows(
  now: Date,
  options: MetricsOverviewOptions,
): {
  windows: ActivityWindow[];
  granularity: ActivityGranularity;
  from: Date;
  to: Date;
} {
  const customFrom = parseDate(options.from);
  const customTo = parseDate(options.to);

  if (customFrom && customTo && customFrom <= customTo) {
    const from = customFrom;
    const to = addDays(customTo, 1);
    const granularity = options.granularity
      ? normalizeGranularity(options.granularity)
      : chooseGranularity(from, to);

    return {
      windows: buildWindows(from, to, granularity),
      granularity,
      from,
      to,
    };
  }

  const granularity = normalizeGranularity(options.granularity);

  if (granularity === 'day') {
    const to = addDays(startOfDay(now), 1);
    const from = addDays(to, -14);
    return {
      windows: buildWindows(from, to, granularity),
      granularity,
      from,
      to,
    };
  }

  if (granularity === 'week') {
    const to = addWeeks(startOfWeek(now), 1);
    const from = addWeeks(to, -8);
    return {
      windows: buildWindows(from, to, granularity),
      granularity,
      from,
      to,
    };
  }

  const currentStart = startOfMonth(now);
  const from = addMonths(currentStart, -5);
  const to = addMonths(currentStart, 1);
  return {
    windows: buildWindows(from, to, granularity),
    granularity,
    from,
    to,
  };
}

function buildWindows(
  from: Date,
  to: Date,
  granularity: ActivityGranularity,
): ActivityWindow[] {
  const windows: ActivityWindow[] = [];
  let cursor =
    granularity === 'month'
      ? startOfMonth(from)
      : granularity === 'week'
        ? startOfWeek(from)
        : startOfDay(from);

  while (cursor < to && windows.length < 36) {
    const next =
      granularity === 'month'
        ? addMonths(cursor, 1)
        : granularity === 'week'
          ? addWeeks(cursor, 1)
          : addDays(cursor, 1);

    windows.push({
      start: cursor,
      end: next > to ? to : next,
      label:
        granularity === 'month'
          ? formatMonthLabel(cursor)
          : granularity === 'week'
            ? formatWeekLabel(cursor)
            : formatDayLabel(cursor),
    });

    cursor = next;
  }

  return windows;
}

// ── Conversion helpers ─────────────────────────────────────────────────────

function buildRangeFrom(range: string, now: Date): Date | null {
  if (range === 'last_30_days')
    return new Date(now.getTime() - 30 * 86_400_000);
  if (range === 'last_90_days')
    return new Date(now.getTime() - 90 * 86_400_000);
  return null; // all_time
}

function normalizeRange(range: string): string {
  return range === 'last_30_days' ||
    range === 'last_90_days' ||
    range === 'all_time'
    ? range
    : 'last_30_days';
}

/**
 * Returns rate as a percentage with 1 decimal place, or null if denominator is 0.
 */
function roundRate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/**
 * Returns the funnel transition with the lowest N→N+1 ratio (worst drop-off).
 * negative_feedback_filtered is a branch, not a sequential step, so it is
 * excluded from the drop-off calculation.
 */
function computeTopDropOffStep(
  sent: number,
  clicked: number,
  positiveFeedback: number,
  reviewDetected: number,
): { step: string; ratio: number } | null {
  const transitions = [
    { step: 'sent_to_clicked', a: sent, b: clicked },
    { step: 'clicked_to_positive', a: clicked, b: positiveFeedback },
    { step: 'positive_to_review', a: positiveFeedback, b: reviewDetected },
  ]
    .filter(({ a }) => a > 0)
    .map(({ step, a, b }) => ({
      step,
      ratio: Math.round((b / a) * 100) / 100,
    }));

  if (!transitions.length) return null;

  return transitions.reduce(
    (min, t) => (t.ratio < min.ratio ? t : min),
    transitions[0],
  );
}
