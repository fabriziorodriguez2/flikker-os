import { Injectable } from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ResponsesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOne(businessId: string, responseId: string) {
    return this.prisma.response.findFirst({
      where: { id: responseId, businessId },
      include: {
        respondedBy: { select: { id: true, firstName: true, lastName: true } },
        review: {
          select: {
            id: true,
            businessId: true,
            status: true,
            respondedAt: true,
            respondedByUserId: true,
          },
        },
      },
    });
  }

  findByReview(businessId: string, reviewId: string) {
    return this.prisma.response.findFirst({
      where: { businessId, reviewId },
      include: {
        respondedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async create(
    businessId: string,
    reviewId: string,
    content: string,
    respondedByUserId: string,
  ) {
    const respondedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const review = await tx.review.findFirst({
        where: { id: reviewId, businessId },
        select: { status: true },
      });

      const response = await tx.response.create({
        data: {
          businessId,
          reviewId,
          content,
          respondedAt,
          respondedByUserId,
        },
        include: {
          respondedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });

      await tx.review.updateMany({
        where: { id: reviewId, businessId },
        data: {
          status: ReviewStatus.RESPONDED,
          respondedAt,
          respondedByUserId,
        },
      });

      await tx.reviewStatusHistory.create({
        data: {
          reviewId,
          fromStatus: review?.status  null,
          toStatus: ReviewStatus.RESPONDED,
          changedByUserId: respondedByUserId,
          reason: 'Manual response saved',
        },
      });

      return response;
    });
  }

  async update(
    businessId: string,
    responseId: string,
    content: string,
    respondedByUserId: string,
  ) {
    const respondedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.response.findFirst({
        where: { id: responseId, businessId },
        select: { reviewId: true },
      });

      await tx.response.updateMany({
        where: { id: responseId, businessId },
        data: {
          content,
          respondedAt,
          respondedByUserId,
        },
      });

      const response = await tx.response.findFirstOrThrow({
        where: { id: responseId, businessId },
        include: {
          respondedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });

      await tx.review.updateMany({
        where: { id: current!.reviewId, businessId },
        data: {
          status: ReviewStatus.RESPONDED,
          respondedAt,
          respondedByUserId,
        },
      });

      await tx.reviewStatusHistory.create({
        data: {
          reviewId: current!.reviewId,
          fromStatus: ReviewStatus.RESPONDED,
          toStatus: ReviewStatus.RESPONDED,
          changedByUserId: respondedByUserId,
          reason: 'Manual response updated',
        },
      });

      return response;
    });
  }
}
