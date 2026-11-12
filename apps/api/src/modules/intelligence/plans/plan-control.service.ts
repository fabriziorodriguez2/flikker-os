import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IntelligencePlanStatus,
  Prisma,
  RetentionAssignmentStatus,
  RetentionExperimentStatus,
  RetentionStrategyType,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PolicyGateService } from '../../policy/policy-gate.service';
import { planExecutionAllowed } from '../../policy/plan-execution';
import {
  estimateIncentiveCost,
  isVerifiedZeroCost,
} from '../../retention-v2/incentive-cost';

/** Un plan que todavía puede mandar algo. */
const ACTIVE: IntelligencePlanStatus[] = [
  IntelligencePlanStatus.EXECUTING,
  IntelligencePlanStatus.MEASURING,
];

export const PLAN_CONTROL_ACTIONS = {
  PAUSED: 'INTELLIGENCE_PLAN_PAUSED',
  RESUMED: 'INTELLIGENCE_PLAN_RESUMED',
  CANCELLED: 'INTELLIGENCE_PLAN_CANCELLED',
} as const;

export const CANCELLED_BY_OWNER = 'CANCELLED_BY_OWNER';

interface LoadedPlan {
  id: string;
  status: IntelligencePlanStatus;
  experiment: { id: string; status: RetentionExperimentStatus } | null;
}

export interface PlanControlEvent {
  action: 'PAUSED' | 'RESUMED' | 'CANCELLED';
  at: Date;
  /** Quién lo hizo: nombre para mostrar (nunca vacío si hay usuario). */
  by: { id: string; name: string } | null;
}

/**
 * Pausar, reanudar y cancelar UNA campaña de Intelligence, sin tocar las
 * demás ni el botón global de emergencia (`BusinessPolicy.paused`).
 *
 * - Pausar: el experimento pasa a PAUSED. Lo ya enviado queda como está; lo
 *   pendiente no sale (ni se recluta, ni se crea el mensaje, ni se despacha
 *   uno ya encolado) hasta reanudar.
 * - Reanudar: se revalida contra la política de hoy (ejecución autorizada,
 *   consentimiento, frecuencia, presupuestos). Si algo bloquea, sigue
 *   pausada y se dice por qué; quien ya no se puede contactar queda afuera.
 * - Cancelar: lo pendiente no sale nunca y el plan se cierra. Lo enviado no
 *   se deshace y se sigue midiendo con lo que hay.
 *
 * Cada acción queda en el AuditLog, con quién y cuándo, en la misma
 * transacción que el cambio: no hay cambio sin registro.
 */
