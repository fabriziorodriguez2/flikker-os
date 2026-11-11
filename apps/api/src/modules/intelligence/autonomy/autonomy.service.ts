import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AutonomousRun,
  AutonomousRunStatus,
  AutonomyMode,
  ExperienceVersion,
  Prisma,
  RetentionObjective,
  RetentionStrategyType,
  RewardGoalStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../../common/services/audit.service';
import { OPERATIONAL_BUSINESS_WHERE } from '../../../jobs/business-operational.guard';
import { localDayKey } from '../../../common/utils/timezone.util';
import { RetentionExperimentService } from '../../retention-v2/retention-experiment.service';
import { RetentionAssignmentService } from '../../retention-v2/retention-assignment.service';
import { computeVisitFrequency } from '../../retention-v2/visit-frequency';
import { estimateIncentiveCost } from '../../retention-v2/incentive-cost';
import { PolicyService } from '../../policy/policy.service';
import { PolicyGateService } from '../../policy/policy-gate.service';
import { PlannerService } from '../plans/planner.service';
import { loadUsage, whatsappConsent } from '../../policy/policy-usage';
import type { PolicyBlocker, PolicyEffect } from '../../policy/policy-rules';
import {
  STRATEGIES,
  chooseStrategy,
  detectOpportunities,
  explainRun,
  selectGroup,
  type CustomerFacts,
  type Discarded,
  type Opportunity,
  type PastRun,
  type RunFacts,
  type StrategyKey,
} from './autonomy-rules';

/** Una corrida RUNNING más vieja que esto se considera caída y se retoma. */
const STALE_RUN_MS = 30 * 60_000;
const MS_PER_DAY = 86_400_000;
const INCENTIVE_STRATEGIES: RetentionStrategyType[] = [
  RetentionStrategyType.SOFT_BENEFIT,
  RetentionStrategyType.STRONG_BENEFIT,
];
/**
 * Bloqueos que no frenan la planificación: la ventana horaria la resuelve
 * el despacho de Autopilot (reintenta dentro del horario), y "nadie
 * elegible" ya lo reporta la elección.
 */
const PLANNING_IGNORED = new Set(['OUTSIDE_SENDING_WINDOW']);
/** Bloqueos que se resuelven achicando el grupo. */
const SHRINKABLE = new Set([
  'WEEKLY_RECIPIENTS_LIMIT',
  'MESSAGING_BUDGET_EXCEEDED',
  'CAMPAIGN_SHARE_EXCEEDED',
]);

/** Lo que Autopilot midió de una corrida (asignaciones y resultados). */
export interface RunMetrics {
  assigned: number;
  pending: number;
  sent: number;
  control: number;
  skipped: number;
  returnedTreated: number;
  returnedControl: number;
  redeemed: number;
}

export interface AutonomyPlan {
  mode: 'DRY_RUN' | 'PILOT';
  status: 'SIMULATED' | 'EXECUTED' | 'BLOCKED' | 'NO_ACTION';
  strategy: StrategyKey | null;
  objective: RetentionObjective | null;
  incentiveLevel: number | null;
  opportunities: Omit<Opportunity, 'candidateIds' | 'segments'>[];
  discarded: Discarded[];
  blockers: PolicyBlocker[];
  facts: RunFacts;
  explanation: string;
  suggestions: string[];
  plannedCustomerIds: string[];
  /** Segmento de cada elegido, para resolver el experimento. */
  plannedSegments: Record<string, string>;
  estimatedCost: number;
  currency: string;
}

/**
 * Modo autónomo de Intelligence. Corre dentro del job de evaluación de
 * Autopilot (no hay cron propio) y solo RECLUTA: el envío, el horario, la
 * reserva de costo por mensaje y los reintentos siguen siendo de Retention
 * V2. En DRY_RUN no toca nada; en PILOT crea asignaciones etiquetadas con la
 * corrida en el experimento de Autopilot que ya existe.
 */
@Injectable()
export class AutonomyService {
  private readonly logger = new Logger(AutonomyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: PolicyService,
    private readonly gate: PolicyGateService,
    private readonly experiments: RetentionExperimentService,
    private readonly assignments: RetentionAssignmentService,
    private readonly audit: AuditService,
    private readonly planner: PlannerService,
  ) {}

