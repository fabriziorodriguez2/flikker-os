import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AutonomousRun, AutonomyMode, ExperienceVersion } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../../common/services/audit.service';
import {
  AutonomyService,
  strategyLabel,
  type RunMetrics,
} from './autonomy.service';

/**
 * Rollout y lectura del modo autónomo. Activar PILOT (reclutar de verdad)
 * es una decisión de Flikker con confirmación explícita y prerequisitos
 * verificados acá; apagarlo lo puede hacer el dueño en cualquier momento.
 */
@Injectable()
export class AutonomyAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autonomy: AutonomyService,
    private readonly audit: AuditService,
  ) {}

  async setMode(
    businessId: string,
    adminUserId: string,
    input: {
      mode: AutonomyMode;
      pilotGroupSize?: number;
      confirmPilot?: boolean;
      plannerEnabled?: boolean;
    },
  ) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: {
        experienceVersion: true,
        retentionEngineV2Enabled: true,
        policy: {
          select: {
            acceptedAt: true,
            paused: true,
            messageUnitCost: true,
            autonomyMode: true,
          },
        },
      },
    });
    if (!business) throw new NotFoundException('Negocio no encontrado');
    if (input.mode !== AutonomyMode.OFF) {
      if (
        business.experienceVersion !== ExperienceVersion.CHECKIN_V2 ||
        !business.retentionEngineV2Enabled
      ) {
        throw new BadRequestException(
          'El modo autónomo usa Autopilot: el negocio tiene que estar en Check-in V2 con el motor de retención prendido.',
        );
      }
    }
    if (input.mode === AutonomyMode.PILOT) {
      const missing: string[] = [];
      if (!input.confirmPilot)
        missing.push('confirmación explícita del piloto');
      if (!business.policy?.acceptedAt) missing.push('política aceptada');
      if (business.policy?.paused) missing.push('política sin pausa');
      if (business.policy?.messageUnitCost == null) {
        missing.push('costo por mensaje');
      }
      if (missing.length > 0) {
        throw new BadRequestException(
          `Para activar el piloto falta: ${missing.join(', ')}.`,
        );
      }
    }
    const before = business.policy?.autonomyMode ?? AutonomyMode.OFF;
    const policy = await this.prisma.businessPolicy.upsert({
      where: { businessId },
      create: {
        businessId,
        autonomyMode: input.mode,
        autonomyPilotGroupSize: input.pilotGroupSize ?? 10,
        autonomyPlannerEnabled: input.plannerEnabled ?? false,
        autonomyModeSetAt: new Date(),
        autonomyModeSetByUserId: adminUserId,
      },
      update: {
        autonomyMode: input.mode,
        ...(input.pilotGroupSize !== undefined
          ? { autonomyPilotGroupSize: input.pilotGroupSize }
          : {}),
        ...(input.plannerEnabled !== undefined
          ? { autonomyPlannerEnabled: input.plannerEnabled }
          : {}),
        autonomyModeSetAt: new Date(),
        autonomyModeSetByUserId: adminUserId,
        version: { increment: 1 },
      },
    });
    await this.audit.log({
      action: 'AUTONOMY_MODE_SET',
      entityType: 'BusinessPolicy',
      entityId: policy.id,
      userId: adminUserId,
      businessId,
      metadata: {
        before,
        after: input.mode,
        pilotGroupSize: policy.autonomyPilotGroupSize,
        plannerEnabled: policy.autonomyPlannerEnabled,
      },
    });
    return {
      mode: policy.autonomyMode,
      pilotGroupSize: policy.autonomyPilotGroupSize,
      plannerEnabled: policy.autonomyPlannerEnabled,
    };
  }

  /** El dueño (o un admin) apaga el modo autónomo. Nunca lo prende. */
  async disable(businessId: string, userId: string) {
    const current = await this.prisma.businessPolicy.findUnique({
      where: { businessId },
      select: { id: true, autonomyMode: true },
    });
    if (current && current.autonomyMode !== AutonomyMode.OFF) {
      await this.prisma.businessPolicy.update({
        where: { businessId },
        data: {
          autonomyMode: AutonomyMode.OFF,
          autonomyModeSetAt: new Date(),
          autonomyModeSetByUserId: userId,
          version: { increment: 1 },
        },
      });
      await this.audit.log({
        action: 'AUTONOMY_MODE_SET',
        entityType: 'BusinessPolicy',
        entityId: current.id,
        userId,
        businessId,
        metadata: { before: current.autonomyMode, after: AutonomyMode.OFF },
      });
    }
    return this.activity(businessId);
  }

  /** "Actividad autónoma": estado, corridas recientes y su medición. */
  async activity(businessId: string, take = 30) {
    const [policy, runs] = await Promise.all([
      this.prisma.businessPolicy.findUnique({
        where: { businessId },
        select: {
          autonomyMode: true,
          autonomyPilotGroupSize: true,
          autonomyModeSetAt: true,
          autonomyPlannerEnabled: true,
          messageUnitCost: true,
        },
      }),
      this.prisma.autonomousRun.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take,
      }),
    ]);
    const metrics = await this.autonomy.metricsFor(runs.map((r) => r.id));
    const unitCost =
      policy?.messageUnitCost == null ? null : Number(policy.messageUnitCost);
    return {
      mode: policy?.autonomyMode ?? AutonomyMode.OFF,
      pilotGroupSize: policy?.autonomyPilotGroupSize ?? 10,
      modeSetAt: policy?.autonomyModeSetAt ?? null,
      plannerEnabled: policy?.autonomyPlannerEnabled ?? false,
      runs: runs.map((run) => this.runView(run, metrics.get(run.id), unitCost)),
    };
  }

  async run(businessId: string, runId: string) {
    const run = await this.prisma.autonomousRun.findFirst({
      where: { id: runId, businessId },
    });
    // Mismo 404 para "no existe" y "es de otro negocio".
    if (!run) throw new NotFoundException('Corrida no encontrada');
    const [metrics, policy, plans] = await Promise.all([
      this.autonomy.metricsFor([run.id]),
      this.prisma.businessPolicy.findUnique({
        where: { businessId },
        select: { messageUnitCost: true },
      }),
      this.prisma.intelligencePlan.findMany({
        where: { runId: run.id, businessId },
        orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    return {
      ...this.runView(
        run,
        metrics.get(run.id),
        policy?.messageUnitCost == null ? null : Number(policy.messageUnitCost),
      ),
      // Planes del planificador: la regla y los mensajes, nunca clientes.
      plans: plans.map((p) => ({
        id: p.id,
        status: p.status,
        rank: p.rank,
        title: p.title,
        objective: p.objective,
        hypothesis: p.hypothesis,
        plan: p.plan,
        issues: p.issues,
        selectionReason: p.selectionReason,
        matched: p.matched,
        reachable: p.reachable,
        simulation: p.simulation,
        estimatedCost: p.estimatedCost == null ? null : Number(p.estimatedCost),
        currency: p.currency,
      })),
    };
  }

  private runView(
    run: AutonomousRun,
    metrics: RunMetrics | undefined,
    unitCost: number | null,
  ) {
    const sent = metrics?.sent ?? 0;
    return {
      id: run.id,
      day: run.runKey,
      mode: run.mode,
      engine: run.engine,
      analysis: run.analysis,
      plannerModel: run.plannerModel,
      aiCostUsd: run.aiCostUsd == null ? null : Number(run.aiCostUsd),
      status: run.status,
      strategy: run.strategy,
      strategyLabel: strategyLabel(run.strategy),
      incentiveLevel: run.incentiveLevel,
      opportunities: run.opportunities,
      discarded: run.discarded,
      blockers: run.blockers,
      facts: run.facts,
      explanation: run.explanation,
      suggestions: run.suggestions,
      // Nunca ids de clientes: solo cuántos.
      plannedCount: run.plannedCustomerIds.length,
      assignedCount: run.assignedCount,
      estimatedCost:
        run.estimatedCost === null ? null : Number(run.estimatedCost),
      currency: run.currency,
      metrics: {
        pending: metrics?.pending ?? 0,
        sent,
        control: metrics?.control ?? 0,
        skipped: metrics?.skipped ?? 0,
        returnedTreated: metrics?.returnedTreated ?? 0,
        returnedControl: metrics?.returnedControl ?? 0,
        redeemed: metrics?.redeemed ?? 0,
        messagingCost:
          unitCost === null ? null : Math.round(sent * unitCost * 100) / 100,
      },
      createdAt: run.createdAt,
      finishedAt: run.finishedAt,
    };
  }
}
