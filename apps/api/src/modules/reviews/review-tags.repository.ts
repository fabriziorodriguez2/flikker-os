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
    return this.prisma.reviewTag.findUniqueOrThrow({ where: { id: tagId } });
  }

  async delete(businessId: string, tagId: string) {
    // Delete relations first, then the tag
    await this.prisma.$transaction([
      this.prisma.reviewTagRelation.deleteMany({ where: { tagId } }),
      this.prisma.reviewTag.deleteMany({ where: { id: tagId, businessId } }),
    ]);
  }

  // --- Tag ↔ Review assignment ---

  findRelation(reviewId: string, tagId: string) {
    return this.prisma.reviewTagRelation.findUnique({
      where: { reviewId_tagId: { reviewId, tagId } },
    });
  }

  assignTag(reviewId: string, tagId: string) {
    return this.prisma.reviewTagRelation.create({
      data: { reviewId, tagId },
    });
  }

  unassignTag(reviewId: string, tagId: string) {
    return this.prisma.reviewTagRelation.deleteMany({
      where: { reviewId, tagId },
    });
  }
}
