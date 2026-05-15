import { Injectable } from '@nestjs/common';
import {
  BusinessStatus,
  MembershipRole,
  MembershipStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BusinessesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBySlug(slug: string) {
    return this.prisma.business.findUnique({ where: { slug } });
  }

  findById(id: string) {
    return this.prisma.business.findUnique({ where: { id } });
  }

  findBrandProfile(id: string) {
    return this.prisma.business.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        primaryColor: true,
        secondaryColor: true,
        toneOfVoice: true,
        whatsappUrl: true,
        website: true,
        shortBio: true,
        signatureText: true,
        googleBusinessProfileUrl: true,
        defaultReviewRedirectUrl: true,
      },
    });
  }

  findMembershipStatus(businessId: string, userId: string) {
    return this.prisma.membership.findUnique({
      where: { userId_businessId: { userId, businessId } },
      select: { status: true },
    });
  }

  findAllForUser(userId: string) {
    return this.prisma.membership.findMany({
      where: { userId, status: MembershipStatus.ACTIVE },
      select: {
        role: true,
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            industry: true,
            country: true,
            logoUrl: true,
            createdAt: true,
          },
        },
      },
    });
  }

  /**
   * Creates a business + OWNER membership atomically.
   * Slug uniqueness is checked inside the transaction to prevent TOCTOU.
   * Returns null if slug is already taken, otherwise the created business.
   */
  async createWithOwner(
    data: {
      name: string;
      slug: string;
      country: string;
      timezone: string;
      currency: string;
      legalName?: string;
      industry?: string;
      vertical?: string;
      description?: string;
      website?: string;
      phone?: string;
      email?: string;
      logoUrl?: string;
      primaryColor?: string;
      secondaryColor?: string;
      toneOfVoice?: string;
      whatsappUrl?: string;
      shortBio?: string;
      signatureText?: string;
    },
    userId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.business.findUnique({
        where: { slug: data.slug },
      });
      if (existing) return null;

      const created = await tx.business.create({
        data: { ...data, status: BusinessStatus.DRAFT },
      });

      await tx.membership.create({
        data: {
          userId,
          businessId: created.id,
          role: MembershipRole.OWNER,
          status: MembershipStatus.ACTIVE,
        },
      });

      return created;
    });
  }

  update(
    id: string,
    data: Parameters<PrismaService['business']['update']>[0]['data'],
  ) {
    return this.prisma.business.update({ where: { id }, data });
  }

  updateStatus(id: string, status: BusinessStatus) {
    return this.prisma.business.update({
      where: { id },
      data: {
        status,
        archivedAt: status === BusinessStatus.ARCHIVED  new Date() : undefined,
      },
    });
  }
}
