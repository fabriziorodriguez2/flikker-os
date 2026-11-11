import { Injectable, Logger } from '@nestjs/common';
import {
  IntelligencePlanStatus,
  MessageStatus,
  Prisma,
  RetentionAssignmentStatus,
  RetentionExperimentStatus,
  RetentionStrategyType,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../../common/services/audit.service';
import { estimateIncentiveCost } from '../../retention-v2/incentive-cost';
import type { CommercialPlan } from './commercial-plan';
import { measurePlan, type PlanResults } from './plan-results';

/**
 * Seguimiento diario de los planes ejecutados: mide, aplica las condiciones
 * de corte y cierra los que terminaron. Corre en el job diario de Autopilot.
 * Los resultados quedan en el plan y vuelven al planificador como memoria.
 */
@Injectable()
export class PlanMeasurementService {
  private readonly logger = new Logger(PlanMeasurementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async refreshAll(now: Date = new Date(), onlyBusinessIds?: string[]) {
    const plans = await this.prisma.intelligencePlan.findMany({
      where: {
        status: {
          in: [
            IntelligencePlanStatus.EXECUTING,
            IntelligencePlanStatus.MEASURING,
          ],
        },
        ...(onlyBusinessIds ? { businessId: { in: onlyBusinessIds } } : {}),
      },
      select: { id: true },
    });
    let updated = 0;
    for (const { id } of plans) {
      try {
        await this.refresh(id, now);
        updated += 1;
      } catch (error) {
        this.logger.error(
          `Plan ${id} measurement failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return { plans: plans.length, updated };
  }

  async refresh(
    planId: string,
    now: Date = new Date(),
  ): Promise<PlanResults | null> {
    const plan = await this.prisma.intelligencePlan.findUnique({
      where: { id: planId },
      include: {
        experiment: {
          include: {
            variants: { include: { incentiveDefinition: true } },
            assignments: {
              select: {
                id: true,
                customerId: true,
                status: true,
                exposedAt: true,
                messageId: true,
                benefitParticipationId: true,
                variantId: true,
              },
            },
          },
        },
      },
    });
    if (!plan?.experiment || !plan.measureUntil) return null;
    const experiment = plan.experiment;
    const contract = plan.plan as unknown as CommercialPlan;
    const variantsById = new Map(experiment.variants.map((v) => [v.id, v]));
    const customerIds = [
      ...new Set(experiment.assignments.map((a) => a.customerId)),
    ];
    const since = experiment.startAt;

    const [
      visits,
      redemptions,
      optOutEvents,
      optedOutNow,
      messages,
      policy,
      settings,
    ] = await Promise.all([
      this.prisma.visit.findMany({
        where: {
          businessId: plan.businessId,
          customerId: { in: customerIds },
          occurredAt: { gt: since },
        },
        select: { customerId: true, occurredAt: true, messageId: true },
      }),
      this.prisma.benefitParticipation.findMany({
        where: {
          id: {
            in: experiment.assignments
              .map((a) => a.benefitParticipationId)
              .filter((id): id is string => id !== null),
          },
          redeemedAt: { not: null },
        },
        select: { id: true, redeemedAt: true },
      }),
      this.prisma.customerConsentEvent.findMany({
        where: {
          businessId: plan.businessId,
          customerId: { in: customerIds },
          channel: 'WHATSAPP',
          action: { in: ['REVOKED', 'SUPPRESSED'] },
          createdAt: { gt: since },
        },
        select: { customerId: true, createdAt: true },
      }),
      this.prisma.customer.findMany({
        where: {
          businessId: plan.businessId,
          id: { in: customerIds },
          optedOut: true,
          updatedAt: { gt: since },
        },
        select: { id: true, updatedAt: true },
      }),
      this.prisma.message.groupBy({
        by: ['status'],
        where: {
          id: {
            in: experiment.assignments
              .map((a) => a.messageId)
              .filter((id): id is string => id !== null),
          },
        },
        _count: { _all: true },
      }),
      this.prisma.businessPolicy.findUnique({
        where: { businessId: plan.businessId },
        select: { messageUnitCost: true },
      }),
      this.prisma.retentionSettings.findUnique({
        where: { businessId: plan.businessId },
        select: { averageTicketAmount: true },
      }),
    ]);

    const sentStatuses: MessageStatus[] = [
      MessageStatus.sent,
      MessageStatus.delivered,
      MessageStatus.read,
    ];
    const count = (statuses: MessageStatus[]) =>
      messages
        .filter((m) => statuses.includes(m.status))
        .reduce((s, m) => s + m._count._all, 0);

    const incentiveCostByVariant: Record<string, number> = {};
    for (const v of experiment.variants) {
      if (!v.incentiveDefinition) continue;
      const estimate = estimateIncentiveCost(
        v.incentiveDefinition,
        settings?.averageTicketAmount ?? null,
      );
      if (estimate) incentiveCostByVariant[v.name] = estimate.cost;
    }

    const results = measurePlan({
      assignments: experiment.assignments.map((a) => {
        const variant = variantsById.get(a.variantId);
        return {
          customerId: a.customerId,
          isControl: variant?.strategyType === RetentionStrategyType.CONTROL,
          variantName: variant?.name ?? 'Variante',
          status: a.status,
          exposedAt: a.exposedAt,
          messageId: a.messageId,
          benefitParticipationId: a.benefitParticipationId,
        };
      }),
      visits,
      redemptions: redemptions.map((r) => ({
        participationId: r.id,
        redeemedAt: r.redeemedAt!,
      })),
      optOuts: [
        ...optOutEvents.map((e) => ({
          customerId: e.customerId,
          at: e.createdAt,
        })),
        ...optedOutNow.map((c) => ({ customerId: c.id, at: c.updatedAt })),
      ],
      messages: {
        sent: count(sentStatuses),
        failed: count([MessageStatus.failed]),
      },
      windowDays: contract.successMetric.windowDays,
      measureUntil: plan.measureUntil,
      now,
      stopConditions: contract.stopConditions,
      costs: {
        messageUnitCost:
          policy?.messageUnitCost == null
            ? null
            : Number(policy.messageUnitCost),
        incentiveCostByVariant,
      },
    });

    let status: IntelligencePlanStatus = plan.status;
    let stopReason: string | null = null;
    if (results.stop.triggered) {
      status = IntelligencePlanStatus.STOPPED;
      stopReason = results.stop.reason;
      // Lo que no salió todavía, no sale.
      await this.prisma.retentionAssignment.updateMany({
        where: {
          experimentId: experiment.id,
          status: RetentionAssignmentStatus.PENDING,
        },
        data: {
          status: RetentionAssignmentStatus.SKIPPED,
          skipReason: 'PLAN_STOPPED',
        },
      });
      await this.prisma.retentionExperiment.update({
        where: { id: experiment.id },
        data: { status: RetentionExperimentStatus.COMPLETED, endAt: now },
      });
    } else if (results.phase === 'COMPLETED') {
      status = IntelligencePlanStatus.COMPLETED;
      await this.prisma.retentionExperiment.update({
        where: { id: experiment.id },
        data: { status: RetentionExperimentStatus.COMPLETED, endAt: now },
      });
    } else if (results.phase === 'MEASURING') {
      status = IntelligencePlanStatus.MEASURING;
    }

    await this.prisma.intelligencePlan.update({
      where: { id: plan.id },
      data: {
        status,
        results: results as unknown as Prisma.InputJsonValue,
        ...(stopReason ? { stopReason } : {}),
        ...(status === IntelligencePlanStatus.COMPLETED ||
        status === IntelligencePlanStatus.STOPPED
          ? { completedAt: now }
          : {}),
      },
    });
    if (status !== plan.status) {
      await this.audit.log({
        action: `INTELLIGENCE_PLAN_${status}`,
        entityType: 'IntelligencePlan',
        entityId: plan.id,
        userId: null,
        businessId: plan.businessId,
        metadata: { evidence: results.evidence, stopReason },
      });
    }
    return results;
  }
}
