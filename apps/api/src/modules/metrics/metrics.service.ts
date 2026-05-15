import { Injectable } from '@nestjs/common';
import { CampaignExecutionStatus } from '@prisma/client';
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

const GOOGLE_REVIEW_LIMIT = 100;
const NEGATIVE_FEEDBACK_LIMIT = 10;

@Injectable()
export class MetricsService {
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
        score: item.score,
        comment: item.comment,
        acknowledgedByOwner: item.acknowledgedByOwner,
      })),
    };
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
