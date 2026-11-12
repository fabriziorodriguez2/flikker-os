import { Injectable } from '@nestjs/common';
import {
  IntelligencePlanStatus,
  Prisma,
  RetentionExperimentStatus,
  RetentionObjective,
  RetentionStrategyType,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PolicyGateService } from '../../policy/policy-gate.service';
import { planExecutionAllowed } from '../../policy/plan-execution';
import { RetentionAssignmentService } from '../../retention-v2/retention-assignment.service';
import { computeVisitFrequency } from '../../retention-v2/visit-frequency';
import type { AuthorizedIncentive } from './commercial-plan';
import type { BusinessSnapshot } from './business-snapshot';
import type { SubmittedPlan } from './planner-evaluation';
import {
  MIN_PLAN_RECIPIENTS,
  SMALL_SAMPLE_RECIPIENTS,
} from './planner-evaluation';

const MS_PER_DAY = 86_400_000;

export type ExecutionOutcome =
  | {
      status: 'EXECUTING';
      assigned: number;
      experimentId: string;
      exploratory: boolean;
    }
  | { status: 'BLOCKED'; code: string; messages: string[] };

/**
 * Convierte un plan elegido y validado en un experimento de Autopilot: grupo
 * de control, una variante por enfoque (con su texto validado e incentivo
 * autorizado) y las asignaciones del grupo. Desde ahí, el envío, el horario,
 * los reintentos, el consentimiento por mensaje y la medición son los de
 * Autopilot: un solo motor manda campañas.
 *
 * Antes de crear nada vuelve a preguntar: ¿está autorizada la ejecución? ¿la
 * política deja este envío (presupuesto, topes, frecuencia, pausa)?
 */
@Injectable()
export class PlanExecutorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gate: PolicyGateService,
    private readonly assignments: RetentionAssignmentService,
  ) {}

  async execute(input: {
    businessId: string;
    runId: string;
    planId: string;
    plan: SubmittedPlan;
    recipientIds: string[];
    incentives: ReadonlyMap<string, AuthorizedIncentive>;
    snapshot: BusinessSnapshot;
    now: Date;
  }): Promise<ExecutionOutcome> {
    const { businessId, plan, now } = input;
    if (!(await planExecutionAllowed(this.prisma, businessId))) {
      return {
        status: 'BLOCKED',
        code: 'EXECUTION_NOT_AUTHORIZED',
        messages: [
          'La ejecución de planes no está autorizada para este negocio.',
        ],
      };
    }

    const used = plan.variants
      .map((v) => (v.incentiveId ? input.incentives.get(v.incentiveId) : null))
      .filter((i): i is AuthorizedIncentive => Boolean(i));
    const unitCosts = used
      .map((i) => i.unitCost)
      .filter((c): c is number => typeof c === 'number');
    // Sin presupuesto, solo pasan si TODOS los premios del plan son de costo
    // cero verificable.
    const zeroCostVerified = used.every((i) => i.zeroCost === true);
    const { decision } = await this.gate.evaluate({
      businessId,
      effect: {
        source: 'AUTOPILOT',
        actorRole: null,
        kind: 'MESSAGE',
        createsCampaign: true,
        candidateCustomerIds: input.recipientIds,
        // Peor caso: el incentivo más caro del plan para todos.
        incentive: unitCosts.length
          ? { unitCost: Math.max(...unitCosts), zeroCostVerified }
          : null,
      },
      now,
    });
    // El horario lo resuelve el envío (reintenta dentro de la ventana).
    const blockers = decision.blockers.filter(
      (b) => b.code !== 'OUTSIDE_SENDING_WINDOW',
    );
    if (blockers.length) {
      return {
        status: 'BLOCKED',
        code: 'POLICY_BLOCKED',
        messages: [...new Set(blockers.map((b) => b.message))],
      };
    }
    const eligible = decision.eligibleCustomerIds;
    if (eligible.length < MIN_PLAN_RECIPIENTS) {
      return {
        status: 'BLOCKED',
        code: 'TOO_SMALL_AFTER_POLICY',
        messages: [
          'Ningún cliente del plan se puede contactar hoy: todos recibieron una promoción hace poco o ya no tienen WhatsApp autorizado.',
        ],
      };
    }

    const experiment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.retentionExperiment.create({
        data: {
          businessId,
          name: `Intelligence: ${plan.title}`.slice(0, 120),
          objective: RetentionObjective.INTELLIGENCE_PLAN,
          segment: null,
          status: RetentionExperimentStatus.RUNNING,
          startAt: now,
          attributionWindowDays: plan.successMetric.windowDays,
          minimumSampleSize: 30,
          controlPercent: plan.controlPercent,
          intelligencePlanId: input.planId,
        },
        select: { id: true },
      });
      await tx.retentionVariant.create({
        data: {
          experimentId: created.id,
          businessId,
          name: 'Control (no recibe nada)',
          strategyType: RetentionStrategyType.CONTROL,
          allocationPercent: plan.controlPercent,
        },
      });
      for (const v of plan.variants) {
        await tx.retentionVariant.create({
          data: {
            experimentId: created.id,
            businessId,
            name: `Variante ${v.key}`,
            strategyType: v.incentiveId
              ? RetentionStrategyType.SOFT_BENEFIT
              : RetentionStrategyType.REMINDER,
            incentiveDefinitionId: v.incentiveId,
            allocationPercent: v.weightPercent,
            messageTemplate: v.message,
          },
        });
      }
      return created;
    });

    const visits = await this.prisma.visit.findMany({
      where: { businessId, customerId: { in: eligible } },
      select: { customerId: true, occurredAt: true },
    });
    const visitsBy = new Map<string, Date[]>();
    for (const v of visits) {
      const list = visitsBy.get(v.customerId) ?? [];
      list.push(v.occurredAt);
      visitsBy.set(v.customerId, list);
    }
    // Exploratoria (1 a 4 clientes): un grupo de control de 0 o 1 persona no
    // permite comparar nada, así que todos reciben el mensaje y la medición
    // registra solo lo observado (ver `measurePlan`, evidencia OBSERVED_ONLY).
    const exploratory = eligible.length < SMALL_SAMPLE_RECIPIENTS;
    let assigned = 0;
    for (const customerId of eligible) {
      const outcome = await this.assignments.assign({
        experimentId: experiment.id,
        businessId,
        customerId,
        segment: input.snapshot.features.get(customerId)!.segment,
        frequency: computeVisitFrequency(visitsBy.get(customerId) ?? [], now),
        autonomousRunId: input.runId,
        ...(exploratory
          ? { excludeStrategies: [RetentionStrategyType.CONTROL] }
          : {}),
      });
      if (outcome.status === 'assigned') assigned += 1;
    }

    await this.prisma.intelligencePlan.update({
      where: { id: input.planId },
      data: {
        status: IntelligencePlanStatus.EXECUTING,
        executedAt: now,
        measureUntil: new Date(
          now.getTime() +
            (plan.schedule.sendWithinDays + plan.successMetric.windowDays) *
              MS_PER_DAY,
        ),
        results: {
          assigned,
          recipients: eligible.length,
          exploratory,
        } as Prisma.InputJsonValue,
      },
    });
    return {
      status: 'EXECUTING',
      assigned,
      experimentId: experiment.id,
      exploratory,
    };
  }
}
