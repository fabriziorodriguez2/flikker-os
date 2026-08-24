import { Injectable } from '@nestjs/common';
import {
  MessageStatus,
  Prisma,
  Visit,
  VisitAttributionType,
  VisitVerificationType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { localDayKey } from '../../common/utils/timezone.util';
import {
  evaluateDedup,
  resolveAttribution,
  type AttributionResult,
  type CandidateMessage,
} from './checkin.rules';

const SENT_STATUSES: MessageStatus[] = [
  MessageStatus.sent,
  MessageStatus.delivered,
  MessageStatus.read,
];

/** Attribution look-back window for return visits. */
export const CHECKIN_ATTRIBUTION_WINDOW_DAYS = 30;

export interface RegisterVisitInput {
  businessId: string;
  customerId: string;
  sourceId: string | null;
  verificationType: VisitVerificationType;
  timezone: string;
  minHoursBetweenVisits: number;
  maxVisitsPerDay: number;
  /** Run campaign attribution (only meaningful for return visits). */
  attribute: boolean;
  /**
   * Identidad de la ventana de presencia que acreditó esta visita, cuando el
   * negocio exige prueba de presencia. Se persiste y su índice único es el
   * anti-replay real: reusar el mismo desafío no puede crear una segunda
   * visita. `undefined`/`null` = negocio en `off` (comportamiento actual).
   */
  presenceChallengeId?: string | null;
  now?: Date;
  /** Forced attribution (e.g. a confirmed benefit redemption in phase 3). */
  forced?: {
    attributionType: VisitAttributionType;
    messageId?: string | null;
    campaignId?: string | null;
  };
}

export type RegisterVisitResult =
  | { created: true; visit: Visit; isReturn: boolean }
  | {
      created: false;
      reason: 'min_hours' | 'max_per_day' | 'presence_replay';
      lastVisitAt: Date | null;
    };

@Injectable()
export class VisitsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a visit with concurrency-safe deduplication. All reads and the
   * insert happen inside a single transaction guarded by a Postgres advisory
   * lock keyed on (business, customer), so two simultaneous scans of the same
   * customer serialize and only one visit is created within the dedup window.
   */
  async registerVisit(input: RegisterVisitInput): Promise<RegisterVisitResult> {
    const now = input.now ?? new Date();
    const dayKey = localDayKey(now, input.timezone);
    const lockKey = `${input.businessId}:${input.customerId}`;

    return this.prisma.$transaction(async (tx) => {
      // Serialize concurrent check-ins for the same customer. Released on commit.
      // $executeRaw (not $queryRaw) because the lock function returns `void`,
      // which the query deserializer cannot map to a column type.
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`,
      );

      const lastVisit = await tx.visit.findFirst({
        where: { businessId: input.businessId, customerId: input.customerId },
        orderBy: { occurredAt: 'desc' },
        select: { occurredAt: true },
      });
      const priorCount = await tx.visit.count({
        where: { businessId: input.businessId, customerId: input.customerId },
      });
      const visitsToday = await tx.visit.count({
        where: {
          businessId: input.businessId,
          customerId: input.customerId,
          visitDayKey: dayKey,
        },
      });

      const decision = evaluateDedup({
        lastVisitAt: lastVisit?.occurredAt ?? null,
        visitsToday,
        now,
        minHoursBetweenVisits: input.minHoursBetweenVisits,
        maxVisitsPerDay: input.maxVisitsPerDay,
      });
      if (!decision.allowed) {
        return {
          created: false,
          reason: decision.reason,
          lastVisitAt: lastVisit?.occurredAt ?? null,
        };
      }

      // Anti-replay de la prueba de presencia. La garantía dura es el índice
      // único `(businessId, customerId, presenceChallengeId)`; este chequeo
      // adentro del advisory lock existe para devolver un motivo entendible
      // en vez de un P2002 crudo. Los dos hacen falta: el índice es lo que
      // sostiene la invariante, esto es lo que la explica.
      if (input.presenceChallengeId) {
        const alreadyUsed = await tx.visit.findFirst({
          where: {
            businessId: input.businessId,
            customerId: input.customerId,
            presenceChallengeId: input.presenceChallengeId,
          },
          select: { id: true },
        });
        if (alreadyUsed) {
          return {
            created: false,
            reason: 'presence_replay' as const,
            lastVisitAt: lastVisit?.occurredAt ?? null,
          };
        }
      }

      const isReturn = priorCount > 0;
      const attribution = await this.resolveVisitAttribution(
        tx,
        input,
        isReturn,
        now,
      );

      const visit = await tx.visit.create({
        data: {
          businessId: input.businessId,
          customerId: input.customerId,
          sourceId: input.sourceId ?? null,
          campaignId: attribution.campaignId,
          messageId: attribution.messageId,
          occurredAt: now,
          visitDayKey: dayKey,
          verificationType: input.verificationType,
          attributionType: attribution.attributionType,
          isReturn,
          presenceChallengeId: input.presenceChallengeId ?? null,
        },
      });

      return { created: true, visit, isReturn };
    });
  }

  private async resolveVisitAttribution(
    tx: Prisma.TransactionClient,
    input: RegisterVisitInput,
    isReturn: boolean,
    now: Date,
  ): Promise<AttributionResult> {
    if (input.forced) {
      return {
        attributionType: input.forced.attributionType,
        messageId: input.forced.messageId ?? null,
        campaignId: input.forced.campaignId ?? null,
      };
    }

    if (!input.attribute || !isReturn) {
      return {
        attributionType: VisitAttributionType.organic,
        messageId: null,
        campaignId: null,
      };
    }

    const windowStart = new Date(
      now.getTime() - CHECKIN_ATTRIBUTION_WINDOW_DAYS * 86_400_000,
    );
    // Candidates = real outreach (a campaign message or a retention send).
    // The plain first-visit review request (no campaign, no retention send) is
    // intentionally excluded so a return is never miscredited to it.
    const candidates: CandidateMessage[] = await tx.message.findMany({
      where: {
        businessId: input.businessId,
        customerId: input.customerId,
        status: { in: SENT_STATUSES },
        sentAt: { gte: windowStart, lte: now },
        OR: [{ campaignId: { not: null } }, { retentionSends: { some: {} } }],
      },
      select: { id: true, campaignId: true, sentAt: true, clickedAt: true },
    });

    return resolveAttribution(candidates);
  }

  /**
   * Records a benefit redemption as a visit. Redemption is authoritative
   * evidence, so this never dedup-rejects: if the customer already has a visit
   * today it is UPGRADED to confirmed_redemption (no duplicate); otherwise a new
   * confirmed_redemption visit is created. Advisory-locked like registerVisit.
   */
  async registerRedemptionVisit(input: {
    businessId: string;
    customerId: string;
    timezone: string;
    benefitId: string;
    participationId: string;
    now?: Date;
  }): Promise<Visit> {
    const now = input.now ?? new Date();
    const dayKey = localDayKey(now, input.timezone);
    const lockKey = `${input.businessId}:${input.customerId}`;
    const redemptionMeta = {
      redemption: {
        benefitId: input.benefitId,
        participationId: input.participationId,
      },
    };

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`,
      );

      const todays = await tx.visit.findFirst({
        where: {
          businessId: input.businessId,
          customerId: input.customerId,
          visitDayKey: dayKey,
        },
        orderBy: { occurredAt: 'desc' },
      });

      if (todays) {
        const prevMeta =
          todays.metadata && typeof todays.metadata === 'object'
            ? (todays.metadata as Record<string, unknown>)
            : {};
        return tx.visit.update({
          where: { id: todays.id },
          data: {
            attributionType: VisitAttributionType.confirmed_redemption,
            verificationType: VisitVerificationType.benefit_redemption,
            metadata: { ...prevMeta, ...redemptionMeta },
          },
        });
      }

      const priorCount = await tx.visit.count({
        where: { businessId: input.businessId, customerId: input.customerId },
      });
      return tx.visit.create({
        data: {
          businessId: input.businessId,
          customerId: input.customerId,
          occurredAt: now,
          visitDayKey: dayKey,
          verificationType: VisitVerificationType.benefit_redemption,
          attributionType: VisitAttributionType.confirmed_redemption,
          isReturn: priorCount > 0,
          metadata: redemptionMeta,
        },
      });
    });
  }

  countByCustomer(businessId: string, customerId: string): Promise<number> {
    return this.prisma.visit.count({ where: { businessId, customerId } });
  }

  findLastByCustomer(businessId: string, customerId: string) {
    return this.prisma.visit.findFirst({
      where: { businessId, customerId },
      orderBy: { occurredAt: 'desc' },
      select: { id: true, occurredAt: true },
    });
  }
}
