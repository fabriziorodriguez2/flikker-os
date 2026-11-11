import { Injectable } from '@nestjs/common';
import { RewardGoalStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { customersWithWhatsappMarketingConsent } from '../../policy/marketing-consent';
import {
  buildBusinessSnapshot,
  type BusinessSnapshot,
} from './business-snapshot';

const MS_PER_DAY = 86_400_000;

/**
 * Lee lo que necesita la foto del negocio en lotes (una consulta por tabla,
 * no una por cliente): sirve igual para 0, 105 o miles de clientes. Todo
 * filtrado por `businessId`.
 */
@Injectable()
export class BusinessSnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  async load(
    businessId: string,
    now: Date = new Date(),
  ): Promise<BusinessSnapshot> {
    const since90 = new Date(now.getTime() - 90 * MS_PER_DAY);
    const [
      customers,
      visits,
      retentionContacts,
      manualContacts,
      goals,
      openBenefits,
      redemptions,
    ] = await Promise.all([
      this.prisma.customer.findMany({
        where: { businessId },
        select: { id: true, isActive: true, optedOut: true },
      }),
      this.prisma.visit.findMany({
        where: { businessId },
        select: { customerId: true, occurredAt: true },
      }),
      this.prisma.retentionAssignment.groupBy({
        by: ['customerId'],
        where: { businessId, sentAt: { not: null } },
        _max: { sentAt: true },
      }),
      this.prisma.manualCampaignContact.groupBy({
        by: ['customerId'],
        where: { businessId, status: 'sent', customerId: { not: null } },
        _max: { sentAt: true },
      }),
      this.prisma.customerRewardGoal.findMany({
        where: {
          businessId,
          status: RewardGoalStatus.ACTIVE,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: {
          customerId: true,
          startingVisitCount: true,
          targetAdditionalVisits: true,
        },
      }),
      this.prisma.benefitParticipation.findMany({
        where: {
          businessId,
          redeemedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { customerId: true, expiresAt: true },
      }),
      this.prisma.benefitParticipation.findMany({
        where: { businessId, redeemedAt: { gte: since90 } },
        select: { customerId: true, redeemedAt: true },
      }),
    ]);

    const visitCount = new Map<string, number>();
    for (const v of visits) {
      visitCount.set(v.customerId, (visitCount.get(v.customerId) ?? 0) + 1);
    }
    const lastContact = new Map<string, Date>();
    for (const row of [...retentionContacts, ...manualContacts]) {
      const at = row._max.sentAt;
      if (!row.customerId || !at) continue;
      const current = lastContact.get(row.customerId);
      if (!current || at > current) lastContact.set(row.customerId, at);
    }

    const consented = await customersWithWhatsappMarketingConsent(
      this.prisma,
      businessId,
      customers.filter((c) => c.isActive && !c.optedOut).map((c) => c.id),
    );

    return buildBusinessSnapshot(
      {
        customers,
        visits,
        lastContacts: [...lastContact].map(([customerId, at]) => ({
          customerId,
          at,
        })),
        rewardRemaining: goals.map((g) => ({
          customerId: g.customerId,
          remaining: Math.max(
            0,
            g.targetAdditionalVisits -
              ((visitCount.get(g.customerId) ?? 0) - g.startingVisitCount),
          ),
        })),
        openBenefits,
        redemptions: redemptions.map((r) => ({
          customerId: r.customerId,
          redeemedAt: r.redeemedAt!,
        })),
        consented,
      },
      now,
    );
  }
}
