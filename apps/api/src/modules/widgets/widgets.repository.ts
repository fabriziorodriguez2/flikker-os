import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  WidgetEventType,
  WidgetMode,
  WidgetPosition,
  WidgetStatus,
  WidgetType,
} from '@prisma/client';

@Injectable()
export class WidgetsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findManyByBusiness(businessId: string) {
    return this.prisma.widget.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(businessId: string, widgetId: string) {
    return this.prisma.widget.findFirst({
      where: { id: widgetId, businessId },
    });
  }

  findActiveByPublicToken(publicToken: string) {
    return this.prisma.widget.findFirst({
      where: {
        publicToken,
        status: WidgetStatus.ACTIVE,
      },
      include: {
        business: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  findActiveToastByBusinessId(businessId: string) {
    return this.prisma.widget.findFirst({
      where: {
        businessId,
        mode: WidgetMode.toast,
        status: WidgetStatus.ACTIVE,
        enabled: true,
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        business: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  create(
    businessId: string,
    data: {
      name: string;
      type: WidgetType;
      publicToken: string;
      title?: string;
      maxItems: number;
      mode?: WidgetMode;
      position?: WidgetPosition;
      minStars?: number;
      maxReviewsShown?: number;
      primaryColor?: string;
      rotationSeconds?: number;
      showAuthorName: boolean;
      showDate: boolean;
    },
  ) {
    return this.prisma.widget.create({
      data: {
        businessId,
        ...data,
      },
    });
  }

  update(
    businessId: string,
    widgetId: string,
    data: {
      name?: string;
      title?: string | null;
      maxItems?: number;
      mode?: WidgetMode;
      position?: WidgetPosition;
      minStars?: number;
      maxReviewsShown?: number;
      primaryColor?: string | null;
      rotationSeconds?: number;
      showAuthorName?: boolean;
      showDate?: boolean;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.widget.updateMany({
        where: { id: widgetId, businessId },
        data,
      });

      return tx.widget.findUniqueOrThrow({ where: { id: widgetId } });
    });
  }

  updateStatus(businessId: string, widgetId: string, status: WidgetStatus) {
    return this.prisma.$transaction(async (tx) => {
      await tx.widget.updateMany({
        where: { id: widgetId, businessId },
        data: { status },
      });

      return tx.widget.findUniqueOrThrow({ where: { id: widgetId } });
    });
  }

  countHighlightedReviews(businessId: string) {
    return this.prisma.review.count({
      where: {
        businessId,
        isHighlighted: true,
        status: { not: 'ARCHIVED' },
      },
    });
  }

  countDetectedReviewsForWidget(businessId: string, minStars: number) {
    return this.prisma.googleReview.count({
      where: {
        businessId,
        stars: { gte: minStars },
      },
    });
  }

  findHighlightedReviewsForWidget(businessId: string, maxItems: number) {
    return this.prisma.review.findMany({
      where: {
        businessId,
        isHighlighted: true,
        status: { not: 'ARCHIVED' },
      },
      orderBy: [{ reviewedAt: 'desc' }, { createdAt: 'desc' }],
      take: maxItems,
      select: {
        rating: true,
        content: true,
        authorDisplayName: true,
        reviewedAt: true,
      },
    });
  }

  getHighlightedReviewsAggregate(businessId: string) {
    return this.prisma.review.aggregate({
      where: {
        businessId,
        isHighlighted: true,
        status: { not: 'ARCHIVED' },
      },
      _avg: {
        rating: true,
      },
      _count: {
        _all: true,
      },
    });
  }

  findDetectedReviewsForWidget(
    businessId: string,
    minStars: number,
    maxItems: number,
  ) {
    return this.prisma.googleReview.findMany({
      where: {
        businessId,
        stars: { gte: minStars },
      },
      orderBy: [{ postedAt: 'desc' }, { detectedAt: 'desc' }],
      take: maxItems,
      select: {
        id: true,
        googleReviewId: true,
        reviewerName: true,
        stars: true,
        text: true,
        postedAt: true,
      },
    });
  }

  getDetectedReviewsAggregate(businessId: string, minStars: number) {
    return this.prisma.googleReview.aggregate({
      where: {
        businessId,
        stars: { gte: minStars },
      },
      _avg: {
        stars: true,
      },
      _count: {
        _all: true,
      },
    });
  }

  createEvent(data: {
    businessId: string;
    eventType: WidgetEventType;
    googleReviewId?: string | null;
    referrer?: string | null;
  }) {
    return this.prisma.widgetEvent.create({ data });
  }
}
