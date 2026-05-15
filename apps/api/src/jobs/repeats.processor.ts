import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  CampaignExecutionStatus,
  CampaignTemplateKind,
  MessageChannel,
  MessageStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RepeatsQueue } from './repeats.queue';

const ANTI_SPAM_DAYS = 14;

interface RepeatCampaign {
  id: string;
  businessId: string;
  templateKind: CampaignTemplateKind | null;
  triggerOffsetDays: number | null;
}

@Injectable()
export class RepeatsProcessor {
  private readonly logger = new Logger(RepeatsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repeatsQueue: RepeatsQueue,
  ) {}

  async runDaily(now = new Date()) {
    const startedAt = Date.now();
    const campaigns = await this.findActiveRepeatCampaigns();
    let queued = 0;
    let skipped = 0;

    for (const campaign of campaigns) {
      const customerIds = await this.findCandidateCustomerIds(campaign, now);
      const allowedCustomerIds = await this.filterAntiSpam(
        campaign.id,
        customerIds,
        now,
      );
      skipped += customerIds.length - allowedCustomerIds.length;

      for (const customerId of allowedCustomerIds) {
        const execution = await this.createQueuedExecution(
          campaign,
          customerId,
        );
        await this.repeatsQueue.enqueueSendRepeatMessage({
          executionId: execution.id,
        });
        queued += 1;
      }
    }

    const ms = Date.now() - startedAt;
    this.logger.log(
      `Repeats daily run queued=${queued} skipped=${skipped} campaigns=${campaigns.length} ${ms}ms`,
    );

    return { queued, skipped, campaigns: campaigns.length, ms };
  }

  async wasContactedRecently(
    campaignId: string,
    customerId: string,
    now = new Date(),
  ) {
    const since = this.daysAgo(now, ANTI_SPAM_DAYS);
    const recent = await this.prisma.campaignExecution.findFirst({
      where: { campaignId, customerId, executedAt: { gte: since } },
      select: { id: true },
    });

    return !!recent;
  }

  private findActiveRepeatCampaigns() {
    return this.prisma.campaign.findMany({
      where: {
        status: 'ACTIVE',
        templateKind: { not: null },
      },
      select: {
        id: true,
        businessId: true,
        templateKind: true,
        triggerOffsetDays: true,
      },
    });
  }

  private async findCandidateCustomerIds(campaign: RepeatCampaign, now: Date) {
    if (campaign.templateKind === CampaignTemplateKind.post_service) {
      return this.findPostServiceCustomers(campaign, now);
    }
    if (campaign.templateKind === CampaignTemplateKind.reactivation) {
      return this.findReactivationCustomers(campaign, now);
    }
    if (campaign.templateKind === CampaignTemplateKind.birthday) {
      return this.findBirthdayCustomers(campaign, now);
    }

    return [];
  }

  private async findPostServiceCustomers(campaign: RepeatCampaign, now: Date) {
    const offset = campaign.triggerOffsetDays  30;
    const target = this.daysAgo(now, offset);
    const start = this.startOfDay(target);
    const end = this.addDays(start, 1);

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT c.id
      FROM "Customer" c
      JOIN (
        SELECT "customerId", MAX("eventAt") AS "lastEventAt"
        FROM "ServiceEvent"
        WHERE "businessId" = ${campaign.businessId}
        GROUP BY "customerId"
      ) s ON s."customerId" = c.id
      WHERE c."businessId" = ${campaign.businessId}
        AND c."isActive" = true
        AND c."opted_out" = false
        AND s."lastEventAt" >= ${start}
        AND s."lastEventAt" < ${end}
    `;

    return rows.map((row) => row.id);
  }

  private async findReactivationCustomers(campaign: RepeatCampaign, now: Date) {
    const offset = campaign.triggerOffsetDays  180;
    const cutoff = this.startOfDay(this.daysAgo(now, offset));

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT c.id
      FROM "Customer" c
      LEFT JOIN (
        SELECT "customerId", MAX("eventAt") AS "lastEventAt"
        FROM "ServiceEvent"
        WHERE "businessId" = ${campaign.businessId}
        GROUP BY "customerId"
      ) s ON s."customerId" = c.id
      WHERE c."businessId" = ${campaign.businessId}
        AND c."isActive" = true
        AND c."opted_out" = false
        AND s."lastEventAt" IS NOT NULL
        AND s."lastEventAt" < ${cutoff}
    `;

    return rows.map((row) => row.id);
  }

  private async findBirthdayCustomers(campaign: RepeatCampaign, now: Date) {
    const month = now.getMonth() + 1;
    const day = now.getDate();

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM "Customer"
      WHERE "businessId" = ${campaign.businessId}
        AND "isActive" = true
        AND "opted_out" = false
        AND "birthday" IS NOT NULL
        AND EXTRACT(MONTH FROM "birthday") = ${month}
        AND EXTRACT(DAY FROM "birthday") = ${day}
    `;

    return rows.map((row) => row.id);
  }

  private async filterAntiSpam(
    campaignId: string,
    customerIds: string[],
    now: Date,
  ) {
    if (!customerIds.length) return [];

    const since = this.daysAgo(now, ANTI_SPAM_DAYS);
    const recent = await this.prisma.campaignExecution.findMany({
      where: {
        campaignId,
        customerId: { in: customerIds },
        executedAt: { gte: since },
      },
      select: { customerId: true },
    });
    const blocked = new Set(recent.map((row) => row.customerId));

    return customerIds.filter((customerId) => !blocked.has(customerId));
  }

  private async createQueuedExecution(
    campaign: RepeatCampaign,
    customerId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          businessId: campaign.businessId,
          customerId,
          campaignId: campaign.id,
          trackingToken: randomBytes(8).toString('base64url'),
          channel: MessageChannel.whatsapp,
          status: MessageStatus.queued,
        },
      });

      return tx.campaignExecution.create({
        data: {
          businessId: campaign.businessId,
          campaignId: campaign.id,
          customerId,
          messageId: message.id,
          status: CampaignExecutionStatus.queued,
        },
      });
    });
  }

  private startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private daysAgo(date: Date, days: number) {
    return this.addDays(date, -days);
  }
}
