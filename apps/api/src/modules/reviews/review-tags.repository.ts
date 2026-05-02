import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReviewTagsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(businessId: string) {
    return this.prisma.reviewTag.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
    });
  }

  findOne(businessId: string, tagId: string) {
    return this.prisma.reviewTag.findFirst({
      where: { id: tagId, businessId },
    });
  }

  findBySlug(businessId: string, slug: string) {
    return this.prisma.reviewTag.findUnique({
      where: { businessId_slug: { businessId, slug } },
    });
  }

  create(
    businessId: string,
    data: { name: string; slug: string; color?: string },
  ) {
    return this.prisma.reviewTag.create({
      data: { businessId, ...data },
    });
  }

  async update(
    businessId: string,
    tagId: string,
    data: Prisma.ReviewTagUpdateInput,
  ) {
    await this.prisma.reviewTag.updateMany({
      where: { id: tagId, businessId },
      data,
    });
    return this.prisma.reviewTag.findFirstOrThrow({
      where: { id: tagId, businessId },
    });
  }

  async delete(businessId: string, tagId: string) {
    // Delete only relations whose tag belongs to this business.
    await this.prisma.$transaction(async (tx) => {
      await tx.reviewTagRelation.deleteMany({
        where: { tagId, tag: { businessId } },
      });
      await tx.reviewTag.deleteMany({ where: { id: tagId, businessId } });
    });
  }

  // --- Tag <-> Review assignment ---

  findRelation(businessId: string, reviewId: string, tagId: string) {
    return this.prisma.reviewTagRelation.findFirst({
      where: {
        reviewId,
        tagId,
        review: { businessId },
        tag: { businessId },
      },
    });
  }

  assignTag(businessId: string, reviewId: string, tagId: string) {
    return this.prisma.$transaction(async (tx) => {
      const [review, tag] = await Promise.all([
        tx.review.findFirst({
          where: { id: reviewId, businessId },
          select: { id: true },
        }),
        tx.reviewTag.findFirst({
          where: { id: tagId, businessId },
          select: { id: true },
        }),
      ]);

      if (!review || !tag) return null;

      return tx.reviewTagRelation.create({
        data: { reviewId, tagId },
      });
    });
  }

  unassignTag(businessId: string, reviewId: string, tagId: string) {
    return this.prisma.reviewTagRelation.deleteMany({
      where: {
        reviewId,
        tagId,
        review: { businessId },
        tag: { businessId },
      },
    });
  }
}
