import { Injectable, NotFoundException } from '@nestjs/common';
import { CustomerEventType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

interface ListVisitsOptions {
  sourceId?: string;
  onlyReturns?: boolean;
  limit?: number;
}

function benefitIdFromMetadata(metadata: unknown): string | null {
  if (metadata && typeof metadata === 'object') {
    const redemption = (metadata as Record<string, unknown>).redemption;
    if (redemption && typeof redemption === 'object') {
      const id = (redemption as Record<string, unknown>).benefitId;
      if (typeof id === 'string') return id;
    }
  }
  return null;
}

const EVENT_LABELS: Record<CustomerEventType, string> = {
  customer_registered: 'Registro',
  customer_session_restored: 'Sesión restaurada',
  visit_created: 'Check-in',
  visit_duplicate_prevented: 'Check-in duplicado evitado',
  benefit_viewed: 'Vio su beneficio',
  benefit_redeemed: 'Beneficio canjeado',
  review_prompt_shown: 'Se le pidió una reseña',
  review_link_clicked: 'Abrió la reseña en Google',
};

@Injectable()
export class CheckinsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Recent check-ins (visits) for the panel table, with optional filters. */
  async listVisits(businessId: string, options: ListVisitsOptions = {}) {
    const take = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const visits = await this.prisma.visit.findMany({
      where: {
        businessId,
        ...(options.sourceId ? { sourceId: options.sourceId } : {}),
        ...(options.onlyReturns ? { isReturn: true } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take,
      select: {
        id: true,
        occurredAt: true,
        isReturn: true,
        attributionType: true,
        verificationType: true,
        metadata: true,
        customer: { select: { id: true, name: true, phoneE164: true } },
        source: { select: { name: true } },
        campaign: { select: { name: true } },
      },
    });

    const benefitIds = [
      ...new Set(
        visits
          .map((v) => benefitIdFromMetadata(v.metadata))
          .filter((id): id is string => id !== null),
      ),
    ];
    const benefits = benefitIds.length
      ? await this.prisma.benefit.findMany({
          where: { id: { in: benefitIds }, businessId },
          select: { id: true, title: true },
        })
      : [];
    const titleById = new Map(benefits.map((b) => [b.id, b.title]));

    return visits.map((v) => {
      const benefitId = benefitIdFromMetadata(v.metadata);
      return {
        id: v.id,
        occurredAt: v.occurredAt.toISOString(),
        isReturn: v.isReturn,
        attributionType: v.attributionType,
        verificationType: v.verificationType,
        customer: {
          id: v.customer.id,
          name: v.customer.name,
          phone: v.customer.phoneE164,
        },
        sourceName: v.source?.name ?? null,
        campaignName: v.campaign?.name ?? null,
        benefitTitle: benefitId ? (titleById.get(benefitId) ?? null) : null,
      };
    });
  }

  /**
   * Chronological customer timeline. Built from CustomerEvents (the backbone)
   * plus Message delivery milestones, which live on Message rather than being
   * duplicated into events. Tenant-scoped by verifying the customer first.
   */
  async getTimeline(businessId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, businessId },
      select: { id: true, name: true, phoneE164: true, createdAt: true },
    });
    if (!customer) throw new NotFoundException('Cliente no encontrado');

    const [events, messages] = await Promise.all([
      this.prisma.customerEvent.findMany({
        where: { businessId, customerId },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: { type: true, createdAt: true, metadata: true },
      }),
      this.prisma.message.findMany({
        where: { businessId, customerId },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          sentAt: true,
          deliveredAt: true,
          readAt: true,
          clickedAt: true,
        },
      }),
    ]);

    const entries: { at: string; label: string }[] = [];

    for (const e of events) {
      let label = EVENT_LABELS[e.type];
      if (e.type === CustomerEventType.visit_created) {
        const meta =
          e.metadata && typeof e.metadata === 'object'
            ? (e.metadata as Record<string, unknown>)
            : {};
        if (meta.first) label = 'Primera visita';
        else if (meta.isReturn) label = 'Check-in (retorno)';
      }
      entries.push({ at: e.createdAt.toISOString(), label });
    }

    for (const m of messages) {
      if (m.sentAt)
        entries.push({ at: m.sentAt.toISOString(), label: 'Mensaje enviado' });
      if (m.deliveredAt)
        entries.push({
          at: m.deliveredAt.toISOString(),
          label: 'Mensaje entregado',
        });
      if (m.readAt)
        entries.push({ at: m.readAt.toISOString(), label: 'Mensaje leído' });
      if (m.clickedAt)
        entries.push({
          at: m.clickedAt.toISOString(),
          label: 'Abrió el link del mensaje',
        });
    }

    entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phoneE164,
      },
      entries,
    };
  }
}
