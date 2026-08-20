import { Injectable } from '@nestjs/common';
import { BenefitIssuanceSource } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const MS_PER_DAY = 86_400_000;

export interface VisitTrendWindow {
  days: 7 | 30 | 90;
  current: number;
  previous: number;
}

export interface VisitTimingSlot {
  /** 0 = domingo … 6 = sábado, en la zona horaria del negocio. */
  weekday: number;
  /** Hora local, 0–23. */
  hour: number;
  count: number;
}

export interface PromotionStatsRow {
  campaignId: string;
  createdAt: Date;
  benefitTitle: string | null;
  sentCount: number;
  benefitsIssued: number;
  benefitsRedeemed: number;
}

export interface BenefitIssuanceStatsRow {
  source: BenefitIssuanceSource;
  issued: number;
  redeemed: number;
}

export interface StampCardImpactStats {
  participants: { total: number; returning: number };
  nonParticipants: { total: number; returning: number };
}

/**
 * Agregaciones nuevas para Insights — todas sobre tablas que ya existen
 * (`Visit`, `BenefitParticipation`, `ManualCampaign`, `CustomerRewardGoal`),
 * nada de schema nuevo. Todo escopeado por `businessId` recibido, nunca
 * derivado de otra fuente que no sea la sesión del caller.
 */