  /** Todos los negocios con el modo autónomo prendido. Uno roto no frena al resto. */
  async runForAll(now: Date = new Date()) {
    const rows = await this.prisma.businessPolicy.findMany({
      where: {
        autonomyMode: { not: AutonomyMode.OFF },
        business: {
          ...OPERATIONAL_BUSINESS_WHERE,
          experienceVersion: ExperienceVersion.CHECKIN_V2,
          retentionEngineV2Enabled: true,
        },
      },
      select: { businessId: true },
    });
    const runs: AutonomousRun[] = [];
    for (const { businessId } of rows) {
      try {
        const run = await this.runForBusiness(businessId, now);
        if (run) runs.push(run);
      } catch (error) {
        this.logger.error(
          `Autonomy run failed for ${businessId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return { businesses: rows.length, runs: runs.length };
  }

  /**
   * Una corrida por negocio y día local. Un doble cron o un reintento del
   * mismo día devuelven la corrida existente; una que quedó RUNNING por una
   * caída se retoma (las asignaciones son únicas, así que retomar nunca
   * duplica a nadie).
   */
  async runForBusiness(
    businessId: string,
    now: Date = new Date(),
  ): Promise<AutonomousRun | null> {
    const [business, policy] = await Promise.all([
      this.prisma.business.findUnique({
        where: { id: businessId },
        select: { timezone: true },
      }),
      this.prisma.businessPolicy.findUnique({
        where: { businessId },
        select: {
          autonomyMode: true,
          autonomyPilotGroupSize: true,
          autonomyPlannerEnabled: true,
        },
      }),
    ]);
    if (!business || !policy || policy.autonomyMode === AutonomyMode.OFF) {
      return null;
    }
    const mode = policy.autonomyMode;
    const runKey = localDayKey(now, business.timezone);

    const run = await this.claim(businessId, runKey, mode, now);
    if (!run) {
      return this.prisma.autonomousRun.findUnique({
        where: { businessId_runKey: { businessId, runKey } },
      });
    }

    // Con el planificador prendido, la corrida del día la piensa la IA. Por
    // ahora solo simula: no recluta aunque el modo sea PILOT.
    if (policy.autonomyPlannerEnabled) {
      const outcome = await this.planner.run(businessId, {
        trigger: 'DAILY',
        runId: run.id,
        now,
      });
      return outcome.run;
    }

    try {
      const plan = await this.plan(
        businessId,
        mode,
        runKey,
        policy.autonomyPilotGroupSize,
        now,
      );
      let assignedCount = 0;
      if (plan.status === 'EXECUTED') {
        assignedCount = await this.recruit(businessId, run.id, plan, now);
      }
      const finished = await this.prisma.autonomousRun.update({
        where: { id: run.id },
        data: {
          status: plan.status,
          strategy: plan.strategy,
          objective: plan.objective,
          incentiveLevel: plan.incentiveLevel,
          opportunities: plan.opportunities as unknown as Prisma.InputJsonValue,
          discarded: plan.discarded as unknown as Prisma.InputJsonValue,
          blockers: plan.blockers as unknown as Prisma.InputJsonValue,
          facts: plan.facts as unknown as Prisma.InputJsonValue,
          explanation: plan.explanation,
          suggestions: plan.suggestions,
          plannedCustomerIds: plan.plannedCustomerIds,
          assignedCount,
          estimatedCost: plan.estimatedCost,
          currency: plan.currency,
          finishedAt: new Date(),
        },
      });
      await this.audit.log({
        action: `AUTONOMY_RUN_${plan.status}`,
        entityType: 'AutonomousRun',
        entityId: run.id,
        userId: null,
        businessId,
        metadata: {
          mode,
          strategy: plan.strategy,
          planned: plan.plannedCustomerIds.length,
          assigned: assignedCount,
          blockers: plan.blockers.map((b) => b.code),
        },
      });
      return finished;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.autonomousRun.update({
        where: { id: run.id },
        data: {
          status: AutonomousRunStatus.FAILED,
          errorMessage: message.slice(0, 500),
          explanation:
            'La corrida falló por un error interno; no se contactó a nadie por esta corrida.',
          finishedAt: new Date(),
        },
      });
      await this.audit.log({
        action: 'AUTONOMY_RUN_FAILED',
        entityType: 'AutonomousRun',
        entityId: run.id,
        userId: null,
        businessId,
        metadata: { error: message.slice(0, 300) },
      });
      throw error;
    }
  }

  /** Vista previa a pedido (DRY_RUN): el mismo plan, sin guardar nada. */
  async preview(businessId: string, now: Date = new Date()) {
    const [business, policy] = await Promise.all([
      this.prisma.business.findUnique({
        where: { id: businessId },
        select: { timezone: true },
      }),
      this.prisma.businessPolicy.findUnique({
        where: { businessId },
        select: { autonomyPilotGroupSize: true },
      }),
    ]);
    if (!business) throw new NotFoundException('Negocio no encontrado');
    const plan = await this.plan(
      businessId,
      AutonomyMode.DRY_RUN,
      localDayKey(now, business.timezone),
      policy?.autonomyPilotGroupSize ?? 10,
      now,
    );
    // Nunca ids de clientes hacia afuera: solo cuántos.
    return {
      mode: plan.mode,
      status: plan.status,
      strategy: plan.strategy,
      incentiveLevel: plan.incentiveLevel,
      opportunities: plan.opportunities,
      discarded: plan.discarded,
      blockers: plan.blockers,
      facts: plan.facts,
      explanation: plan.explanation,
      suggestions: plan.suggestions,
      estimatedCost: plan.estimatedCost,
      currency: plan.currency,
      plannedCount: plan.plannedCustomerIds.length,
    };
  }

  private async claim(
    businessId: string,
    runKey: string,
    mode: AutonomyMode,
    now: Date,
  ): Promise<AutonomousRun | null> {
    try {
      return await this.prisma.autonomousRun.create({
        data: { businessId, runKey, mode, startedAt: now },
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
    }
    // Ya existe. Solo se retoma si quedó RUNNING hace rato (caída).
    const stale = new Date(now.getTime() - STALE_RUN_MS);
    const claimed = await this.prisma.autonomousRun.updateMany({
      where: {
        businessId,
        runKey,
        status: AutonomousRunStatus.RUNNING,
        startedAt: { lte: stale },
      },
      data: { startedAt: now, mode },
    });
    if (claimed.count === 0) return null;
    return this.prisma.autonomousRun.findUnique({
      where: { businessId_runKey: { businessId, runKey } },
    });
  }

  // -------------------------------------------------------------------------
  // detectar → evaluar → elegir → autorizar
  // -------------------------------------------------------------------------

  async plan(
    businessId: string,
    mode: 'DRY_RUN' | 'PILOT',
    runKey: string,
    groupLimit: number,
    now: Date,
  ): Promise<AutonomyPlan> {
    const { config, averageTicketAmount } =
      await this.policies.getConfig(businessId);
    const timezone = config.businessTimezone;

    const [customers, running, history, catalogIncentiveAvailable] =
      await Promise.all([
        this.customerFacts(businessId, now),
        this.experiments.findUsableRunning(businessId),
        this.history(businessId),
        this.catalogIncentiveAvailable(businessId, averageTicketAmount),
      ]);
    const active = customers.filter((c) => c.isActive);
    const activeIds = active.map((c) => c.id);
    const consent = await whatsappConsent(this.prisma, businessId, activeIds);
    const usage = await loadUsage(this.prisma, {
      businessId,
      timezone,
      now,
      candidates: [],
      messageUnitCost: config.messageUnitCost,
      averageTicketAmount,
    });

    const detection = detectOpportunities(active, now);
    const facts: RunFacts = {
      totalCustomers: customers.length,
      activeCustomers: active.length,
      withPhone: active.filter((c) => c.hasPhone).length,
      withWhatsappConsent: [...consent.values()].filter((s) => s === 'GRANTED')
        .length,
      optedOut: active.filter((c) => c.optedOut).length,
      customersWithVisits: detection.customersWithVisits,
      fewData: detection.fewData,
      policyAccepted: Boolean(config.acceptedAt),
      policyPaused: config.paused,
      messageCostSet: config.messageUnitCost !== null,
      campaignsThisWeek: usage.newCampaignsThisWeek,
      campaignsCap: config.maxNewCampaignsPerWeek,
      recipientsThisWeek: usage.recipientsThisWeek.size,
      recipientsCap: config.maxUniqueRecipientsPerWeek,
      messagingSpentMonth: Math.round(usage.messagingSpentMonth * 100) / 100,
      messagingBudget: config.messagingBudgetMonthly,
      currency: config.confirmedCurrency ?? config.businessCurrency,
    };

    // Evaluar: quién de cada estrategia puede recibir algo. Consentimiento y
    // frecuencia los decide el motor de políticas (por persona); quien ya
    // está en curso en ese experimento de Autopilot no se vuelve a reclutar.
    const candidateUnion = [
      ...new Set(detection.opportunities.flatMap((o) => o.candidateIds)),
    ];
    const perPerson = config.acceptedAt
      ? new Set(
          (
            await this.gate.evaluate({
              businessId,
              effect: this.effect(candidateUnion, false),
              now,
            })
          ).decision.eligibleCustomerIds,
        )
      : // Sin política aceptada no se puede enviar, pero el plan igual
        // respeta el consentimiento: nunca se simula sobre quien no lo dio.
        new Set(candidateUnion.filter((id) => consent.get(id) === 'GRANTED'));
    const busy = await this.inFlightByObjective(
      businessId,
      running.map((e) => e.id),
    );
    const runningObjectives = new Set(running.map((e) => e.objective));
    const eligibleByStrategy: Partial<Record<StrategyKey, string[]>> = {};
    for (const opportunity of detection.opportunities) {
      if (!opportunity.objective) continue;
      const taken = busy.get(opportunity.objective) ?? new Set<string>();
      eligibleByStrategy[opportunity.strategy] =
        opportunity.candidateIds.filter(
          (id) => perPerson.has(id) && !taken.has(id),
        );
    }

    const choice = chooseStrategy({
      opportunities: detection.opportunities,
      eligibleByStrategy,
      runningObjectives,
      history,
      catalogIncentiveAvailable,
      now,
    });

    // Autorizar: el grupo elegido pasa por el motor completo (topes
    // semanales, presupuesto, kill switch, costo por mensaje). Si un tope
    // de volumen no da, se achica el grupo; nunca se saltea una regla.
    let group: string[] = [];
    let blockers: PolicyBlocker[] = [];
    if (choice.chosen) {
      group = selectGroup(
        choice.chosen.eligibleIds,
        Math.max(0, groupLimit),
        runKey,
      );
      if (!config.acceptedAt) {
        blockers = [
          {
            code: 'POLICY_NOT_ACCEPTED',
            message:
              'La política de envíos todavía no está aceptada (Configuración → Políticas).',
          },
        ];
      } else {
        for (;;) {
          const { decision } = await this.gate.evaluate({
            businessId,
            effect: this.effect(group, true),
            now,
          });
          blockers = decision.blockers.filter(
            (b) => !PLANNING_IGNORED.has(b.code),
          );
          const onlyVolume =
            blockers.length > 0 &&
            blockers.every((b) => SHRINKABLE.has(b.code));
          if (!onlyVolume || group.length <= 1) break;
          group = group.slice(0, Math.floor(group.length / 2));
        }
      }
    }

    const status: AutonomyPlan['status'] = !choice.chosen
      ? 'NO_ACTION'
      : blockers.length > 0
        ? 'BLOCKED'
        : mode === AutonomyMode.PILOT
          ? 'EXECUTED'
          : 'SIMULATED';
    const acted = status === 'EXECUTED' || status === 'SIMULATED';
    const chosenOpportunity = choice.chosen?.opportunity ?? null;
    const explanation = explainRun({
      mode,
      status,
      facts,
      opportunities: detection.opportunities,
      discarded: choice.discarded,
      blockers,
      chosen: chosenOpportunity
        ? {
            label: chosenOpportunity.label,
            groupSize: group.length,
            eligible: choice.chosen!.eligibleIds.length,
          }
        : null,
    });

    const plannedSegments: Record<string, string> = {};
    for (const id of acted ? group : []) {
      plannedSegments[id] = chosenOpportunity!.segments[id];
    }
    return {
      mode,
      status,
      strategy: chosenOpportunity?.strategy ?? null,
      objective: chosenOpportunity?.objective ?? null,
      incentiveLevel: choice.chosen?.incentiveLevel ?? null,
      // Lo que se guarda: conteos y motivos, nunca la lista de candidatos.
      opportunities: detection.opportunities.map((o) => ({
        strategy: o.strategy,
        label: o.label,
        incentiveLevel: o.incentiveLevel,
        objective: o.objective,
        executable: o.executable,
        notExecutableReason: o.notExecutableReason,
        confidence: o.confidence,
        count: o.count,
        rationale: o.rationale,
      })),
      discarded: choice.discarded,
      blockers,
      facts,
      explanation: explanation.explanation,
      suggestions: explanation.suggestions,
      plannedCustomerIds: acted ? group : [],
      plannedSegments,
      estimatedCost:
        Math.round(
          (acted ? group.length : 0) * (config.messageUnitCost ?? 0) * 100,
        ) / 100,
      currency: facts.currency,
    };
  }

  /** PILOT: recluta el grupo en el experimento de Autopilot correspondiente. */
  private async recruit(
    businessId: string,
    runId: string,
    plan: AutonomyPlan,
    now: Date,
  ): Promise<number> {
    const running = await this.experiments.findUsableRunning(businessId);
    const visits = await this.prisma.visit.findMany({
      where: { businessId, customerId: { in: plan.plannedCustomerIds } },
      select: { customerId: true, occurredAt: true },
    });
    const visitsBy = new Map<string, Date[]>();
    for (const v of visits) {
      const list = visitsBy.get(v.customerId) ?? [];
      list.push(v.occurredAt);
      visitsBy.set(v.customerId, list);
    }
    const excludeStrategies =
      (plan.incentiveLevel ?? 1) >= 3 ? [] : INCENTIVE_STRATEGIES;

    for (const customerId of plan.plannedCustomerIds) {
      const segment = plan.plannedSegments[customerId] as never;
      const experiment =
        plan.objective === RetentionObjective.REWARD_GOAL_PROGRESS
          ? running.find(
              (e) => e.objective === RetentionObjective.REWARD_GOAL_PROGRESS,
            )
          : this.experiments.resolveApplicable(running, segment);
      if (!experiment) continue;
      await this.assignments.assign({
        experimentId: experiment.id,
        businessId,
        customerId,
        segment,
        frequency: computeVisitFrequency(visitsBy.get(customerId) ?? [], now),
        autonomousRunId: runId,
        excludeStrategies,
      });
    }
    return this.prisma.retentionAssignment.count({
      where: { autonomousRunId: runId },
    });
  }

  private effect(candidates: string[], createsCampaign: boolean): PolicyEffect {
    return {
      source: 'AUTOPILOT',
      actorRole: null,
      kind: 'MESSAGE',
      createsCampaign,
      candidateCustomerIds: candidates,
      incentive: null,
    };
  }

  // -------------------------------------------------------------------------
  // Lecturas en lote (sirven igual con miles de clientes)
  // -------------------------------------------------------------------------

  private async customerFacts(businessId: string, now: Date) {
    const [customers, visits, interventions, goals, expiring] =
      await Promise.all([
        this.prisma.customer.findMany({
          where: { businessId },
          select: {
            id: true,
            isActive: true,
            optedOut: true,
            phoneE164: true,
          },
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
            expiresAt: {
              gt: now,
              lte: new Date(now.getTime() + 8 * MS_PER_DAY),
            },
          },
          select: { customerId: true, expiresAt: true },
        }),
      ]);
    const visitsBy = new Map<string, Date[]>();
    for (const v of visits) {
      const list = visitsBy.get(v.customerId) ?? [];
      list.push(v.occurredAt);
      visitsBy.set(v.customerId, list);
    }
    const lastContact = new Map(
      interventions.map((i) => [i.customerId, i._max.sentAt]),
    );
    const goalBy = new Map(goals.map((g) => [g.customerId, g]));
    const expiringBy = new Map<string, number>();
    for (const p of expiring) {
      const days = Math.floor(
        (p.expiresAt!.getTime() - now.getTime()) / MS_PER_DAY,
      );
      const current = expiringBy.get(p.customerId);
      if (current === undefined || days < current) {
        expiringBy.set(p.customerId, days);
      }
    }
    return customers.map(
      (
        c,
      ): CustomerFacts & {
        isActive: boolean;
        optedOut: boolean;
        hasPhone: boolean;
      } => {
        const dates = visitsBy.get(c.id) ?? [];
        const goal = goalBy.get(c.id);
        return {
          id: c.id,
          isActive: c.isActive,
          optedOut: c.optedOut,
          hasPhone: Boolean(c.phoneE164?.trim()),
          visitDates: dates,
          lastInterventionAt: lastContact.get(c.id) ?? null,
          activeGoalRemaining: goal
            ? Math.max(
                0,
                goal.targetAdditionalVisits -
                  (dates.length - goal.startingVisitCount),
              )
            : null,
          expiringBenefitInDays: expiringBy.get(c.id) ?? null,
        };
      },
    );
  }

  /** Clientes ya en curso en cada objetivo (asignación sin terminar). */
  private async inFlightByObjective(
    businessId: string,
    experimentIds: string[],
  ): Promise<Map<RetentionObjective, Set<string>>> {
    const result = new Map<RetentionObjective, Set<string>>();
    if (experimentIds.length === 0) return result;
    const rows = await this.prisma.retentionAssignment.findMany({
      where: { businessId, experimentId: { in: experimentIds } },
      select: { customerId: true, experiment: { select: { objective: true } } },
    });
    for (const row of rows) {
      const set = result.get(row.experiment.objective) ?? new Set<string>();
      set.add(row.customerId);
      result.set(row.experiment.objective, set);
    }
    return result;
  }

  private async catalogIncentiveAvailable(
    businessId: string,
    averageTicketAmount: Prisma.Decimal | null,
  ): Promise<boolean> {
    const definitions = await this.prisma.retentionIncentiveDefinition.findMany(
      {
        where: { businessId, active: true, automationEligible: true },
        select: {
          estimatedCost: true,
          percentageValue: true,
          fixedValue: true,
        },
      },
    );
    return definitions.some(
      (d) => estimateIncentiveCost(d, averageTicketAmount) !== null,
    );
  }

  /** Corridas anteriores con lo que Autopilot midió de cada una. */
  async history(businessId: string, take = 30): Promise<PastRun[]> {
    const runs = await this.prisma.autonomousRun.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        strategy: true,
        incentiveLevel: true,
        status: true,
        mode: true,
        createdAt: true,
      },
    });
    const metrics = await this.metricsFor(runs.map((r) => r.id));
    return runs.map((run) => ({
      strategy: run.strategy,
      incentiveLevel: run.incentiveLevel,
      status: run.status,
      mode: run.mode,
      createdAt: run.createdAt,
      exposed: metrics.get(run.id)?.sent ?? 0,
      returned: metrics.get(run.id)?.returnedTreated ?? 0,
    }));
  }

  /** Medición por corrida, leída de Autopilot (asignaciones y resultados). */
  async metricsFor(runIds: string[]) {
    const result = new Map<string, RunMetrics>();
    if (runIds.length === 0) return result;
    const rows = await this.prisma.retentionAssignment.findMany({
      where: { autonomousRunId: { in: runIds } },
      select: {
        autonomousRunId: true,
        status: true,
        variant: { select: { strategyType: true } },
        outcome: { select: { returned: true, confirmedByRedemption: true } },
      },
    });
    for (const row of rows) {
      const m = result.get(row.autonomousRunId!) ?? {
        assigned: 0,
        pending: 0,
        sent: 0,
        control: 0,
        skipped: 0,
        returnedTreated: 0,
        returnedControl: 0,
        redeemed: 0,
      };
      m.assigned += 1;
      const isControl =
        row.variant.strategyType === RetentionStrategyType.CONTROL;
      if (row.status === 'PENDING') m.pending += 1;
      if (row.status === 'SENT') m.sent += 1;
      if (row.status === 'SKIPPED') m.skipped += 1;
      if (isControl) m.control += 1;
      if (row.outcome?.returned) {
        if (isControl) m.returnedControl += 1;
        else m.returnedTreated += 1;
      }
      if (row.outcome?.confirmedByRedemption) m.redeemed += 1;
      result.set(row.autonomousRunId!, m);
    }
    return result;
  }

  /** ¿Este negocio recluta por el modo autónomo (y no por Autopilot)? */
  static recruitsAutonomously(mode: AutonomyMode | null | undefined) {
    return mode === AutonomyMode.PILOT;
  }
}

/** Para la pantalla: etiqueta legible de una estrategia guardada. */
export function strategyLabel(strategy: string | null): string | null {
  if (!strategy) return null;
  return STRATEGIES[strategy as StrategyKey]?.label ?? strategy;
}
