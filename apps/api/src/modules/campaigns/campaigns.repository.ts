import { Injectable } from '@nestjs/common';
import {
  CampaignStatus,
  CampaignChannel,
  CampaignExecutionStatus,
  DestinationType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { REPEAT_TEMPLATE_DEFAULTS, REPEAT_TEMPLATES } from './repeat-templates';

@Injectable()
export class CampaignsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findManyByBusiness(businessId: string, status?: CampaignStatus) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [campaigns, monthlySentGroups, respondedGroups] = await Promise.all([
      this.prisma.campaign.findMany({
        where: { businessId, ...(status  { status } : {}) },
        include: {
          branch: { select: { id: true, name: true, slug: true } },
          _count: {
            select: { qrCodes: true, scanEvents: true, executions: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.campaignExecution.groupBy({
        by: ['campaignId'],
        where: {
          businessId,
          executedAt: { gte: monthStart },
          status: {
            in: [
              CampaignExecutionStatus.sent,
              CampaignExecutionStatus.responded,
            ],
          },
        },
        _count: { id: true },
      }),
      this.prisma.campaignExecution.groupBy({
        by: ['campaignId'],
        where: { businessId, status: CampaignExecutionStatus.responded },
        _count: { id: true },
      }),
    ]);

    const monthlySentMap = new Map(
      monthlySentGroups.map((g) => [g.campaignId, g._count.id]),
    );
    const respondedMap = new Map(
      respondedGroups.map((g) => [g.campaignId, g._count.id]),
    );

    return campaigns.map((c) => ({
      ...c,
      monthlySent: monthlySentMap.get(c.id)  0,
      respondedTotal: respondedMap.get(c.id)  0,
    }));
  }

  findRecentActivity(businessId: string, limit = 20) {
    return this.prisma.campaignExecution.findMany({
      where: { businessId },
      orderBy: { executedAt: 'desc' },
      take: limit,
      include: {
        customer: { select: { id: true, name: true } },
        campaign: { select: { id: true, name: true, templateKind: true } },
        message: {
          select: { id: true, status: true, sentAt: true, deliveredAt: true },
        },
      },
    });
  }

  findOne(businessId: string, campaignId: string) {
    return this.prisma.campaign.findFirst({
      where: { id: campaignId, businessId },
      include: {
        branch: { select: { id: true, name: true, slug: true } },
        _count: {
          select: { qrCodes: true, scanEvents: true, executions: true },
        },
      },
    });
  }

  async ensureRepeatTemplates(businessId: string, createdByUserId: string) {
    for (const template of REPEAT_TEMPLATES) {
      await this.prisma.campaign.upsert({
        where: { businessId_slug: { businessId, slug: template.slug } },
        update: {},
        create: {
          businessId,
          createdByUserId,
          slug: template.slug,
          name: template.name,
          description: template.description,
          channel: REPEAT_TEMPLATE_DEFAULTS.channel,
          destinationType: REPEAT_TEMPLATE_DEFAULTS.destinationType,
          status: REPEAT_TEMPLATE_DEFAULTS.status,
          enableLanding: REPEAT_TEMPLATE_DEFAULTS.enableLanding,
          templateKind: template.templateKind,
          triggerOffsetDays: template.triggerOffsetDays,
          messageBody: template.messageBody,
          offerText: template.offerText,
        },
      });
    }
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
          ...(startsAt  { startsAt: new Date(startsAt) } : {}),
          ...(endsAt  { endsAt: new Date(endsAt) } : {}),
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
      messageBody?: string;
      triggerOffsetDays?: number;
      offerText?: string | null;
    },
  ) {
    const { startsAt, endsAt, ...rest } = data;
    return this.prisma.$transaction(async (tx) => {
      await tx.campaign.updateMany({
        where: { id: campaignId, businessId },
        data: {
          ...rest,
          ...(startsAt !== undefined  { startsAt: new Date(startsAt) } : {}),
          ...(endsAt !== undefined  { endsAt: new Date(endsAt) } : {}),
        },
      });
      return tx.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    });
  }

  async updateRepeatSettings(
    businessId: string,
    campaignId: string,
    data: {
      messageBody?: string;
      triggerOffsetDays?: number;
      offerText?: string | null;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.findFirst({
        where: {
          id: campaignId,
          businessId,
          templateKind: { not: null },
        },
      });
      if (!campaign) return null;

      return tx.campaign.update({
        where: { id: campaignId },
        data,
        include: {
          branch: { select: { id: true, name: true, slug: true } },
          _count: {
            select: { qrCodes: true, scanEvents: true, executions: true },
          },
        },
      });
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
             { archivedAt: new Date() }
            : {}),
          ...(status !== CampaignStatus.ARCHIVED  { archivedAt: null } : {}),
        },
      });
      return tx.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    });
  }
}
