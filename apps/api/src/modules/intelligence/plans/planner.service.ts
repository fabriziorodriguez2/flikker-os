import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AutonomousRun,
  AutonomousRunStatus,
  AutonomyMode,
  IntelligencePlanStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../../common/services/audit.service';
import { localDayKey } from '../../../common/utils/timezone.util';
import { AiConfigService } from '../../ai/ai-config.service';
import { AiUsageService } from '../../ai/ai-usage.service';
import { AI_USE_CASES } from '../../ai/ai-usecases';
import { INTELLIGENCE_PLANNER_PROMPT_VERSION } from '../../ai/prompt-versions';
import {
  AI_AGENT_PROVIDER,
  type AgentInputItem,
  type AiAgentProvider,
} from '../../ai/ai-agent-provider.interface';
import {
  estimateIncentiveCost,
  isVerifiedZeroCost,
} from '../../retention-v2/incentive-cost';
import { PolicyService } from '../../policy/policy.service';
import { loadUsage } from '../../policy/policy-usage';
import {
  campaignCaps,
  frequencyExclusion,
  weeklyRecipientCap,
  type CustomerBase,
} from '../../policy/policy-rules';
import type { AuthorizedIncentive } from './commercial-plan';
import { previewSegment, reachableCustomerIds } from './business-snapshot';
import { BusinessSnapshotService } from './business-snapshot.service';
import { PlanExecutorService } from './plan-executor.service';
import { planExecutionAllowed } from '../../policy/plan-execution';
import { ConsentAuditService } from '../../policy/consent-audit.service';
import { validateSegmentRule, type SegmentRule } from './segment-rules';
import {
  evaluateSubmission,
  feedbackForModel,
  type EvaluationContext,
  type PlannerBudget,
  type PlannerSubmission,
  type SubmissionEvaluation,
} from './planner-evaluation';
import {
  PLANNER_INSTRUCTIONS,
  PLANNER_TOOLS,
  buildPlannerContext,
  type PlannerPolicyInfo,
} from './planner-prompt';

/** Rondas con el modelo por corrida (herramientas + correcciones). */
export const PLANNER_MAX_ROUNDS = 8;
/** Correcciones que se le piden al modelo antes de quedarse con lo válido. */
export const PLANNER_MAX_REPAIRS = 2;
const MAX_OUTPUT_TOKENS = 6_000;
/** Corte de consumo por corrida: con esto ni un modelo caro se dispara. */
const MAX_INPUT_TOKENS_PER_RUN = 200_000;
/** Un plan simulado no se vuelve a proponer igual durante esta ventana. */
const SIMULATED_DEDUPE_DAYS = 7;
const HISTORY_DAYS = 60;
const MS_PER_DAY = 86_400_000;

export type PlannerTrigger = 'DAILY' | 'MANUAL';

export interface PlannerOutcome {
  run: AutonomousRun;
  simulated: number;
}

/**
 * Planificador comercial con IA, en SIMULACIÓN: el modelo analiza el negocio,
 * propone y elige planes; el servidor los valida y registra qué habría
 * pasado. No recluta ni envía nada, cualquiera sea el modo del negocio. La
 * ejecución real es una fase aparte que necesita autorización.
 */
@Injectable()
export class PlannerService {
  private readonly logger = new Logger(PlannerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AiConfigService,
    private readonly usage: AiUsageService,
    @Inject(AI_AGENT_PROVIDER) private readonly provider: AiAgentProvider,
    private readonly snapshots: BusinessSnapshotService,
    private readonly policies: PolicyService,
    private readonly audit: AuditService,
    private readonly executor: PlanExecutorService,
    private readonly consentAudit: ConsentAuditService,
  ) {}

