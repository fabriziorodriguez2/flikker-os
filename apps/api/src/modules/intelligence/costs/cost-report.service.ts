import { BadRequestException, Injectable } from '@nestjs/common';
import { BenefitIssuanceSource, MessageStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiConfigService } from '../../ai/ai-config.service';
import { AI_USE_CASES } from '../../ai/ai-usecases';
import { estimateIncentiveCost } from '../../retention-v2/incentive-cost';
import {
  aiCost,
  messagingCost,
  monthlyProjection,
  type AiCost,
  type MessagingCost,
} from './cost-math';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

export interface BusinessCostReport {
  businessId: string;
  businessName: string;
  ai: AiCost & { projectedMonthUsd: number | null };
  messaging: MessagingCost & { projectedMonth: number | null };
  rewards: {
    currency: string;
    issued: number;
    redeemed: number;
    /** Costo estimado de lo canjeado (lo que ya costó). */
    redeemedCost: number;
    /** Responsabilidad máxima: canjeado + todavía canjeable. */
    maxLiability: number;
    unknownCostIssuances: number;
  };
}

/**
 * Reporte de costos para Platform Admin, con telemetría real del período.
 * Solo lectura. Los días son UTC y el rango es [from, to] completo.
 */
@Injectable()
export class CostReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiConfig: AiConfigService,
  ) {}

  async report(input: { from: string; to: string; businessId?: string }) {
    if (!DAY_RE.test(input.from) || !DAY_RE.test(input.to)) {
      throw new BadRequestException('Fechas en formato AAAA-MM-DD.');
    }
    const from = new Date(`${input.from}T00:00:00.000Z`);
    const to = new Date(
      new Date(`${input.to}T00:00:00.000Z`).getTime() + MS_PER_DAY,
    );
    if (!(from < to)) throw new BadRequestException('Rango inválido.');
    const days = Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);

    const businessFilter = input.businessId
      ? { businessId: input.businessId }
      : {};
    const usage = await this.prisma.aiUsageEvent.findMany({
      where: { ...businessFilter, createdAt: { gte: from, lt: to } },
      select: {
        businessId: true,
        useCase: true,
        success: true,
        inputTokens: true,
        outputTokens: true,
        estimatedCostUsd: true,
      },
    });
    const businessIds = [...new Set(usage.map((u) => u.businessId))];
    if (input.businessId && !businessIds.includes(input.businessId)) {
      businessIds.push(input.businessId);
    }
    const prices = {
      inputPerMillionUsd: this.aiConfig.priceInputPerMillionUsd,
      outputPerMillionUsd: this.aiConfig.priceOutputPerMillionUsd,
    };

    const businesses: BusinessCostReport[] = [];
    for (const businessId of businessIds) {
      businesses.push(
        await this.forBusiness(
          businessId,
          usage.filter((u) => u.businessId === businessId),
          { from, to, days },
          prices,
        ),
      );
    }
    businesses.sort(
      (a, b) => b.ai.atCurrentPricesUsd - a.ai.atCurrentPricesUsd,
    );
    return {
      from: input.from,
      to: input.to,
      days,
      model: this.aiConfig.model,
      prices,
      note: 'IA en USD; mensajería y recompensas en la moneda de cada negocio. Nunca se suman entre sí. Las proyecciones son lo observado por día × 30, no una predicción.',
      totals: {
        aiUsd:
          Math.round(
            businesses.reduce((s, b) => s + b.ai.atCurrentPricesUsd, 0) * 1e6,
          ) / 1e6,
        agentTurns: businesses.reduce((s, b) => s + b.ai.turns, 0),
      },
      businesses,
    };
  }

  private async forBusiness(
    businessId: string,
    usage: {
      useCase: string;
      success: boolean;
      inputTokens: number | null;
      outputTokens: number | null;
      estimatedCostUsd: Prisma.Decimal | null;
    }[],
    range: { from: Date; to: Date; days: number },
    prices: { inputPerMillionUsd: number; outputPerMillionUsd: number },
  ): Promise<BusinessCostReport> {
    const window = { gte: range.from, lt: range.to };
    const [
      business,
      policy,
      settings,
      conversations,
      contacts,
      retention,
      participations,
    ] = await Promise.all([
      this.prisma.business.findUnique({
        where: { id: businessId },
        select: { name: true, currency: true },
      }),
      this.prisma.businessPolicy.findUnique({
        where: { businessId },
        select: { messageUnitCost: true },
      }),
      this.prisma.retentionSettings.findUnique({
        where: { businessId },
        select: { averageTicketAmount: true },
      }),
      this.prisma.intelligenceConversation.count({
        where: {
          businessId,
          messages: { some: { role: 'ASSISTANT', createdAt: window } },
        },
      }),
      this.prisma.manualCampaignContact.count({
        where: { businessId, status: 'sent', sentAt: window },
      }),
      this.prisma.message.count({
        where: {
          businessId,
          status: {
            in: [
              MessageStatus.sent,
              MessageStatus.delivered,
              MessageStatus.read,
            ],
          },
          sentAt: window,
          retentionAssignment: { isNot: null },
        },
      }),
      this.prisma.benefitParticipation.findMany({
        where: {
          businessId,
          source: {
            in: [
              BenefitIssuanceSource.PROMOTION,
              BenefitIssuanceSource.REACTIVATION,
            ],
          },
          createdAt: window,
        },
        select: {
          redeemedAt: true,
          expiresAt: true,
          benefit: {
            select: {
              retentionIncentiveDefinition: {
                select: {
                  estimatedCost: true,
                  percentageValue: true,
                  fixedValue: true,
                },
              },
            },
          },
          retentionAssignment: {
            select: {
              variant: {
                select: {
                  incentiveDefinition: {
                    select: {
                      estimatedCost: true,
                      percentageValue: true,
                      fixedValue: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);
    const currency = business?.currency ?? 'USD';
    const ai = aiCost(
      usage.map((u) => ({
        useCase: u.useCase,
        success: u.success,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        estimatedCostUsd:
          u.estimatedCostUsd === null ? null : Number(u.estimatedCostUsd),
      })),
      conversations,
      prices,
      AI_USE_CASES.INTELLIGENCE_AGENT_TURN,
    );
    const messaging = messagingCost(
      contacts + retention,
      policy?.messageUnitCost == null ? null : Number(policy.messageUnitCost),
      currency,
    );

    const now = new Date();
    let redeemed = 0;
    let redeemedCost = 0;
    let maxLiability = 0;
    let unknownCostIssuances = 0;
    for (const p of participations) {
      const definition =
        p.retentionAssignment?.variant.incentiveDefinition ??
        p.benefit.retentionIncentiveDefinition;
      const estimate = definition
        ? estimateIncentiveCost(
            definition,
            settings?.averageTicketAmount ?? null,
          )
        : null;
      if (!estimate) unknownCostIssuances += 1;
      const cost = estimate?.cost ?? 0;
      if (p.redeemedAt) {
        redeemed += 1;
        redeemedCost += cost;
        maxLiability += cost;
      } else if (!p.expiresAt || p.expiresAt > now) {
        maxLiability += cost;
      }
    }

    return {
      businessId,
      businessName: business?.name ?? businessId,
      ai: {
        ...ai,
        projectedMonthUsd: monthlyProjection(ai.atCurrentPricesUsd, range.days),
      },
      messaging: {
        ...messaging,
        projectedMonth: monthlyProjection(messaging.cost, range.days),
      },
      rewards: {
        currency,
        issued: participations.length,
        redeemed,
        redeemedCost: Math.round(redeemedCost * 100) / 100,
        maxLiability: Math.round(maxLiability * 100) / 100,
        unknownCostIssuances,
      },
    };
  }
}
