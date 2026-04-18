import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CampaignStatus, WidgetStatus } from '@prisma/client';

export interface MetricsOverview {
  range: {
    days: number;
    from: string;
    to: string;
  };
  reviews: {
    total: number;
    new: number;
    averageRating: number;
    responseRate: number;
    averageResponseTimeHours: number | null;
  };
  campaigns: {
    active: number;
    scans: number;
    clicks: number | null;
  };
  widgets: {
    total: number;
    active: number;
    impressions: number | null;
    clicks: number | null;
  };
}

const DEFAULT_DAYS = 30;

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(
    businessId: string,
    days = DEFAULT_DAYS,
  ): Promise<MetricsOverview> {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

    const [
      totalReviews,
      newReviews,
      ratingAggregate,
      respondedReviews,
      respondedReviewDurations,
      activeCampaigns,
      campaignScans,
      totalWidgets,
      activeWidgets,
    ] = await Promise.all([
      this.prisma.review.count({
        where: {
          businessId,
          status: { not: 'ARCHIVED' },
        },
      }),
      this.prisma.review.count({
        where: {
          businessId,
          archivedAt: null,
          createdAt: { gte: from, lte: to },
        },
      }),
      this.prisma.review.aggregate({
        where: {
          businessId,
          archivedAt: null,
          createdAt: { gte: from, lte: to },
        },
        _avg: { rating: true },
      }),
      this.prisma.review.count({
        where: {
          businessId,
          archivedAt: null,
          createdAt: { gte: from, lte: to },
          respondedAt: { not: null },
        },
      }),
      this.prisma.review.findMany({
        where: {
          businessId,
          archivedAt: null,
          createdAt: { gte: from, lte: to },
          respondedAt: { not: null },
        },
        select: {
          reviewedAt: true,
          respondedAt: true,
        },
      }),
      this.prisma.campaign.count({
        where: {
          businessId,
          status: CampaignStatus.ACTIVE,
        },
      }),
      this.prisma.scanEvent.count({
        where: {
          businessId,
          scannedAt: { gte: from, lte: to },
        },
      }),
      this.prisma.widget.count({
        where: { businessId },
      }),
      this.prisma.widget.count({
        where: {
          businessId,
          status: WidgetStatus.ACTIVE,
        },
      }),
    ]);

    const responseRate =
      newReviews === 0 ? 0 : Number(((respondedReviews / newReviews) * 100).toFixed(1));

    const averageResponseTimeHours =
      respondedReviewDurations.length === 0
        ? null
        : Number(
            (
              respondedReviewDurations.reduce((total, review) => {
                const respondedAt = review.respondedAt?.getTime() ?? 0;
                const reviewedAt = review.reviewedAt.getTime();
                return total + (respondedAt - reviewedAt) / (1000 * 60 * 60);
              }, 0) / respondedReviewDurations.length
            ).toFixed(1),
          );

    return {
      range: {
        days,
        from: from.toISOString(),
        to: to.toISOString(),
      },
      reviews: {
        total: totalReviews,
        new: newReviews,
        averageRating: Number((ratingAggregate._avg.rating ?? 0).toFixed(1)),
        responseRate,
        averageResponseTimeHours,
      },
      campaigns: {
        active: activeCampaigns,
        scans: campaignScans,
        clicks: null,
      },
      widgets: {
        total: totalWidgets,
        active: activeWidgets,
        impressions: null,
        clicks: null,
      },
    };
  }
}