@Injectable()
export class InsightsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tendencia de visitas: cada ventana vs. la ventana inmediatamente
   * anterior de la misma duración (últimos 7 días vs. los 7 previos, etc).
   */
  async getVisitTrend(
    businessId: string,
    now: Date = new Date(),
  ): Promise<VisitTrendWindow[]> {
    const windows: Array<7 | 30 | 90> = [7, 30, 90];
    return Promise.all(
      windows.map(async (days) => {
        const currentStart = new Date(now.getTime() - days * MS_PER_DAY);
        const previousStart = new Date(now.getTime() - 2 * days * MS_PER_DAY);
        const [current, previous] = await Promise.all([
          this.prisma.visit.count({
            where: { businessId, occurredAt: { gte: currentStart, lte: now } },
          }),
          this.prisma.visit.count({
            where: {
              businessId,
              occurredAt: { gte: previousStart, lt: currentStart },
            },
          }),
        ]);
        return { days, current, previous };
      }),
    );
  }

  /**
   * Distribución de visitas por día de semana + hora, en la zona horaria
   * del negocio (no UTC — "los viernes 17-20h" tiene que ser una hora
   * local real). Se trae `occurredAt` de una ventana razonable y se
   * bucketea en memoria: el volumen de un negocio (cientos/miles de
   * visitas) hace esto mucho más simple que un `GROUP BY` con `AT TIME
   * ZONE` dinámico por negocio en SQL crudo.
   */
  async getVisitTimingDistribution(
    businessId: string,
    timezone: string,
    days = 90,
    now: Date = new Date(),
  ): Promise<VisitTimingSlot[]> {
    const since = new Date(now.getTime() - days * MS_PER_DAY);
    const visits = await this.prisma.visit.findMany({
      where: { businessId, occurredAt: { gte: since } },
      select: { occurredAt: true },
    });

    const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    });
    const hourFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const counts = new Map<string, number>();
    for (const visit of visits) {
      const weekdayLabel = weekdayFormatter.format(visit.occurredAt);
      const weekday = WEEKDAYS.indexOf(weekdayLabel);
      // `hour: 'numeric', hour12: false` puede devolver "24" para
      // medianoche en algunos locales — se normaliza a 0.
      const hour = Number(hourFormatter.format(visit.occurredAt)) % 24;
      const key = `${weekday}-${hour}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return Array.from(counts.entries()).map(([key, count]) => {
      const [weekday, hour] = key.split('-').map(Number);
      return { weekday, hour, count };
    });
  }

  /**
   * Rendimiento de promociones manuales: por cada `ManualCampaign`, cuántos
   * envíos tuvo y cuántas de las emisiones de Benefit que generó (por
   * `campaignId`, agregado en la tanda de emisiones múltiples) terminaron
   * canjeadas.
   */
  async getPromotionStats(businessId: string): Promise<PromotionStatsRow[]> {
    const campaigns = await this.prisma.manualCampaign.findMany({
      where: { businessId },
      select: { id: true, createdAt: true, sentCount: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    if (campaigns.length === 0) return [];

    const campaignIds = campaigns.map((c) => c.id);
    const [issuedRows, redeemedRows, titleRows] = await Promise.all([
      this.prisma.benefitParticipation.groupBy({
        by: ['campaignId'],
        where: {
          campaignId: { in: campaignIds },
          source: BenefitIssuanceSource.PROMOTION,
        },
        _count: { _all: true },
      }),
      this.prisma.benefitParticipation.groupBy({
        by: ['campaignId'],
        where: {
          campaignId: { in: campaignIds },
          source: BenefitIssuanceSource.PROMOTION,
          redeemedAt: { not: null },
        },
        _count: { _all: true },
      }),
      // Un título representativo por campaña — todas las emisiones de una
      // misma campaña comparten el mismo Benefit.
      this.prisma.benefitParticipation.findMany({
        where: {
          campaignId: { in: campaignIds },
          source: BenefitIssuanceSource.PROMOTION,
        },
        select: { campaignId: true, benefitTitleSnapshot: true },
        distinct: ['campaignId'],
      }),
    ]);

    const issuedMap = new Map(
      issuedRows.map((r) => [r.campaignId, r._count._all]),
    );
    const redeemedMap = new Map(
      redeemedRows.map((r) => [r.campaignId, r._count._all]),
    );
    const titleMap = new Map(
      titleRows.map((r) => [r.campaignId, r.benefitTitleSnapshot]),
    );

    return campaigns.map((c) => ({
      campaignId: c.id,
      createdAt: c.createdAt,
      benefitTitle: titleMap.get(c.id) ?? null,
      sentCount: c.sentCount,
      benefitsIssued: issuedMap.get(c.id) ?? 0,
      benefitsRedeemed: redeemedMap.get(c.id) ?? 0,
    }));
  }

  /** Emisión/canje de Benefits, agrupado por origen (promoción, bienvenida, etc). */
  async getBenefitIssuanceStats(
    businessId: string,
  ): Promise<BenefitIssuanceStatsRow[]> {
    const [issuedRows, redeemedRows] = await Promise.all([
      this.prisma.benefitParticipation.groupBy({
        by: ['source'],
        where: { businessId },
        _count: { _all: true },
      }),
      this.prisma.benefitParticipation.groupBy({
        by: ['source'],
        where: { businessId, redeemedAt: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const redeemedMap = new Map(
      redeemedRows.map((r) => [r.source, r._count._all]),
    );
    return issuedRows.map((r) => ({
      source: r.source,
      issued: r._count._all,
      redeemed: redeemedMap.get(r.source) ?? 0,
    }));
  }

  /**
   * "¿Los clientes con tarjeta de sellos vuelven más?" — tasa de retorno
   * (visitCount >= 2) comparando clientes que alguna vez tuvieron una
   * tarjeta (`CustomerRewardGoal`) contra los que nunca tuvieron una.
   */
  async getStampCardImpactStats(
    businessId: string,
  ): Promise<StampCardImpactStats> {
    const [customers, goalCustomerRows, visitCountRows] = await Promise.all([
      this.prisma.customer.findMany({
        where: { businessId },
        select: { id: true },
      }),
      this.prisma.customerRewardGoal.groupBy({
        by: ['customerId'],
        where: { businessId },
      }),
      this.prisma.visit.groupBy({
        by: ['customerId'],
        where: { businessId },
        _count: { _all: true },
      }),
    ]);

    const participantIds = new Set(goalCustomerRows.map((r) => r.customerId));
    const visitCountByCustomer = new Map(
      visitCountRows.map((r) => [r.customerId, r._count._all]),
    );

    const stats: StampCardImpactStats = {
      participants: { total: 0, returning: 0 },
      nonParticipants: { total: 0, returning: 0 },
    };

    for (const customer of customers) {
      const visits = visitCountByCustomer.get(customer.id) ?? 0;
      const returning = visits >= 2;
      const bucket = participantIds.has(customer.id)
        ? stats.participants
        : stats.nonParticipants;
      bucket.total += 1;
      if (returning) bucket.returning += 1;
    }

    return stats;
  }
}
