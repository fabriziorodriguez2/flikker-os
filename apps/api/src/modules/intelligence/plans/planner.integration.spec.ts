import { randomUUID } from 'crypto';
import { ExperienceVersion } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../../common/services/audit.service';
import { AiConfigService } from '../../ai/ai-config.service';
import { AiUsageService } from '../../ai/ai-usage.service';
import type {
  AgentStreamEvent,
  AgentTurnRequest,
  AiAgentProvider,
} from '../../ai/ai-agent-provider.interface';
import { RetentionSettingsService } from '../../retention-v2/retention-settings.service';
import { PolicyService } from '../../policy/policy.service';
import { ConsentService } from '../../policy/consent.service';
import { BusinessSnapshotService } from './business-snapshot.service';
import { PlannerService } from './planner.service';
import { PlanExecutorService } from './plan-executor.service';
import { PolicyGateService } from '../../policy/policy-gate.service';
import { ConsentAuditService } from '../../policy/consent-audit.service';
import { RetentionAssignmentService } from '../../retention-v2/retention-assignment.service';

/**
 * El planificador contra Postgres real, con un modelo guionado (nunca llama
 * a OpenAI). Lo que se prueba: el ciclo completo, que todo quede registrado
 * y que en simulación nadie sea contactado ni reclutado.
 */

type Script = (request: AgentTurnRequest, round: number) => AgentStreamEvent[];

class ScriptedProvider implements AiAgentProvider {
  readonly configured = true;
  readonly requests: AgentTurnRequest[] = [];
  constructor(private readonly script: Script) {}
  // eslint-disable-next-line @typescript-eslint/require-await
  async *streamAgentTurn(request: AgentTurnRequest) {
    this.requests.push({ ...request, input: [...request.input] });
    for (const event of this.script(request, this.requests.length)) yield event;
  }
}

const done = (): AgentStreamEvent => ({
  type: 'completed',
  model: 'scripted-model',
  inputTokens: 10_000,
  outputTokens: 1_000,
  status: 'completed',
});
const call = (name: string, args: unknown): AgentStreamEvent => ({
  type: 'tool_call',
  callId: `call-${randomUUID().slice(0, 8)}`,
  name,
  arguments: JSON.stringify(args),
});

const ONE_VISIT = JSON.stringify({ field: 'visitCount', op: 'eq', value: 1 });

function planArgs(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    title: 'Segunda visita',
    objective: 'SECOND_VISIT',
    hypothesis: 'Hay clientes que vinieron una sola vez y no volvieron.',
    evidence: [
      {
        metric: 'customers.single_visit_lapsed_30d',
        value: 8,
        statement: '8 clientes vinieron una vez y no volvieron.',
      },
    ],
    segment: {
      description: 'Una sola visita',
      rule: ONE_VISIT,
      maxRecipients: 20,
    },
    channel: 'WHATSAPP',
    variants: [
      {
        key: 'A',
        message: 'Hola {nombre}, ¡te esperamos de vuelta!',
        incentiveId: null,
        weightPercent: 80,
      },
    ],
    controlPercent: 20,
    schedule: { startOn: 'ASAP', sendWithinDays: 2 },
    successMetric: { kind: 'RETURN_VISIT', windowDays: 21 },
    stopConditions: { maxOptOutPercent: 5, maxFailurePercent: 20 },
    rationale: 'Es el grupo con más clientes contactables.',
    selected: true,
    rank: 1,
    selectionReason: 'Mayor alcance sin descuento.',
    ...over,
  };
}

function submit(plans: unknown[], over: Record<string, unknown> = {}) {
  return call('submit_plans', {
    observations: ['Muchos clientes no vuelven después de la primera visita.'],
    hypotheses: [
      {
        statement: 'Un recordatorio puede alcanzar.',
        metrics: ['customers.single_visit_lapsed_30d'],
      },
    ],
    decision: 'PROPOSE',
    noActionReason: null,
    ownerSummary:
      'Hay 8 clientes de una sola visita: los invitaría a volver, sin descuento.',
    nextSteps: ['Pedir el WhatsApp en el mostrador para sumar alcance.'],
    plans,
    ...over,
  });
}