  /**
   * Corre el planificador y deja la corrida registrada, actúe o no. `runId`:
   * una corrida ya reclamada (la diaria); sin él se crea una a pedido.
   */
  async run(
    businessId: string,
    opts: { trigger: PlannerTrigger; runId?: string; now?: Date },
  ): Promise<PlannerOutcome> {
    const now = opts.now ?? new Date();
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { name: true, timezone: true, currency: true },
    });
    const today = localDayKey(now, business.timezone);
    const run = opts.runId
      ? await this.prisma.autonomousRun.update({
          where: { id: opts.runId },
          data: { engine: 'PLANNER', mode: AutonomyMode.DRY_RUN },
        })
      : await this.prisma.autonomousRun.create({
          data: {
            businessId,
            // Una corrida a pedido nunca choca con la diaria ni con otra a pedido.
            runKey: `${today}#manual-${randomUUID()}`,
            mode: AutonomyMode.DRY_RUN,
            engine: 'PLANNER',
            startedAt: now,
          },
        });

    try {
      const blocked = await this.gate(businessId, now);
      if (blocked) {
        return {
          run: await this.finish(run.id, businessId, {
            status: AutonomousRunStatus.BLOCKED,
            explanation: blocked,
          }),
          simulated: 0,
        };
      }
      return await this.plan(run, business, today, now, opts.trigger);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Planner run ${run.id} failed: ${message}`);
      return {
        run: await this.finish(run.id, businessId, {
          status: AutonomousRunStatus.FAILED,
          errorMessage: message.slice(0, 500),
          explanation:
            'El planificador falló por un error interno. No se contactó a nadie.',
        }),
        simulated: 0,
      };
    }
  }

  /** null = puede correr; si no, el motivo para el dueño. */
  private async gate(businessId: string, now: Date): Promise<string | null> {
    if (!this.config.globallyEnabled || !this.config.providerConfigured) {
      return 'La IA no está habilitada en Flikker: el planificador no corrió.';
    }
    const settings = await this.prisma.retentionSettings.findUnique({
      where: { businessId },
      select: { aiInsightsEnabled: true },
    });
    if (!settings?.aiInsightsEnabled) {
      return 'Intelligence no está habilitado para este negocio.';
    }
    const runsOk = await this.usage.hasCapacityForUseCase(
      businessId,
      AI_USE_CASES.INTELLIGENCE_PLANNER_RUN,
      this.config.plannerMaxRunsPerDay,
      now,
    );
    if (!runsOk) {
      return `Ya se usaron las ${this.config.plannerMaxRunsPerDay} corridas del planificador de hoy.`;
    }
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const spent = await this.prisma.aiUsageEvent.aggregate({
      where: {
        businessId,
        useCase: AI_USE_CASES.INTELLIGENCE_PLANNER_RUN,
        createdAt: { gte: monthStart },
      },
      _sum: { estimatedCostUsd: true },
    });
    if (
      Number(spent._sum.estimatedCostUsd ?? 0) >=
      this.config.plannerMonthlyUsdCapPerBusiness
    ) {
      return `El planificador llegó a su tope de gasto del mes (USD ${this.config.plannerMonthlyUsdCapPerBusiness}).`;
    }
    return null;
  }

  private async plan(
    run: AutonomousRun,
    business: { name: string; timezone: string; currency: string },
    today: string,
    now: Date,
    trigger: PlannerTrigger,
  ): Promise<PlannerOutcome> {
    const businessId = run.businessId;
    const snapshot = await this.snapshots.load(businessId, now);
    const contactability = toContactability(
      await this.consentAudit.audit(businessId, now),
    );
    if (snapshot.facts['customers.active'] === 0) {
      // Sin clientes no hay nada que pensar: no se gasta una llamada.
      return {
        run: await this.finish(run.id, businessId, {
          status: AutonomousRunStatus.NO_ACTION,
          explanation:
            'Todavía no hay clientes registrados: no hay nada que analizar.',
          facts: snapshot.facts,
        }),
        simulated: 0,
      };
    }

    const [catalog, limits, recentFingerprints] = await Promise.all([
      this.authorizedIncentives(businessId),
      this.limits(businessId, [...snapshot.consented], now),
      this.recentFingerprints(businessId, now),
    ]);
    const { budget, resting, base } = limits;
    // Sin presupuesto de incentivos definido por el dueño, el planificador
    // solo ve los premios de costo cero verificable: diseña sin comprometer
    // gasto.
    const incentives = budget.incentiveBudgetSet
      ? catalog
      : catalog.filter((i) => i.zeroCost);
    const baseView = {
      registered: base.registered,
      contactable: snapshot.consented.size,
      availableNow: snapshot.consented.size - resting.size,
      resting: resting.size,
    };
    const ctx: EvaluationContext = {
      snapshot,
      incentives: new Map(incentives.map((i) => [i.id, i])),
      budget,
      resting,
      recentFingerprints,
      now,
      today,
      // Lo que el modelo ve en el contexto también se puede citar.
      previewNumbers: [
        ...Object.values(baseView),
        ...[
          budget.messagingRemaining,
          budget.incentiveRemaining,
          budget.weeklyRecipientsRemaining,
          budget.newCampaignsRemaining,
          budget.maxMessagingPerCampaign,
          budget.maxIncentivesPerCampaign,
        ].filter((n): n is number => typeof n === 'number'),
      ],
    };

    const input: AgentInputItem[] = [
      {
        role: 'user',
        content: `Datos del negocio (${trigger === 'DAILY' ? 'corrida diaria' : 'corrida a pedido'}):\n${buildPlannerContext(
          {
            businessName: business.name,
            timezone: business.timezone,
            currency: business.currency,
            today,
            snapshot,
            incentives,
            budget,
            policy: limits.policy,
            contactability,
            base: baseView,
          },
        )}`,
      },
    ];

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.config.plannerTimeoutMs,
    );
    const startedAt = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;
    let model = this.config.plannerModel;
    let submission: PlannerSubmission | null = null;
    let evaluation: SubmissionEvaluation | null = null;
    let repairs = 0;
    let stopReason: string | null = null;
    /** Qué pasó en cada ronda: herramientas y veredicto. Sin datos de clientes. */
    const trace: {
      round: number;
      tools: string[];
      verdict?: string;
    }[] = [];

    try {
      for (let round = 1; round <= PLANNER_MAX_ROUNDS; round += 1) {
        if (inputTokens > MAX_INPUT_TOKENS_PER_RUN) {
          stopReason = 'Se cortó por consumo de tokens.';
          break;
        }
        const calls: { callId: string; name: string; arguments: string }[] = [];
        for await (const event of this.provider.streamAgentTurn({
          useCase: AI_USE_CASES.INTELLIGENCE_PLANNER_RUN,
          instructions: PLANNER_INSTRUCTIONS,
          input,
          tools: PLANNER_TOOLS,
          // Las dos últimas rondas obligan a entregar: un modelo que solo
          // explora nunca termina.
          toolChoice:
            round >= PLANNER_MAX_ROUNDS - 1
              ? { name: 'submit_plans' }
              : 'required',
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          model: this.config.plannerModel,
          signal: controller.signal,
        })) {
          if (event.type === 'tool_call') calls.push(event);
          if (event.type === 'completed') {
            model = event.model;
            inputTokens += event.inputTokens ?? 0;
            outputTokens += event.outputTokens ?? 0;
          }
        }
        const step: (typeof trace)[number] = {
          round,
          tools: calls.map((c) => c.name),
        };
        trace.push(step);
        if (calls.length === 0) {
          stopReason = 'El modelo no entregó un plan.';
          break;
        }

        let done = false;
        for (const call of calls) {
          input.push({
            type: 'function_call',
            call_id: call.callId,
            name: call.name,
            arguments: call.arguments,
          });
          let output: string;
          if (call.name === 'submit_plans') {
            submission = parseSubmission(call.arguments);
            if (!submission) {
              step.verdict = 'INVALID_JSON';
              output =
                'La entrega no es JSON válido con la forma pedida. Volvé a enviarla.';
            } else {
              evaluation = evaluateSubmission(submission, ctx);
              step.verdict = traceVerdict(evaluation);
              if (
                evaluation.repairable &&
                repairs < PLANNER_MAX_REPAIRS &&
                round < PLANNER_MAX_ROUNDS
              ) {
                repairs += 1;
                output = `Hay problemas. Corregí y volvé a llamar submit_plans:\n${feedbackForModel(evaluation)}`;
              } else {
                output = 'Recibido.';
                done = true;
              }
            }
          } else if (call.name === 'plan_history') {
            output = await this.history(businessId, now);
          } else {
            output = this.previewTool(call.name, call.arguments, ctx);
          }
          input.push({
            type: 'function_call_output',
            call_id: call.callId,
            output,
          });
        }
        if (done) break;
      }
    } finally {
      clearTimeout(timer);
    }

    const costUsd = this.config.estimatePlannerCostUsd(
      inputTokens,
      outputTokens,
    );
    await this.usage.record({
      businessId,
      useCase: AI_USE_CASES.INTELLIGENCE_PLANNER_RUN,
      model,
      promptVersion: INTELLIGENCE_PLANNER_PROMPT_VERSION,
      success: Boolean(submission && evaluation),
      fallbackUsed: false,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - startedAt,
      estimatedCostUsd: costUsd,
    });

    if (!submission || !evaluation) {
      return {
        run: await this.finish(run.id, businessId, {
          status: AutonomousRunStatus.FAILED,
          explanation: `El planificador no llegó a una propuesta válida${stopReason ? `: ${stopReason}` : '.'} No se contactó a nadie.`,
          facts: snapshot.facts,
          analysis: { trace, stopReason, repairs },
          plannerModel: model,
          aiCostUsd: costUsd,
        }),
        simulated: 0,
      };
    }

    // Cada plan queda registrado (con su id, para poder ejecutarlo y medirlo).
    const execute = await planExecutionAllowed(this.prisma, businessId);
    const saved: {
      evaluated: (typeof evaluation.plans)[number];
      id: string;
    }[] = [];
    for (const e of evaluation.plans) {
      const row = await this.prisma.intelligencePlan.create({
        data: {
          businessId,
          runId: run.id,
          status: e.status as IntelligencePlanStatus,
          rank: e.status === 'SIMULATED' ? e.rank : null,
          title: String(e.submitted.title ?? '').slice(0, 200),
          objective: String(e.submitted.objective ?? 'OTHER'),
          hypothesis: String(e.submitted.hypothesis ?? '').slice(0, 1000),
          fingerprint: e.fingerprint,
          plan: e.submitted as unknown as Prisma.InputJsonValue,
          issues: e.issues as unknown as Prisma.InputJsonValue,
          selectionReason: e.submitted.selectionReason,
          matched: e.matched,
          reachable: e.reachable,
          simulation:
            e.status === 'SIMULATED' && e.cost
              ? ({
                  recipients: e.cost.recipients,
                  treated: e.cost.treated,
                  control: e.cost.control,
                  perVariant: e.submitted.variants.map((v) => ({
                    key: v.key,
                    weightPercent: v.weightPercent,
                    incentiveId: v.incentiveId,
                  })),
                  cost: e.cost,
                  costKnown: e.costKnown,
                  smallSample: e.smallSample,
                  exploratory: e.smallSample,
                  startOn: e.submitted.schedule.startOn,
                } as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          estimatedCost: e.cost ? e.cost.total : null,
          currency: business.currency,
        },
        select: { id: true },
      });
      saved.push({ evaluated: e, id: row.id });
    }

    // Con la ejecución autorizada, cada elegido se convierte en un
    // experimento de Autopilot. Si la política lo frena, queda inviable con
    // el motivo; nunca se saltea una regla.
    let executed = 0;
    let assigned = 0;
    if (execute) {
      for (const { evaluated: e, id } of saved) {
        if (e.status !== 'SIMULATED') continue;
        const outcome = await this.executor.execute({
          businessId,
          runId: run.id,
          planId: id,
          plan: {
            ...e.submitted,
            segment: { ...e.submitted.segment },
          },
          recipientIds: e.recipientIds,
          incentives: ctx.incentives,
          snapshot,
          now,
        });
        if (outcome.status === 'EXECUTING') {
          executed += 1;
          assigned += outcome.assigned;
        } else {
          await this.prisma.intelligencePlan.update({
            where: { id },
            data: {
              status: IntelligencePlanStatus.INFEASIBLE,
              issues: [
                ...e.issues,
                ...outcome.messages.map((message) => ({
                  path: 'execution',
                  code: outcome.code,
                  message,
                })),
              ] as unknown as Prisma.InputJsonValue,
            },
          });
        }
      }
    }

    const simulated = evaluation.plans.filter((p) => p.status === 'SIMULATED');
    // El resumen del modelo solo se muestra si no inventa números.
    const summary =
      evaluation.ungroundedSummaryNumbers.length === 0 &&
      !evaluation.summaryHasJargon &&
      submission.ownerSummary?.trim()
        ? submission.ownerSummary.trim()
        : fallbackSummary(evaluation, submission);
    const status = execute
      ? executed
        ? AutonomousRunStatus.EXECUTED
        : simulated.length
          ? AutonomousRunStatus.BLOCKED
          : AutonomousRunStatus.NO_ACTION
      : simulated.length
        ? AutonomousRunStatus.SIMULATED
        : AutonomousRunStatus.NO_ACTION;
    const tail = execute
      ? executed
        ? `(Se ${executed === 1 ? 'ejecutó 1 plan' : `ejecutaron ${executed} planes`}: ${assigned} clientes quedaron en Autopilot, que les escribe dentro del horario y la política.)`
        : '(No se ejecutó ningún plan: ver el motivo de cada uno.)'
      : '(Simulación: no se contactó a nadie.)';

    return {
      run: await this.finish(run.id, businessId, {
        status,
        explanation: `${summary} ${tail} ${contactabilityText(contactability)}`,
        suggestions: [
          ...(submission.nextSteps ?? []),
          ...contactabilitySuggestions(contactability),
        ],
        facts: snapshot.facts,
        analysis: {
          observations: submission.observations ?? [],
          hypotheses: submission.hypotheses ?? [],
          decision: submission.decision,
          noActionReason: submission.noActionReason,
          repairs,
          stopReason,
          trace,
          summaryReplaced: summary !== submission.ownerSummary?.trim(),
          contactability,
        },
        plannerModel: model,
        aiCostUsd: costUsd,
        estimatedCost: simulated.reduce((s, p) => s + (p.cost?.total ?? 0), 0),
        currency: business.currency,
        mode: execute ? AutonomyMode.PILOT : AutonomyMode.DRY_RUN,
        assignedCount: assigned,
      }),
      simulated: simulated.length,
    };
  }

  /** Vista previa de un segmento. Nunca devuelve datos de clientes. */
  private previewTool(
    name: string,
    rawArgs: string,
    ctx: EvaluationContext,
  ): string {
    if (name !== 'preview_segment') return 'Herramienta desconocida.';
    let rule: unknown;
    try {
      rule = JSON.parse((JSON.parse(rawArgs) as { rule: string }).rule);
    } catch {
      return JSON.stringify({
        valid: false,
        issues: ['La regla no es JSON válido.'],
      });
    }
    const issues = validateSegmentRule(rule);
    if (issues.length) {
      return JSON.stringify({
        valid: false,
        issues: issues.map((i) => `${i.path}: ${i.message}`),
      });
    }
    const preview = previewSegment(ctx.snapshot, rule as SegmentRule);
    const resting = ctx.resting ?? new Set<string>();
    // Contactables que hoy no están en descanso por la frecuencia máxima.
    const availableNow = reachableCustomerIds(
      ctx.snapshot,
      rule as SegmentRule,
    ).filter((id) => !resting.has(id)).length;
    ctx.previewNumbers.push(preview.matched, preview.reachable, availableNow);
    return JSON.stringify({ valid: true, ...preview, availableNow });
  }

  private async history(businessId: string, now: Date): Promise<string> {
    const plans = await this.prisma.intelligencePlan.findMany({
      where: {
        businessId,
        createdAt: { gte: new Date(now.getTime() - HISTORY_DAYS * MS_PER_DAY) },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        createdAt: true,
        status: true,
        title: true,
        objective: true,
        hypothesis: true,
        reachable: true,
        plan: true,
        results: true,
        stopReason: true,
      },
    });
    return JSON.stringify({
      note: 'SIMULATED no contactó a nadie. EXECUTING/MEASURING/COMPLETED/STOPPED tienen resultados reales: "evidence" dice qué se puede afirmar (OBSERVED_ONLY = exploratoria sin grupo de control, solo lo observado; SIGNAL_ONLY = señal sin prueba; INCREMENTAL = el plan sumó vueltas frente al control; NO_DIFFERENCE = sin diferencia con el control). Aprendé de eso: no repitas lo que no funcionó y no afirmes más de lo que dice "evidence".',
      plans: plans.map((p) => ({
        date: p.createdAt.toISOString().slice(0, 10),
        status: p.status,
        title: p.title,
        objective: p.objective,
        hypothesis: p.hypothesis,
        reachable: p.reachable,
        segment: (p.plan as { segment?: { description?: string } }).segment
          ?.description,
        result: summarizeResults(p.results, p.stopReason),
      })),
    });
  }

  private async recentFingerprints(businessId: string, now: Date) {
    const rows = await this.prisma.intelligencePlan.findMany({
      where: {
        businessId,
        fingerprint: { not: null },
        OR: [
          // Lo que se está ejecutando o midiendo no se repite hasta cerrar.
          {
            status: {
              in: [
                IntelligencePlanStatus.EXECUTING,
                IntelligencePlanStatus.MEASURING,
              ],
            },
          },
          {
            status: IntelligencePlanStatus.SIMULATED,
            createdAt: {
              gte: new Date(now.getTime() - SIMULATED_DEDUPE_DAYS * MS_PER_DAY),
            },
          },
        ],
      },
      select: { fingerprint: true },
    });
    return new Set(rows.map((r) => r.fingerprint!));
  }

  private async authorizedIncentives(
    businessId: string,
  ): Promise<AuthorizedIncentive[]> {
    const [definitions, settings] = await Promise.all([
      this.prisma.retentionIncentiveDefinition.findMany({
        where: { businessId, active: true, automationEligible: true },
        select: {
          id: true,
          name: true,
          type: true,
          percentageValue: true,
          fixedValue: true,
          estimatedCost: true,
          expiresInDays: true,
        },
      }),
      this.prisma.retentionSettings.findUnique({
        where: { businessId },
        select: { averageTicketAmount: true },
      }),
    ]);
    return definitions.map((d) => ({
      id: d.id,
      label: d.name,
      unitCost:
        estimateIncentiveCost(d, settings?.averageTicketAmount ?? null)?.cost ??
        null,
      percentageValue: d.percentageValue,
      fixedValue: d.fixedValue === null ? null : Number(d.fixedValue),
      expiresInDays: d.expiresInDays,
      allowFreeWording: d.type === 'gift' || d.type === 'upgrade',
      zeroCost: isVerifiedZeroCost(d),
    }));
  }

  /**
   * Los límites de la política para esta corrida, con la misma cuenta que el
   * motor (ver `PlannerBudget`), y quiénes de los contactables están hoy en
   * descanso por la regla de frecuencia (contactos de todos los motores).
   */
  private async limits(
    businessId: string,
    consentedIds: string[],
    now: Date,
  ): Promise<{
    budget: PlannerBudget;
    resting: Set<string>;
    base: CustomerBase;
    policy: PlannerPolicyInfo;
  }> {
    const { config, averageTicketAmount } =
      await this.policies.getConfig(businessId);
    const usage = await loadUsage(this.prisma, {
      businessId,
      timezone: config.businessTimezone,
      now,
      candidates: consentedIds,
      messageUnitCost: config.messageUnitCost,
      averageTicketAmount,
    });
    const left = (cap: number | null, used: number) =>
      cap === null ? null : Math.max(0, Math.round((cap - used) * 100) / 100);
    const weekly = weeklyRecipientCap(config, usage.base);
    const perCampaign = campaignCaps(config);
    const resting = new Set(
      consentedIds.filter((id) =>
        frequencyExclusion(usage.contactsByCustomer.get(id) ?? [], config, now),
      ),
    );
    return {
      budget: {
        messageUnitCost: config.messageUnitCost,
        messagingRemaining: left(
          config.messagingBudgetMonthly,
          usage.messagingSpentMonth,
        ),
        incentiveBudgetSet: config.incentiveBudgetMonthly !== null,
        incentiveRemaining: left(
          config.incentiveBudgetMonthly,
          usage.incentiveLiabilityMonth,
        ),
        weeklyLimitMode: weekly.mode,
        weeklyRecipientsRemaining:
          weekly.cap === null
            ? null
            : Math.max(0, weekly.cap - usage.recipientsThisWeek.size),
        newCampaignsRemaining:
          config.maxNewCampaignsPerWeek === null
            ? null
            : Math.max(
                0,
                config.maxNewCampaignsPerWeek - usage.newCampaignsThisWeek,
              ),
        maxMessagingPerCampaign: perCampaign.messaging,
        maxIncentivesPerCampaign: perCampaign.incentives,
      },
      resting,
      base: usage.base,
      policy: {
        accepted: Boolean(config.acceptedAt),
        minDaysBetweenPromotions: config.minDaysBetweenPromotions,
        maxPromotionsPer30Days: config.maxPromotionsPer30Days,
        sendingHours: `${config.sendingHourStart}–${config.sendingHourEnd} h`,
      },
    };
  }

  private async finish(
    runId: string,
    businessId: string,
    data: {
      status: AutonomousRunStatus;
      explanation: string;
      errorMessage?: string;
      suggestions?: string[];
      facts?: Record<string, number>;
      analysis?: Record<string, unknown>;
      plannerModel?: string;
      aiCostUsd?: number;
      estimatedCost?: number;
      currency?: string;
      mode?: AutonomyMode;
      assignedCount?: number;
    },
  ): Promise<AutonomousRun> {
    const run = await this.prisma.autonomousRun.update({
      where: { id: runId },
      data: {
        status: data.status,
        explanation: data.explanation,
        errorMessage: data.errorMessage ?? null,
        suggestions: data.suggestions ?? [],
        facts: (data.facts ?? {}) as Prisma.InputJsonValue,
        analysis: (data.analysis ?? {}) as Prisma.InputJsonValue,
        plannerModel: data.plannerModel ?? null,
        aiCostUsd: data.aiCostUsd ?? null,
        estimatedCost: data.estimatedCost ?? null,
        currency: data.currency ?? null,
        ...(data.mode ? { mode: data.mode } : {}),
        ...(data.assignedCount !== undefined
          ? { assignedCount: data.assignedCount }
          : {}),
        finishedAt: new Date(),
      },
    });
    await this.audit.log({
      action: `AUTONOMY_PLANNER_RUN_${data.status}`,
      entityType: 'AutonomousRun',
      entityId: runId,
      userId: null,
      businessId,
      metadata: {
        model: data.plannerModel ?? null,
        aiCostUsd: data.aiCostUsd ?? null,
      },
    });
    return run;
  }
}

/** "PROPOSE: 2 SIMULATED, 1 INVALID(COPY_UNAUTHORIZED_PERCENTAGE)" */
function traceVerdict(evaluation: SubmissionEvaluation): string {
  const parts = evaluation.plans.map((p) =>
    p.issues.length
      ? `${p.status}(${[...new Set(p.issues.map((i) => i.code))].join(',')})`
      : p.status,
  );
  const top = evaluation.issues.map((i) => i.code);
  return [...top, ...parts].join(', ') || 'SIN_PLANES';
}

export interface Contactability {
  active: number;
  reachableWhatsapp: number;
  neverAsked: number;
  neverAskedVisitedLast30d: number;
  neverAskedWithMiFlikker: number;
  optedOut: number;
  suppressed: number;
  noPhone: number;
}

function toContactability(audit: {
  customers: { active: number };
  whatsapp: {
    granted: number;
    neverAsked: number;
    neverAskedVisitedLast30d: number;
    neverAskedWithMiFlikker: number;
    revoked: number;
    suppressed: number;
    noPhone: number;
  };
}): Contactability {
  return {
    active: audit.customers.active,
    reachableWhatsapp: audit.whatsapp.granted,
    neverAsked: audit.whatsapp.neverAsked,
    neverAskedVisitedLast30d: audit.whatsapp.neverAskedVisitedLast30d,
    neverAskedWithMiFlikker: audit.whatsapp.neverAskedWithMiFlikker,
    optedOut: audit.whatsapp.revoked,
    suppressed: audit.whatsapp.suppressed,
    noPhone: audit.whatsapp.noPhone,
  };
}

/** "De 105 clientes, 12 se pueden contactar…" — todo con conteos reales. */
export function contactabilityText(c: Contactability): string {
  if (c.active === 0) return '';
  const parts = [
    `De ${c.active} clientes activos, ${c.reachableWhatsapp} se pueden contactar por WhatsApp.`,
  ];
  const reasons: string[] = [];
  if (c.neverAsked)
    reasons.push(`${c.neverAsked} todavía no autorizaron promociones`);
  if (c.optedOut)
    reasons.push(`${c.optedOut} dijeron que no o se dieron de baja`);
  if (c.suppressed) reasons.push(`${c.suppressed} pidieron no ser contactados`);
  if (c.noPhone) reasons.push(`${c.noPhone} no tienen teléfono`);
  if (reasons.length) parts.push(`Del resto: ${reasons.join(', ')}.`);
  return parts.join(' ');
}

/** Cómo ampliar la base contactable de forma legítima. */
export function contactabilitySuggestions(c: Contactability): string[] {
  const out: string[] = [];
  if (c.neverAskedVisitedLast30d) {
    out.push(
      `${c.neverAskedVisitedLast30d} clientes que vinieron en los últimos 30 días todavía no respondieron: en su próximo check-in se les pregunta si quieren recibir promociones.`,
    );
  }
  if (c.neverAsked > c.neverAskedVisitedLast30d) {
    out.push(
      'Invitá en el mostrador a escanear el QR: a quien vuelve se le ofrece la casilla de promociones, opcional y desmarcada.',
    );
  }
  return out;
}

/** Lo que el planificador necesita saber de un resultado: sin clientes. */
function summarizeResults(results: unknown, stopReason: string | null) {
  if (!results || typeof results !== 'object' || !('evidence' in results)) {
    return null;
  }
  const r = results as {
    phase: string;
    evidence: string;
    readout: string;
    treated: {
      contacted: number;
      returned: number;
      attributed: number;
      redeemed: number;
    };
    control: { observed: number; returned: number };
    liftPoints: number | null;
    byVariant: {
      name: string;
      contacted: number;
      returned: number;
      redeemed: number;
    }[];
    cost: { total: number | null };
    optOuts: number;
  };
  return {
    phase: r.phase,
    evidence: r.evidence,
    readout: r.readout,
    treated: r.treated,
    control: r.control,
    liftPoints: r.liftPoints,
    byVariant: r.byVariant,
    cost: r.cost.total,
    optOuts: r.optOuts,
    stoppedBy: stopReason,
  };
}

function parseSubmission(raw: string): PlannerSubmission | null {
  try {
    const parsed = JSON.parse(raw) as PlannerSubmission;
    return parsed && Array.isArray(parsed.plans) ? parsed : null;
  } catch {
    return null;
  }
}

/** Resumen sin números del modelo, cuando el suyo no pasó la verificación. */
function fallbackSummary(
  evaluation: SubmissionEvaluation,
  submission: PlannerSubmission,
): string {
  const simulated = evaluation.plans.filter((p) => p.status === 'SIMULATED');
  if (simulated.length) {
    return `El planificador eligió ${simulated.length === 1 ? 'un plan' : `${simulated.length} planes`}: ${simulated
      .map(
        (p) => `"${p.submitted.title}" para ${p.recipientIds.length} clientes`,
      )
      .join('; ')}.`;
  }
  if (submission.decision === 'NO_ACTION') {
    return 'El planificador decidió no actuar hoy.';
  }
  return `El planificador propuso ${evaluation.plans.length} planes, pero ninguno se pudo usar hoy (ver motivos de cada uno).`;
}
