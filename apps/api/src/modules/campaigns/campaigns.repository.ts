import { Injectable } from '@nestjs/common';
import {
  CampaignStatus,
  CampaignChannel,
  DestinationType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CampaignsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findManyByBusiness(businessId: string, status?: CampaignStatus) {
    return this.prisma.campaign.findMany({
      where: {
        businessId,
        ...(status ? { status } : {}),
      },
      include: {
        branch: { select: { id: true, name: true, slug: true } },
        _count: { select: { qrCodes: true, scanEvents: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(businessId: string, campaignId: string) {
    return this.prisma.campaign.findFirst({
      where: { id: campaignId, businessId },
      include: {
        branch: { select: { id: true, name: true, slug: true } },
        _count: { select: { qrCodes: true, scanEvents: true } },
      },
    });
  }

  /**
   * Creates a campaign atomically: checks plan limit + slug uniqueness + insert
   * all inside one transaction to prevent TOCTOU race conditions.
   * Only non-ARCHIVED campaigns count towards the limit.
   * Returns 'LIMIT_REACHED' | 'SLUG_TAKEN' | Campaign.
   */
  async createAtomic(
    businessId: string,
    data: {
      name: string;
      slug: string;
      channel: CampaignChannel;
      destinationType: DestinationType;
      createdByUserId: string;
      branchId?: string;
      description?: string;
      destinationUrl?: string;
      enableLanding?: boolean;
      startsAt?: string;
      endsAt?: string;
    },
    maxCampaigns: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const currentCount = await tx.campaign.count({
        where: {
          businessId,
          status: { not: CampaignStatus.ARCHIVED },
        },
      });
      if (currentCount >= maxCampaigns) return 'LIMIT_REACHED' as const;

      const existing = await tx.campaign.findUnique({
        where: { businessId_slug: { businessId, slug: data.slug } },
      });
      if (existing) return 'SLUG_TAKEN' as const;

      const { startsAt, endsAt, ...rest } = data;
      return tx.campaign.create({
        data: {
          businessId,
          ...rest,
          ...(startsAt ? { startsAt: new Date(startsAt) } : {}),
          ...(endsAt ? { endsAt: new Date(endsAt) } : {}),
        },
      });
    });
  }

  async update(
    businessId: string,
    campaignId: string,
    data: {
      name?: string;
      description?: string;
      destinationType?: DestinationType;
      destinationUrl?: string;
      enableLanding?: boolean;
      branchId?: string;
      startsAt?: string;
      endsAt?: string;
    },
  ) {
    const { startsAt, endsAt, ...rest } = data;
    return this.prisma.$transaction(async (tx) => {
      await tx.campaign.updateMany({
        where: { id: campaignId, businessId },
        data: {
          ...rest,
          ...(startsAt !== undefined ? { startsAt: new Date(startsAt) } : {}),
          ...(endsAt !== undefined ? { endsAt: new Date(endsAt) } : {}),
        },
      });
      return tx.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    });
  }

  async updateStatus(
    businessId: string,
    campaignId: string,
    status: CampaignStatus,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.campaign.updateMany({
        where: { id: campaignId, businessId },
        data: {
          status,
          ...(status === CampaignStatus.ARCHIVED
            ? { archivedAt: new Date() }
            : {}),
          ...(status !== CampaignStatus.ARCHIVED ? { archivedAt: null } : {}),
        },
      });
      return tx.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    });
  }
}
