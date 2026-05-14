import { Injectable } from '@nestjs/common';
import { ReviewStatus, ReviewSource, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface ReviewFilters {
  status?: ReviewStatus;
  source?: ReviewSource;
  ratingMin?: number;
  ratingMax?: number;
  campaignId?: string;
  isHighlighted?: boolean;
  responded?: boolean;
  search?: string;
  sortBy?: 'reviewedAt' | 'rating' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

@Injectable()
export class ReviewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOne(businessId: string, reviewId: string) {
    return this.prisma.review.findFirst({
      where: { id: reviewId, businessId },
      include: {
        campaign: { select: { id: true, name: true, slug: true } },
        respondedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async findMany(businessId: string, filters: ReviewFilters) {
    const where: Prisma.ReviewWhereInput = { businessId };

    if (filters.status) where.status = filters.status;
    if (filters.source) where.source = filters.source;
    if (filters.campaignId) where.campaignId = filters.campaignId;
    if (filters.isHighlighted !== undefined)
      where.isHighlighted = filters.isHighlighted;
    if (filters.responded !== undefined) {
      where.respondedAt = filters.responded ? { not: null } : null;
    }

    if (filters.ratingMin !== undefined || filters.ratingMax !== undefined) {
      where.rating = {
        ...(filters.ratingMin !== undefined ? { gte: filters.ratingMin } : {}),
        ...(filters.ratingMax !== undefined ? { lte: filters.ratingMax } : {}),
      };
    }

    if (filters.search) {
      where.OR = [
        { content: { contains: filters.search, mode: 'insensitive' } },
        {
          authorDisplayName: {
            contains: filters.search,
            mode: 'insensitive',
          },
        },
      ];
    }

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 25, 100);
    const skip = (page - 1) * limit;

    const sortBy = filters.sortBy ?? 'reviewedAt';
    const sortOrder = filters.sortOrder ?? 'desc';

    const [data, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: {
          campaign: { select: { id: true, name: true } },
          respondedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.review.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findGoogleReviews(businessId: string, filters: ReviewFilters) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 25, 100);
    const skip = (page - 1) * limit;

    if (
      filters.campaignId ||
      filters.isHighlighted === true ||
      filters.responded === true
    ) {
      return { data: [], total: 0, page, limit };
    }

    const where: Prisma.GoogleReviewWhereInput = { businessId };

    if (filters.ratingMin !== undefined || filters.ratingMax !== undefined) {
      where.stars = {
        ...(filters.ratingMin !== undefined ? { gte: filters.ratingMin } : {}),
        ...(filters.ratingMax !== undefined ? { lte: filters.ratingMax } : {}),
      };
    }

    if (filters.search) {
      where.OR = [
        { text: { contains: filters.search, mode: 'insensitive' } },
        { reviewerName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const sortMap = {
      reviewedAt: 'postedAt',
      rating: 'stars',
      createdAt: 'createdAt',
    } as const;
    const sortBy = sortMap[filters.sortBy ?? 'reviewedAt'];
    const sortOrder = filters.sortOrder ?? 'desc';

    const [googleReviews, total] = await Promise.all([
      this.prisma.googleReview.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.googleReview.count({ where }),
    ]);

    return {
      data: googleReviews.map((review) => ({
        id: review.id,
        rating: review.stars,
        authorDisplayName: review.reviewerName,
        reviewedAt: review.postedAt,
        content: review.text,
        campaign: null,
        respondedAt: null,
        respondedBy: null,
        isHighlighted: false,
        status: ReviewStatus.NEW,
      })),
      total,
      page,
      limit,
    };
  }

  /**
   * Creates a review atomically with dedup + insert inside a single
   * transaction to prevent TOCTOU races.
   * Returns 'DUPLICATE' | Review.
   */
  async createAtomic(
    businessId: string,
    data: {
      source: ReviewSource;
      rating: number;
      reviewedAt: string;
      campaignId?: string;
      externalReviewId?: string;
      authorDisplayName?: string;
      content?: string;
      createdByUserId?: string;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Dedup check when externalReviewId is provided
      // The partial unique index enforces this at DB level too,
      // but checking here gives a cleaner error message.
      if (data.externalReviewId) {
        const existing = await tx.review.findFirst({
          where: {
            businessId,
            source: data.source,
            externalReviewId: data.externalReviewId,
          },
        });
        if (existing) return 'DUPLICATE' as const;
      }

      return tx.review.create({
        data: {
          businessId,
          source: data.source,
          rating: data.rating,
          reviewedAt: new Date(data.reviewedAt),
          campaignId: data.campaignId,
          externalReviewId: data.externalReviewId,
          authorDisplayName: data.authorDisplayName,
          content: data.content,
          createdByUserId: data.createdByUserId,
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: ReviewStatus.NEW,
              changedByUserId: data.createdByUserId,
            },
          },
        },
      });
    });
  }

  async update(
    businessId: string,
    reviewId: string,
    data: Prisma.ReviewUpdateInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.review.updateMany({
        where: { id: reviewId, businessId },
        data,
      });
      return tx.review.findUniqueOrThrow({ where: { id: reviewId } });
    });
  }

  async updateStatus(
    businessId: string,
    reviewId: string,
    status: ReviewStatus,
    changedByUserId?: string,
    reason?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.review.findFirst({
        where: { id: reviewId, businessId },
        select: { status: true },
      });

      await tx.review.updateMany({
        where: { id: reviewId, businessId },
        data: {
          status,
          respondedAt:
            status === ReviewStatus.RESPONDED
              ? new Date()
              : status === ReviewStatus.REVIEWED || status === ReviewStatus.NEW
                ? null
                : undefined,
          respondedByUserId:
            status === ReviewStatus.RESPONDED
              ? changedByUserId
              : status === ReviewStatus.REVIEWED || status === ReviewStatus.NEW
                ? null
                : undefined,
          ...(status === ReviewStatus.ARCHIVED
            ? { archivedAt: new Date() }
            : {}),
          ...(status !== ReviewStatus.ARCHIVED ? { archivedAt: null } : {}),
        },
      });

      if (status === ReviewStatus.REVIEWED || status === ReviewStatus.NEW) {
        await tx.response.deleteMany({
          where: { reviewId, businessId },
        });
      }

      await tx.reviewStatusHistory.create({
        data: {
          reviewId,
          fromStatus: current?.status ?? null,
          toStatus: status,
          changedByUserId,
          reason,
        },
      });

      return tx.review.findUniqueOrThrow({ where: { id: reviewId } });
    });
  }
}