describe('PlannerService (integration)', () => {
  let prisma: PrismaService;
  let available = false;
  const ORIGINAL_ENV = { ...process.env };
  const businesses: string[] = [];
  const NOW = new Date();
  const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

  function makePlanner(provider: AiAgentProvider) {
    const config = new AiConfigService();
    const settings = new RetentionSettingsService(prisma);
    const audit = new AuditService(prisma);
    const consent = new ConsentService(prisma);
    const policies = new PolicyService(prisma, settings, audit);
    return new PlannerService(
      prisma,
      config,
      new AiUsageService(prisma, config),
      provider,
      new BusinessSnapshotService(prisma),
      policies,
      audit,
      new PlanExecutorService(
        prisma,
        new PolicyGateService(prisma, policies, audit),
        new RetentionAssignmentService(prisma),
      ),
      new ConsentAuditService(prisma, consent, audit),
    );
  }

  /** Negocio con 8 clientes de una visita (6 con WhatsApp) y Intelligence prendido. */
  async function business(
    opts: { consented?: number; customers?: number; ai?: boolean } = {},
  ) {
    const id = randomUUID();
    businesses.push(id);
    await prisma.business.create({
      data: {
        id,
        name: 'Café Planificador',
        slug: `planner-${id.slice(0, 8)}`,
        country: 'UY',
        timezone: 'America/Montevideo',
        currency: 'UYU',
        experienceVersion: ExperienceVersion.CHECKIN_V2,
        retentionEngineV2Enabled: true,
      },
    });
    await prisma.retentionSettings.create({
      data: { businessId: id, aiInsightsEnabled: opts.ai ?? true },
    });
    const total = opts.customers ?? 8;
    const consented = opts.consented ?? 6;
    for (let i = 0; i < total; i += 1) {
      const c = await prisma.customer.create({
        data: {
          businessId: id,
          name: `Cliente ${i}`,
          phoneE164: `+5989${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
          ...(i < consented
            ? {
                consentEvents: {
                  create: {
                    businessId: id,
                    channel: 'WHATSAPP',
                    action: 'GRANTED',
                    source: 'CHECKIN_FORM',
                  },
                },
              }
            : {}),
        },
        select: { id: true },
      });
      await prisma.visit.create({
        data: {
          businessId: id,
          customerId: c.id,
          occurredAt: ago(45),
          visitDayKey: ago(45).toISOString().slice(0, 10),
          verificationType: 'persistent_session',
        },
      });
    }
    return id;
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;
    process.env.AI_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'sk-test-never-used';
    prisma = new PrismaService();
    try {
      await prisma.$connect();
      available = true;
    } catch {
      available = false;
    }
  });

  afterAll(async () => {
    process.env = { ...ORIGINAL_ENV };
    if (!available) {
      await prisma?.$disconnect().catch(() => undefined);
      return;
    }
    for (const id of businesses) {
      await prisma.aiUsageEvent.deleteMany({ where: { businessId: id } });
      await prisma.auditLog.deleteMany({ where: { businessId: id } });
      await prisma.visit.deleteMany({ where: { businessId: id } });
      await prisma.customer.deleteMany({ where: { businessId: id } });
      await prisma.business.delete({ where: { id } });
    }
    await prisma.$disconnect();
  });

  it('ciclo completo: mira, propone, elige y simula sin contactar a nadie', async () => {
    if (!available) return;
    const businessId = await business();
    const provider = new ScriptedProvider((_req, round) =>
      round === 1
        ? [
            call('preview_segment', { rule: ONE_VISIT }),
            call('plan_history', {}),
            done(),
          ]
        : [submit([planArgs()]), done()],
    );

    const { run, simulated } = await makePlanner(provider).run(businessId, {
      trigger: 'MANUAL',
      now: NOW,
    });

    expect(simulated).toBe(1);
    expect(run).toMatchObject({
      engine: 'PLANNER',
      status: 'SIMULATED',
      mode: 'DRY_RUN',
    });
    expect(run.explanation).toContain('Simulación: no se contactó a nadie');
    expect(Number(run.aiCostUsd)).toBeGreaterThan(0);

    // La vista previa le dio al modelo conteos, nunca ids.
    const previewOutput = provider.requests[1].input.find(
      (i) => 'type' in i && i.type === 'function_call_output',
    ) as { output: string };
    expect(JSON.parse(previewOutput.output)).toEqual({
      valid: true,
      matched: 8,
      reachable: 6,
      availableNow: 6,
    });

    const plans = await prisma.intelligencePlan.findMany({
      where: { runId: run.id },
    });
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      status: 'SIMULATED',
      matched: 8,
      reachable: 6,
    });
    expect(plans[0].simulation).toMatchObject({
      recipients: 6,
      treated: 5,
      control: 1,
    });

    // Simulación: ni asignaciones, ni mensajes, ni intentos de envío.
    expect(
      await prisma.retentionAssignment.count({ where: { businessId } }),
    ).toBe(0);
    expect(await prisma.message.count({ where: { businessId } })).toBe(0);
    expect(
      await prisma.messageDeliveryAttempt.count({ where: { businessId } }),
    ).toBe(0);

    const usage = await prisma.aiUsageEvent.findFirstOrThrow({
      where: { businessId },
    });
    expect(usage).toMatchObject({
      useCase: 'INTELLIGENCE_PLANNER_RUN',
      model: 'scripted-model',
    });
  });

  it('sin presupuesto de incentivos del dueño, el modelo no ve ningún premio; con presupuesto, sí', async () => {
    if (!available) return;
    const businessId = await business();
    await prisma.retentionIncentiveDefinition.create({
      data: {
        businessId,
        name: 'Café de regalo',
        type: 'gift',
        estimatedCost: 60,
        automationEligible: true,
      },
    });
    const contextOf = async () => {
      const provider = new ScriptedProvider(() => [
        submit([], {
          decision: 'NO_ACTION',
          noActionReason: 'Prueba de contexto.',
          ownerSummary: 'Hoy no conviene escribirle a nadie.',
        }),
        done(),
      ]);
      await makePlanner(provider).run(businessId, {
        trigger: 'MANUAL',
        now: NOW,
      });
      const first = provider.requests[0].input[0] as { content: string };
      return JSON.parse(first.content.slice(first.content.indexOf('{'))) as {
        incentiveCatalog: { label: string }[];
        limits: { incentiveBudgetSet: boolean };
        customerBase: { registered: number; weeklyLimitMode: string };
      };
    };

    const without = await contextOf();
    expect(without.incentiveCatalog).toEqual([]);
    expect(without.limits.incentiveBudgetSet).toBe(false);
    // 8 clientes registrados: base chica, sin tope semanal por porcentaje.
    expect(without.customerBase).toMatchObject({
      registered: 8,
      weeklyLimitMode: 'ADAPTIVE',
    });

    await prisma.retentionSettings.update({
      where: { businessId },
      data: { maxEstimatedIncentiveCostPerMonth: 500 },
    });
    const withBudget = await contextOf();
    expect(withBudget.incentiveCatalog.map((i) => i.label)).toEqual([
      'Café de regalo',
    ]);
    await prisma.retentionIncentiveDefinition.deleteMany({
      where: { businessId },
    });
  });

  it('quien recibió una promoción hace poco descansa: no entra en el plan', async () => {
    if (!available) return;
    const businessId = await business();
    const consented = await prisma.customer.findMany({
      where: { businessId, consentEvents: { some: {} } },
      select: { id: true, phoneE164: true, name: true },
      take: 2,
    });
    const campaign = await prisma.manualCampaign.create({
      data: { businessId, messageBody: 'Hola' },
    });
    await prisma.manualCampaignContact.createMany({
      data: consented.map((c) => ({
        manualCampaignId: campaign.id,
        businessId,
        customerId: c.id,
        phoneE164: c.phoneE164,
        name: c.name ?? 'Cliente',
        status: 'sent',
        sentAt: ago(3),
        createdAt: ago(3),
      })),
    });
    const provider = new ScriptedProvider((_req, round) =>
      round === 1
        ? [call('preview_segment', { rule: ONE_VISIT }), done()]
        : [submit([planArgs()]), done()],
    );
    const { run } = await makePlanner(provider).run(businessId, {
      trigger: 'MANUAL',
      now: NOW,
    });
    const preview = provider.requests[1].input.find(
      (i) => 'type' in i && i.type === 'function_call_output',
    ) as { output: string };
    expect(JSON.parse(preview.output)).toMatchObject({
      reachable: 6,
      availableNow: 4,
    });
    const [plan] = await prisma.intelligencePlan.findMany({
      where: { runId: run.id },
    });
    expect(plan.simulation).toMatchObject({ recipients: 4 });
    await prisma.manualCampaignContact.deleteMany({ where: { businessId } });
    await prisma.manualCampaign.deleteMany({ where: { businessId } });
  });

  it('un descuento inventado se devuelve para corregir, y el corregido se simula', async () => {
    if (!available) return;
    const businessId = await business();
    const provider = new ScriptedProvider((_req, round) =>
      round === 1
        ? [
            submit([
              planArgs({
                variants: [
                  {
                    key: 'A',
                    message: 'Volvé con 20% OFF',
                    incentiveId: null,
                    weightPercent: 80,
                  },
                ],
              }),
            ]),
            done(),
          ]
        : [submit([planArgs()]), done()],
    );

    const { run } = await makePlanner(provider).run(businessId, {
      trigger: 'MANUAL',
      now: NOW,
    });

    expect(run.status).toBe('SIMULATED');
    expect(run.analysis).toMatchObject({ repairs: 1 });
    const feedback = provider.requests[1].input.at(-1) as { output: string };
    expect(feedback.output).toContain('porcentaje');
  });

  it('puede decidir no actuar, y queda registrado por qué', async () => {
    if (!available) return;
    const businessId = await business();
    const provider = new ScriptedProvider(() => [
      submit([], {
        decision: 'NO_ACTION',
        noActionReason:
          'Muy pocos clientes con WhatsApp autorizado para medir algo.',
        ownerSummary:
          'Hoy no conviene escribirle a nadie: primero hay que sumar autorizaciones.',
      }),
      done(),
    ]);
    const { run } = await makePlanner(provider).run(businessId, {
      trigger: 'MANUAL',
      now: NOW,
    });
    expect(run.status).toBe('NO_ACTION');
    expect(run.analysis).toMatchObject({
      decision: 'NO_ACTION',
      noActionReason:
        'Muy pocos clientes con WhatsApp autorizado para medir algo.',
    });
  });

  it('sin consentimiento: el plan elegido queda inviable con el motivo', async () => {
    if (!available) return;
    const businessId = await business({ consented: 0 });
    const provider = new ScriptedProvider(() => [submit([planArgs()]), done()]);
    const { run } = await makePlanner(provider).run(businessId, {
      trigger: 'MANUAL',
      now: NOW,
    });
    expect(run.status).toBe('NO_ACTION');
    const [plan] = await prisma.intelligencePlan.findMany({
      where: { runId: run.id },
    });
    expect(plan.status).toBe('INFEASIBLE');
    expect(JSON.stringify(plan.issues)).toContain('NO_REACH');
  });

  it('no repite un plan simulado hace poco', async () => {
    if (!available) return;
    const businessId = await business();
    const planner = makePlanner(
      new ScriptedProvider(() => [submit([planArgs()]), done()]),
    );
    await planner.run(businessId, { trigger: 'MANUAL', now: NOW });
    const second = await planner.run(businessId, {
      trigger: 'MANUAL',
      now: NOW,
    });
    const [plan] = await prisma.intelligencePlan.findMany({
      where: { runId: second.run.id },
    });
    expect(plan.status).toBe('DUPLICATE');
  });

  it('un resumen con números inventados se reemplaza por uno verificable', async () => {
    if (!available) return;
    const businessId = await business();
    const provider = new ScriptedProvider(() => [
      submit([planArgs()], {
        ownerSummary: 'Esto traería 35 visitas más este mes.',
      }),
      done(),
    ]);
    const { run } = await makePlanner(provider).run(businessId, {
      trigger: 'MANUAL',
      now: NOW,
    });
    expect(run.explanation).not.toContain('35');
    expect(run.explanation).toContain('"Segunda visita" para 6 clientes');
    expect(run.analysis).toMatchObject({ summaryReplaced: true });
  });

  it('sin Intelligence habilitado, ni siquiera llama al modelo', async () => {
    if (!available) return;
    const businessId = await business({ ai: false });
    const provider = new ScriptedProvider(() => [done()]);
    const { run } = await makePlanner(provider).run(businessId, {
      trigger: 'MANUAL',
      now: NOW,
    });
    expect(run.status).toBe('BLOCKED');
    expect(provider.requests).toHaveLength(0);
  });

  it('respeta el tope diario de corridas por negocio', async () => {
    if (!available) return;
    process.env.AI_PLANNER_MAX_RUNS_PER_DAY = '1';
    try {
      const businessId = await business();
      const planner = makePlanner(
        new ScriptedProvider(() => [submit([planArgs()]), done()]),
      );
      await planner.run(businessId, { trigger: 'MANUAL', now: NOW });
      const second = await planner.run(businessId, {
        trigger: 'MANUAL',
        now: NOW,
      });
      expect(second.run.status).toBe('BLOCKED');
      expect(second.run.explanation).toContain('corridas del planificador');
    } finally {
      delete process.env.AI_PLANNER_MAX_RUNS_PER_DAY;
    }
  });

  it('respeta el tope de gasto mensual del planificador', async () => {
    if (!available) return;
    process.env.AI_PLANNER_MONTHLY_USD_CAP = '0.000001';
    try {
      const businessId = await business();
      const planner = makePlanner(
        new ScriptedProvider(() => [submit([planArgs()]), done()]),
      );
      await planner.run(businessId, { trigger: 'MANUAL', now: NOW });
      const second = await planner.run(businessId, {
        trigger: 'MANUAL',
        now: NOW,
      });
      expect(second.run.status).toBe('BLOCKED');
      expect(second.run.explanation).toContain('tope de gasto');
    } finally {
      delete process.env.AI_PLANNER_MONTHLY_USD_CAP;
    }
  });

  it('sin clientes no gasta una llamada al modelo', async () => {
    if (!available) return;
    const businessId = await business({ customers: 0 });
    const provider = new ScriptedProvider(() => [done()]);
    const { run } = await makePlanner(provider).run(businessId, {
      trigger: 'MANUAL',
      now: NOW,
    });
    expect(run.status).toBe('NO_ACTION');
    expect(provider.requests).toHaveLength(0);
  });

  it('un modelo que solo explora es obligado a entregar en las últimas rondas', async () => {
    if (!available) return;
    const businessId = await business();
    const provider = new ScriptedProvider((req) =>
      typeof req.toolChoice === 'object'
        ? [submit([planArgs()]), done()]
        : [call('preview_segment', { rule: ONE_VISIT }), done()],
    );
    const { run } = await makePlanner(provider).run(businessId, {
      trigger: 'MANUAL',
      now: NOW,
    });
    expect(run.status).toBe('SIMULATED');
    const trace = (run.analysis as { trace: { tools: string[] }[] }).trace;
    expect(trace.at(-1)!.tools).toEqual(['submit_plans']);
    expect(trace.length).toBeLessThanOrEqual(8);
  });

  it('si el modelo nunca entrega, la corrida falla sin contactar a nadie', async () => {
    if (!available) return;
    const businessId = await business();
    const provider = new ScriptedProvider(() => [done()]);
    const { run } = await makePlanner(provider).run(businessId, {
      trigger: 'MANUAL',
      now: NOW,
    });
    expect(run.status).toBe('FAILED');
    expect(run.explanation).toContain('No se contactó a nadie');
  });
});