@Injectable()
export class PlanControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gate: PolicyGateService,
  ) {}

  async pause(businessId: string, planId: string, userId: string) {
    const plan = await this.load(businessId, planId);
    const experiment = this.activeExperiment(plan);
    if (experiment.status === RetentionExperimentStatus.PAUSED) {
      throw new ConflictException('La campaña ya está pausada.');
    }
    const pending = await this.pendingCount(experiment.id);
    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.retentionExperiment.updateMany({
        where: { id: experiment.id, status: RetentionExperimentStatus.RUNNING },
        data: { status: RetentionExperimentStatus.PAUSED },
      });
      if (moved.count === 0) {
        throw new ConflictException('La campaña cambió de estado: recargá.');
      }
      await this.audit(tx, businessId, plan.id, userId, 'PAUSED', {
        pending,
      });
    });
    return this.state(businessId, plan.id);
  }

  async resume(
    businessId: string,
    planId: string,
    userId: string,
    now: Date = new Date(),
  ) {
    const plan = await this.load(businessId, planId);
    const experiment = this.activeExperiment(plan);
    if (experiment.status !== RetentionExperimentStatus.PAUSED) {
      throw new ConflictException('La campaña no está pausada.');
    }
    if (!(await planExecutionAllowed(this.prisma, businessId))) {
      throw new BadRequestException(
        'La ejecución de planes no está autorizada para este negocio: la campaña sigue pausada.',
      );
    }

    // Revalidar lo que falta mandar, contra la política de hoy. El lugar en
    // el alcance semanal ya se contó al aprobar la campaña.
    const pending = await this.prisma.retentionAssignment.findMany({
      where: {
        experimentId: experiment.id,
        status: RetentionAssignmentStatus.PENDING,
        variant: { strategyType: { not: RetentionStrategyType.CONTROL } },
      },
      select: { id: true, customerId: true },
    });
    let excluded: { customerId: string; reason: string }[] = [];
    if (pending.length > 0) {
      const { decision } = await this.gate.evaluate({
        businessId,
        effect: {
          source: 'AUTOPILOT',
          actorRole: null,
          kind: 'MESSAGE',
          createsCampaign: false,
          candidateCustomerIds: pending.map((a) => a.customerId),
          incentive: await this.worstIncentive(businessId, experiment.id),
          authorizedCampaign: true,
        },
        now,
      });
      // El horario lo resuelve el envío; "nadie elegible" no frena: se
      // reanuda y lo pendiente queda afuera con su motivo.
      const blockers = decision.blockers.filter(
        (b) =>
          b.code !== 'OUTSIDE_SENDING_WINDOW' &&
          b.code !== 'NO_ELIGIBLE_RECIPIENTS',
      );
      if (blockers.length > 0) {
        throw new BadRequestException({
          message: `No se puede reanudar: ${[...new Set(blockers.map((b) => b.message))].join(' ')} La campaña sigue pausada.`,
          blockers,
        });
      }
      excluded = decision.excluded;
    }

    const byReason: Record<string, number> = {};
    for (const e of excluded) byReason[e.reason] = (byReason[e.reason] ?? 0) + 1;

    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.retentionExperiment.updateMany({
        where: { id: experiment.id, status: RetentionExperimentStatus.PAUSED },
        data: { status: RetentionExperimentStatus.RUNNING },
      });
      if (moved.count === 0) {
        throw new ConflictException('La campaña cambió de estado: recargá.');
      }
      for (const [reason, ids] of groupBy(excluded)) {
        await tx.retentionAssignment.updateMany({
          where: {
            experimentId: experiment.id,
            status: RetentionAssignmentStatus.PENDING,
            customerId: { in: ids },
          },
          data: {
            status: RetentionAssignmentStatus.SKIPPED,
            skipReason: `RESUME_${reason}`,
          },
        });
      }
      await this.audit(tx, businessId, plan.id, userId, 'RESUMED', {
        pending: pending.length,
        excluded: byReason,
      });
    });
    return this.state(businessId, plan.id);
  }

  async cancel(
    businessId: string,
    planId: string,
    userId: string,
    now: Date = new Date(),
  ) {
    const plan = await this.load(businessId, planId);
    const experiment = this.activeExperiment(plan);
    await this.prisma.$transaction(async (tx) => {
      const closed = await tx.retentionExperiment.updateMany({
        where: {
          id: experiment.id,
          status: {
            in: [
              RetentionExperimentStatus.RUNNING,
              RetentionExperimentStatus.PAUSED,
            ],
          },
        },
        data: { status: RetentionExperimentStatus.COMPLETED, endAt: now },
      });
      if (closed.count === 0) {
        throw new ConflictException('La campaña cambió de estado: recargá.');
      }
      // Solo lo que no salió: lo enviado no se toca.
      const skipped = await tx.retentionAssignment.updateMany({
        where: {
          experimentId: experiment.id,
          status: RetentionAssignmentStatus.PENDING,
        },
        data: {
          status: RetentionAssignmentStatus.SKIPPED,
          skipReason: 'PLAN_CANCELLED',
        },
      });
      await tx.intelligencePlan.update({
        where: { id: plan.id },
        data: {
          status: IntelligencePlanStatus.STOPPED,
          stopReason: CANCELLED_BY_OWNER,
          completedAt: now,
        },
      });
      await this.audit(tx, businessId, plan.id, userId, 'CANCELLED', {
        skippedPending: skipped.count,
      });
    });
    return this.state(businessId, plan.id);
  }

  /**
   * Para las vistas: si cada plan está pausado y su historial de acciones
   * (quién y cuándo), de más reciente a más viejo.
   */
  async controlState(
    businessId: string,
    planIds: string[],
  ): Promise<Map<string, { paused: boolean; events: PlanControlEvent[] }>> {
    const result = new Map<
      string,
      { paused: boolean; events: PlanControlEvent[] }
    >();
    if (planIds.length === 0) return result;
    const [experiments, logs] = await Promise.all([
      this.prisma.retentionExperiment.findMany({
        where: { businessId, intelligencePlanId: { in: planIds } },
        select: { intelligencePlanId: true, status: true },
      }),
      this.prisma.auditLog.findMany({
        where: {
          businessId,
          entityType: 'IntelligencePlan',
          entityId: { in: planIds },
          action: { in: Object.values(PLAN_CONTROL_ACTIONS) },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          entityId: true,
          action: true,
          createdAt: true,
          actor: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
    ]);
    for (const id of planIds) result.set(id, { paused: false, events: [] });
    for (const e of experiments) {
      const entry = result.get(e.intelligencePlanId!);
      if (entry)
        entry.paused = e.status === RetentionExperimentStatus.PAUSED;
    }
    for (const log of logs) {
      const entry = result.get(log.entityId!);
      if (!entry) continue;
      entry.events.push({
        action: log.action.replace(
          'INTELLIGENCE_PLAN_',
          '',
        ) as PlanControlEvent['action'],
        at: log.createdAt,
        by: log.actor
          ? {
              id: log.actor.id,
              name:
                `${log.actor.firstName} ${log.actor.lastName}`.trim() ||
                log.actor.email,
            }
          : null,
      });
    }
    return result;
  }

  private async state(businessId: string, planId: string) {
    const plan = await this.prisma.intelligencePlan.findFirstOrThrow({
      where: { id: planId, businessId },
      select: { id: true, status: true, stopReason: true },
    });
    const control = (await this.controlState(businessId, [planId])).get(
      planId,
    )!;
    return { ...plan, ...control };
  }

  private async load(businessId: string, planId: string): Promise<LoadedPlan> {
    const plan = await this.prisma.intelligencePlan.findFirst({
      where: { id: planId, businessId },
      select: {
        id: true,
        status: true,
        experiment: { select: { id: true, status: true } },
      },
    });
    // Mismo 404 para "no existe" y "es de otro negocio".
    if (!plan) throw new NotFoundException('Campaña no encontrada');
    return plan;
  }

  private activeExperiment(plan: LoadedPlan) {
    if (
      !ACTIVE.includes(plan.status) ||
      !plan.experiment ||
      plan.experiment.status === RetentionExperimentStatus.COMPLETED
    ) {
      throw new ConflictException(
        'La campaña ya terminó o no se ejecutó: no hay nada que pausar, reanudar ni cancelar.',
      );
    }
    return plan.experiment;
  }

  private pendingCount(experimentId: string) {
    return this.prisma.retentionAssignment.count({
      where: { experimentId, status: RetentionAssignmentStatus.PENDING },
    });
  }

  /** El premio más caro de la campaña, como lo cuenta la política al ejecutar. */
  private async worstIncentive(businessId: string, experimentId: string) {
    const [variants, settings] = await Promise.all([
      this.prisma.retentionVariant.findMany({
        where: { experimentId, incentiveDefinitionId: { not: null } },
        select: {
          incentiveDefinition: {
            select: {
              estimatedCost: true,
              percentageValue: true,
              fixedValue: true,
            },
          },
        },
      }),
      this.prisma.retentionSettings.findUnique({
        where: { businessId },
        select: { averageTicketAmount: true },
      }),
    ]);
    const definitions = variants
      .map((v) => v.incentiveDefinition)
      .filter((d): d is NonNullable<typeof d> => d !== null);
    if (definitions.length === 0) return null;
    const costs = definitions.map(
      (d) =>
        estimateIncentiveCost(d, settings?.averageTicketAmount ?? null)?.cost ??
        null,
    );
    return {
      unitCost: costs.includes(null) ? null : Math.max(...(costs as number[])),
      zeroCostVerified: definitions.every((d) => isVerifiedZeroCost(d)),
    };
  }

  private audit(
    tx: Prisma.TransactionClient,
    businessId: string,
    planId: string,
    userId: string,
    action: keyof typeof PLAN_CONTROL_ACTIONS,
    metadata: Record<string, unknown>,
  ) {
    return tx.auditLog.create({
      data: {
        businessId,
        actorUserId: userId,
        action: PLAN_CONTROL_ACTIONS[action],
        entityType: 'IntelligencePlan',
        entityId: planId,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }
}

function groupBy(
  rows: { customerId: string; reason: string }[],
): [string, string[]][] {
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const list = map.get(r.reason) ?? [];
    list.push(r.customerId);
    map.set(r.reason, list);
  }
  return [...map];
}
