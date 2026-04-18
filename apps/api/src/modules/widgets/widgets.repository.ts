import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WidgetStatus, WidgetType } from '@prisma/client';

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

  create(
    businessId: string,
    data: {
      name: string;
      type: WidgetType;
      publicToken: string;
      title?: string;
      maxItems: number;
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
}
