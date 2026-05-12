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
  negativeFeedback: NegativeFeedbackItem[];
}

const GOOGLE_REVIEW_LIMIT = 100;
const NEGATIVE_FEEDBACK_LIMIT = 10;

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(businessId: string): Promise<MetricsOverview> {
    const now = new Date();
    const currentStart = startOfMonth(now);
    const currentEnd = addMonths(currentStart, 1);
    const previousStart = addMonths(currentStart, -1);
    const previousEnd = currentStart;
    const chartMonths = buildMonthWindows(currentStart, 6);

    const [
      currentReviews,
      previousReviews,
      currentRatingReviews,
      previousRatingReviews,
      currentReactivatedCustomers,
      previousReactivatedCustomers,
      monthlyReviewCounts,
      negativeFeedback,
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
    ]);

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
  return new Intl.DateTimeFormat('es-UY', {
    month: 'short',
  }).format(date);
}
