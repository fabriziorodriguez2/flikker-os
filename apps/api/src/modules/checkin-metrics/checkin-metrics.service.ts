import { Injectable } from '@nestjs/common';
import { MessageStatus, VisitAttributionType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BenefitsRepository } from '../benefits/benefits.repository';
import {
  averageDays,
  buildRecommendations,
  ratePct,
  type FunnelCounts,
} from './checkin-metrics.rules';

const SENT_STATUSES: MessageStatus[] = [
  MessageStatus.sent,
  MessageStatus.delivered,
  MessageStatus.read,
];

@Injectable()
export class CheckinMetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly benefits: BenefitsRepository,
  ) {}

  /**
   * Retention overview for the panel. Metric names are deliberately distinct so
   * we never over-claim: "detectados" (observed returns) vs "posteriores a una
   * campaña" (temporal attribution) vs "confirmados mediante canje" (redeemed).
   */
  async getOverview(businessId: string) {
    const [retention, funnel, sources] = await Promise.all([
      this.getRetention(businessId),
      this.getFunnel(businessId),
      this.getSources(businessId),
    ]);

    // The funnel's "returns" step is the same observed-returns figure.
    const funnelCounts: FunnelCounts = {
      scanned: funnel.scanned,
      registered: funnel.registered,
      messagesSent: funnel.messagesSent,
      messagesOpened: funnel.messagesOpened,
      returns: retention.retornosDetectados,
      benefitsRedeemed: funnel.benefitsRedeemed,
    };

    return {
      retention,
      funnel: { ...funnelCounts },
      sources,
      recommendations: buildRecommendations(funnelCounts),
    };
  }

  private async getRetention(businessId: string) {
    const [
      visitas,
      retornosDetectados,
      retornosPostCampana,
      retornosConfirmados,
      customersWithVisits,
      recurringCustomers,
      firstVisitByCustomer,
      firstReturnByCustomer,
    ] = await Promise.all([
      this.prisma.visit.count({ where: { businessId } }),
      this.prisma.visit.count({ where: { businessId, isReturn: true } }),
      this.prisma.visit.count({
        where: {
          businessId,
          isReturn: true,
          attributionType: VisitAttributionType.post_campaign_checkin,
        },
      }),
      this.prisma.visit.count({
        where: {
          businessId,
          isReturn: true,
          attributionType: VisitAttributionType.confirmed_redemption,
        },
      }),
      this.prisma.visit.groupBy({
        by: ['customerId'],
        where: { businessId },
      }),
      this.prisma.visit.groupBy({
        by: ['customerId'],
        where: { businessId, isReturn: true },
      }),
      this.prisma.visit.groupBy({
        by: ['customerId'],
        where: { businessId },
        _min: { occurredAt: true },
      }),
      this.prisma.visit.groupBy({
        by: ['customerId'],
        where: { businessId, isReturn: true },
        _min: { occurredAt: true },
      }),
    ]);

    const totalWithVisits = customersWithVisits.length;
    const recurring = recurringCustomers.length;
    const clientesNuevos = Math.max(0, totalWithVisits - recurring);

    // Average days between a customer's first visit and their first return.
    const firstVisitMap = new Map<string, Date>();
    for (const row of firstVisitByCustomer) {
      if (row._min.occurredAt)
        firstVisitMap.set(row.customerId, row._min.occurredAt);
    }
    const deltas: number[] = [];
    for (const row of firstReturnByCustomer) {
      const first = firstVisitMap.get(row.customerId);
      if (first && row._min.occurredAt) {
        const delta = row._min.occurredAt.getTime() - first.getTime();
        if (delta > 0) deltas.push(delta);
      }
    }

    return {
      clientesNuevos,
      clientesRecurrentes: recurring,
      visitas,
      retornosDetectados,
      retornosPostCampana,
      retornosConfirmados,
      tasaRetorno: ratePct(recurring, totalWithVisits),
      diasPromedioHastaVolver: averageDays(deltas),
    };
  }

  private async getFunnel(businessId: string) {
    const [scannedAgg, registered, messagesSent, messagesOpened, redeemed] =
      await Promise.all([
        this.prisma.visitSource.aggregate({
          where: { businessId },
          _sum: { scannedCount: true },
        }),
        this.prisma.customer.count({ where: { businessId, origin: 'qr' } }),
        this.prisma.message.count({
          where: { businessId, status: { in: SENT_STATUSES } },
        }),
        this.prisma.message.count({
          where: { businessId, clickedAt: { not: null } },
        }),
        // Semántica única de "Benefit canjeado" — misma fuente que Inicio e
        // Insights (`BenefitsRepository.countRedeemed`), sin ventana (todo
        // el historial), igual que antes.
        this.benefits.countRedeemed(businessId),
      ]);

    return {
      scanned: scannedAgg._sum.scannedCount ?? 0,
      registered,
      messagesSent,
      messagesOpened,
      benefitsRedeemed: redeemed,
    };
  }

  private async getSources(businessId: string) {
    const [sources, grouped] = await Promise.all([
      this.prisma.visitSource.findMany({
        where: { businessId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          type: true,
          isActive: true,
          scannedCount: true,
        },
      }),
      this.prisma.visit.groupBy({
        by: ['sourceId', 'isReturn'],
        where: { businessId, sourceId: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const stats = new Map<
      string,
      { checkins: number; retornos: number; registros: number }
    >();
    for (const row of grouped) {
      if (!row.sourceId) continue;
      const entry = stats.get(row.sourceId) ?? {
        checkins: 0,
        retornos: 0,
        registros: 0,
      };
      const count = row._count._all;
      entry.checkins += count;
      if (row.isReturn) entry.retornos += count;
      else entry.registros += count;
      stats.set(row.sourceId, entry);
    }

    return sources.map((source) => {
      const s = stats.get(source.id) ?? {
        checkins: 0,
        retornos: 0,
        registros: 0,
      };
      return {
        id: source.id,
        name: source.name,
        type: source.type,
        isActive: source.isActive,
        escaneos: source.scannedCount,
        registros: s.registros,
        checkins: s.checkins,
        retornos: s.retornos,
        conversion: ratePct(s.registros, source.scannedCount),
      };
    });
  }
}
