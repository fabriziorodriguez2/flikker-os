import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { ExperienceVersion, RetentionAssignmentStatus } from '@prisma/client';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AI_AGENT_PROVIDER,
  type AgentStreamEvent,
  type AgentTurnRequest,
  type AiAgentProvider,
} from '../../ai/ai-agent-provider.interface';
import { AutonomyModule } from '../autonomy/autonomy.module';
import { RetentionV2SendService } from '../../retention-v2/retention-v2-send.service';
import { RetentionV2MessageDispatchService } from '../../retention-v2/retention-v2-message-dispatch.service';
import { PlannerService } from './planner.service';
import { PlanMeasurementService } from './plan-measurement.service';
import { PlanControlService } from './plan-control.service';
import { POLICY_VERSION } from '../../policy/policy-rules';

// WhatsApp falso: ningún test de este archivo puede llegar al proveedor real.
const mockProviderSend = jest.fn();
jest.mock('../../../jobs/whatsapp-provider.factory', () => ({
  getWhatsAppProvider: () => ({
    name: 'fake-lifecycle',
    isAvailable: () => Promise.resolve(true),
    sendText: (input: unknown): unknown => mockProviderSend(input),
  }),
}));

/**
 * La cadena completa de un plan comercial, contra Postgres real y con un
 * modelo guionado (nunca OpenAI, nunca WhatsApp real):
 *
 * planificador → plan validado → experimento de Autopilot → envío por la capa
 * de mensajería → vueltas → medición → memoria para la próxima corrida.
 *
 * Y los frenos: sin autorización de ejecución solo simula; si se apaga a mitad
 * de camino, lo pendiente no sale; si se cumplen las condiciones de corte, el
 * plan se detiene.
 */

type Script = (request: AgentTurnRequest, round: number) => AgentStreamEvent[];

class ScriptedProvider implements AiAgentProvider {
  readonly configured = true;
  readonly requests: AgentTurnRequest[] = [];
  script: Script = () => [];
  // eslint-disable-next-line @typescript-eslint/require-await
  async *streamAgentTurn(request: AgentTurnRequest) {
    this.requests.push({ ...request, input: [...request.input] });
    for (const event of this.script(request, this.requests.length)) yield event;
  }
}

const done = (): AgentStreamEvent => ({
  type: 'completed',
  model: 'scripted',
  inputTokens: 5_000,
  outputTokens: 500,
  status: 'completed',
});
const call = (name: string, args: unknown): AgentStreamEvent => ({
  type: 'tool_call',
  callId: `c-${randomUUID().slice(0, 8)}`,
  name,
  arguments: JSON.stringify(args),
});
const ONE_VISIT = JSON.stringify({ field: 'visitCount', op: 'eq', value: 1 });
const submitOnePlan = (
  lapsed = 20,
  over: { title?: string; rule?: string; maxRecipients?: number } = {},
) =>
  call('submit_plans', {
    observations: ['Muchos clientes vinieron una sola vez.'],
    hypotheses: [
      {
        statement: 'Un recordatorio amable alcanza.',
        metrics: ['customers.single_visit_lapsed_30d'],
      },
    ],
    decision: 'PROPOSE',
    noActionReason: null,
    ownerSummary:
      'Invitaría a volver a quienes vinieron una sola vez, sin descuento.',
    nextSteps: [],
    plans: [
      {
        schemaVersion: 1,
        title: over.title ?? 'Segunda visita sin descuento',
        objective: 'SECOND_VISIT',
        hypothesis: 'Quienes vinieron una sola vez vuelven si se los invita.',
        evidence: [
          {
            metric: 'customers.single_visit_lapsed_30d',
            value: lapsed,
            statement: `${lapsed} clientes vinieron una sola vez y no volvieron.`,
          },
        ],
        segment: {
          description: 'Una sola visita',
          rule: over.rule ?? ONE_VISIT,
          maxRecipients: over.maxRecipients ?? 50,
        },
        channel: 'WHATSAPP',
        variants: [
          {
            key: 'A',
            message: 'Hola {nombre}, ¡te esperamos de vuelta esta semana!',
            incentiveId: null,
            weightPercent: 80,
          },
        ],
        controlPercent: 20,
        schedule: { startOn: 'ASAP', sendWithinDays: 2 },
        successMetric: { kind: 'RETURN_VISIT', windowDays: 14 },
        stopConditions: { maxOptOutPercent: 5, maxFailurePercent: 20 },
        rationale: 'El grupo más grande y sin costo de incentivo.',
        selected: true,
        rank: 1,
        selectionReason: 'Más alcance.',
      },
    ],
  });

describe('Plan comercial de punta a punta (integration, simulación)', () => {
  let prisma: PrismaService;
  let planner: PlannerService;
  let measurement: PlanMeasurementService;
  let planControl: PlanControlService;
  let send: RetentionV2SendService;
  let dispatch: RetentionV2MessageDispatchService;
  const provider = new ScriptedProvider();
  let available = false;
  const ORIGINAL_ENV = { ...process.env };
  const businesses: string[] = [];
  const NOW = new Date();
  const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
  const later = (d: number) => new Date(NOW.getTime() + d * 86_400_000);

  async function business(opts: { execute: boolean; customers?: number }) {
    const id = randomUUID();
    businesses.push(id);
    await prisma.business.create({
      data: {
        id,
        name: 'Café Ciclo',
        slug: `plan-cycle-${id.slice(0, 8)}`,
        country: 'UY',
        timezone: 'America/Montevideo',
        currency: 'UYU',
        experienceVersion: ExperienceVersion.CHECKIN_V2,
        retentionEngineV2Enabled: true,
      },
    });
    await prisma.retentionSettings.create({
      data: {
        businessId: id,
        aiInsightsEnabled: true,
        sendingHourStart: 0,
        sendingHourEnd: 24,
        allowedSendingDays: [1, 2, 3, 4, 5, 6, 7],
      },
    });
    await prisma.businessPolicy.create({
      data: {
        businessId: id,
        acceptedAt: new Date(),
        acceptedVersion: POLICY_VERSION,
        confirmedCurrency: 'UYU',
        confirmedTimezone: 'America/Montevideo',
        messagingBudgetMonthly: 500,
        weeklyReachPercent: 50,
        maxNewCampaignsPerWeek: 5,
        maxCampaignSharePercent: 100,
        messageUnitCost: 2,
        messageUnitCostCurrency: 'UYU',
        autonomyMode: opts.execute ? 'PILOT' : 'DRY_RUN',
        autonomyPlannerEnabled: true,
        autonomyPlannerExecutionEnabled: opts.execute,
      },
    });
    // 20 clientes de una sola visita, todos con WhatsApp autorizado.
    for (let i = 0; i < (opts.customers ?? 20); i += 1) {
      const c = await prisma.customer.create({
        data: {
          businessId: id,
          name: `Cliente${i} Apellido`,
          phoneE164: `+5989${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
          consentEvents: {
            create: {
              businessId: id,
              channel: 'WHATSAPP',
              action: 'GRANTED',
              source: 'CHECKIN_FORM',
            },
          },
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

  /** Lo que haría el worker diario: procesar cada asignación y despacharla. */
  async function deliverAll(businessId: string, at: Date) {
    const pending = await prisma.retentionAssignment.findMany({
      where: { businessId, status: RetentionAssignmentStatus.PENDING },
      select: { id: true },
    });
    for (const a of pending) {
      const outcome = await send.processAssignment(a.id, at);
      if (outcome.status === 'sent')
        await dispatch.dispatch(outcome.messageId, at);
    }
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;
    process.env.AI_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'sk-test-never-used';
    process.env.AI_PLANNER_MAX_RUNS_PER_DAY = '20';
    try {
      const moduleRef = await Test.createTestingModule({
        imports: [PrismaModule, AutonomyModule],
      })
        .overrideProvider(AI_AGENT_PROVIDER)
        .useValue(provider)
        .compile();
      prisma = moduleRef.get(PrismaService);
      planner = moduleRef.get(PlannerService);
      measurement = moduleRef.get(PlanMeasurementService);
      planControl = moduleRef.get(PlanControlService);
      send = moduleRef.get(RetentionV2SendService);
      dispatch = moduleRef.get(RetentionV2MessageDispatchService);
      await prisma.$connect();
      available = true;
    } catch {
      available = false;
    }
  });

  beforeEach(() => {
    mockProviderSend.mockReset();
    mockProviderSend.mockImplementation(() =>
      Promise.resolve({
        providerMessageId: `wa-${randomUUID().slice(0, 6)}`,
        status: 'accepted',
      }),
    );
    provider.script = (_req, round) =>
      round % 2 === 1
        ? [call('plan_history', {}), done()]
        : [submitOnePlan(), done()];
    provider.requests.length = 0;
  });

  afterAll(async () => {
    process.env = { ...ORIGINAL_ENV };
    if (!available) return;
    for (const id of businesses) {
      await prisma.message.deleteMany({ where: { businessId: id } });
      await prisma.retentionAssignment.deleteMany({
        where: { businessId: id },
      });
      await prisma.retentionVariant.deleteMany({ where: { businessId: id } });
      await prisma.retentionExperiment.deleteMany({
        where: { businessId: id },
      });
      await prisma.aiUsageEvent.deleteMany({ where: { businessId: id } });
      await prisma.auditLog.deleteMany({ where: { businessId: id } });
      await prisma.visit.deleteMany({ where: { businessId: id } });
      await prisma.customer.deleteMany({ where: { businessId: id } });
      await prisma.business.delete({ where: { id } });
    }
    await prisma.$disconnect();
  });

  it('arma el módulo real (si no, los demás tests no probarían nada)', () => {
    if (!process.env.DATABASE_URL) return;
    expect(available).toBe(true);
  });

  it('ejecuta, envía por la capa de mensajería, mide y lo recuerda en la próxima corrida', async () => {
    if (!available) return;
    const businessId = await business({ execute: true });

    // 1. Planificar y ejecutar.
    const { run } = await planner.run(businessId, {
      trigger: 'MANUAL',
      now: NOW,
    });
    expect(run).toMatchObject({
      status: 'EXECUTED',
      mode: 'PILOT',
      engine: 'PLANNER',
    });
    const plan = await prisma.intelligencePlan.findFirstOrThrow({
      where: { runId: run.id },
      include: { experiment: { include: { variants: true } } },
    });
    expect(plan.status).toBe('EXECUTING');
    expect(plan.experiment).toMatchObject({
      objective: 'INTELLIGENCE_PLAN',
      status: 'RUNNING',
      controlPercent: 20,
    });
    expect(plan.experiment!.variants.map((v) => v.strategyType).sort()).toEqual(
      ['CONTROL', 'REMINDER'],
    );
    const assignments = await prisma.retentionAssignment.count({
      where: { experimentId: plan.experiment!.id },
    });
    expect(assignments).toBe(20);
    expect(run.assignedCount).toBe(20);

    // 2. Enviar, como el worker: texto del plan, con el nombre, por la capa de mensajería.
    await deliverAll(businessId, NOW);
    const sent = await prisma.message.findMany({
      where: { businessId, status: 'sent' },
      select: { id: true, body: true, customer: { select: { name: true } } },
    });
    expect(sent.length).toBeGreaterThan(0);
    for (const m of sent) {
      expect(m.body).toContain(
        `Hola ${m.customer.name.split(' ')[0]}, ¡te esperamos de vuelta`,
      );
      expect(m.body).not.toContain('{nombre}');
    }
    const attempts = await prisma.messageDeliveryAttempt.findMany({
      where: { businessId },
    });
    expect(attempts).toHaveLength(sent.length);
    expect(
      attempts.every(
        (a) => a.status === 'ACCEPTED' && a.purpose === 'AUTOPILOT',
      ),
    ).toBe(true);
    const control = await prisma.retentionAssignment.count({
      where: { experimentId: plan.experiment!.id, status: 'OBSERVING' },
    });
    expect(control + sent.length).toBe(20);

    // Volver a correr el envío no manda nada de nuevo.
    await deliverAll(businessId, NOW);
    expect(mockProviderSend).toHaveBeenCalledTimes(sent.length);

    // 3. Vuelven dos contactados (uno por el link del mensaje) y uno del control.
    const sentAssignments = await prisma.retentionAssignment.findMany({
      where: { experimentId: plan.experiment!.id, status: 'SENT' },
      select: { customerId: true, messageId: true },
    });
    const controlAssignment = await prisma.retentionAssignment.findFirst({
      where: { experimentId: plan.experiment!.id, status: 'OBSERVING' },
      select: { customerId: true },
    });
    const visitAt = later(2);
    const visit = (customerId: string, messageId: string | null) =>
      prisma.visit.create({
        data: {
          businessId,
          customerId,
          messageId,
          occurredAt: visitAt,
          visitDayKey: visitAt.toISOString().slice(0, 10),
          verificationType: 'persistent_session',
        },
      });
    await visit(sentAssignments[0].customerId, sentAssignments[0].messageId);
    await visit(sentAssignments[1].customerId, null);
    if (controlAssignment) await visit(controlAssignment.customerId, null);

    // 4. Medir durante y al cerrar.
    const interim = await measurement.refresh(plan.id, later(3));
    expect(interim).toMatchObject({
      phase: 'MEASURING',
      evidence: 'SIGNAL_ONLY',
    });
    expect(interim!.treated).toMatchObject({ returned: 2, attributed: 1 });
    expect(
      (
        await prisma.intelligencePlan.findUniqueOrThrow({
          where: { id: plan.id },
        })
      ).status,
    ).toBe('MEASURING');

    const final = await measurement.refresh(plan.id, later(20));
    expect(final!.phase).toBe('COMPLETED');
    const closed = await prisma.intelligencePlan.findUniqueOrThrow({
      where: { id: plan.id },
      include: { experiment: true },
    });
    expect(closed.status).toBe('COMPLETED');
    expect(closed.experiment!.status).toBe('COMPLETED');
    expect(final!.readout).toContain('no se puede afirmar');

    // 5. La próxima corrida ve el resultado en su historial.
    provider.requests.length = 0;
    await planner.run(businessId, { trigger: 'MANUAL', now: later(21) });
    const historyOutput = provider.requests
      .flatMap((r) => r.input)
      .find(
        (i) =>
          'output' in i && i.output.includes('Segunda visita sin descuento'),
      ) as { output: string } | undefined;
    expect(historyOutput).toBeDefined();
    const history = JSON.parse(historyOutput!.output) as {
      plans: {
        status: string;
        result: { evidence: string; treated: { returned: number } } | null;
      }[];
    };
    const remembered = history.plans.find((p) => p.status === 'COMPLETED');
    expect(remembered?.result).toMatchObject({
      evidence: 'SIGNAL_ONLY',
      treated: { returned: 2 },
    });
  });

  it('con un único cliente: campaña exploratoria, sin grupo de control, solo lo observado', async () => {
    if (!available) return;
    const businessId = await business({ execute: true, customers: 1 });
    provider.script = (_req, round) =>
      round % 2 === 1
        ? [call('plan_history', {}), done()]
        : [submitOnePlan(1), done()];
    const { run } = await planner.run(businessId, {
      trigger: 'MANUAL',
      now: NOW,
    });
    expect(`${run.status}: ${run.explanation}`).toMatch(/^EXECUTED/);
    const plan = await prisma.intelligencePlan.findFirstOrThrow({
      where: { runId: run.id },
      include: { experiment: true },
    });
    expect(plan.simulation).toMatchObject({
      recipients: 1,
      treated: 1,
      control: 0,
      exploratory: true,
    });
    expect(plan.results).toMatchObject({ recipients: 1, exploratory: true });

    // El único cliente recibe el mensaje: nunca queda en un "control" de uno.
    await deliverAll(businessId, NOW);
    const assignment = await prisma.retentionAssignment.findFirstOrThrow({
      where: { experimentId: plan.experiment!.id },
      include: { variant: true },
    });
    expect(assignment.variant.strategyType).toBe('REMINDER');
    expect(assignment.status).toBe('SENT');
    expect(mockProviderSend).toHaveBeenCalledTimes(1);

    await prisma.visit.create({
      data: {
        businessId,
        customerId: assignment.customerId,
        messageId: assignment.messageId,
        occurredAt: later(2),
        visitDayKey: later(2).toISOString().slice(0, 10),
        verificationType: 'persistent_session',
      },
    });
    const results = await measurement.refresh(plan.id, later(3));
    expect(results).toMatchObject({
      evidence: 'OBSERVED_ONLY',
      exploratory: true,
      treated: { contacted: 1, returned: 1 },
      control: { assigned: 0 },
      liftPoints: null,
    });
    expect(results!.readout).toContain('no demuestra');
  });

  it('una campaña aprobada no se recorta después por el tope semanal', async () => {
    if (!available) return;
    const businessId = await business({ execute: true });
    // 150 clientes más, registrados hace un mes y sin WhatsApp: la semana
    // arranca en modo % (50% de 20 contactables = 10 por semana).
    await prisma.customer.createMany({
      data: Array.from({ length: 150 }, (_, i) => ({
        id: randomUUID(),
        businessId,
        name: `Viejo${i}`,
        phoneE164: `+5988${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
        createdAt: ago(30),
      })),
    });
    const { run } = await planner.run(businessId, {
      trigger: 'MANUAL',
      now: NOW,
    });
    expect(`${run.status}: ${run.explanation}`).toMatch(/^EXECUTED/);
    const plan = await prisma.intelligencePlan.findFirstOrThrow({
      where: { runId: run.id },
    });
    expect(plan.simulation).toMatchObject({ recipients: 10 });

    // Después de aprobada, el dueño baja el alcance al 1% (tope 1). Lo ya
    // autorizado sale igual: no se cancela ni se recorta a mitad de camino.
    await prisma.businessPolicy.update({
      where: { businessId },
      data: { weeklyReachPercent: 1 },
    });
    await deliverAll(businessId, NOW);
    const sent = await prisma.retentionAssignment.count({
      where: { businessId, status: 'SENT' },
    });
    const skipped = await prisma.retentionAssignment.count({
      where: { businessId, status: 'SKIPPED' },
    });
    expect(skipped).toBe(0);
    expect(sent).toBeGreaterThan(1);
    expect(mockProviderSend).toHaveBeenCalledTimes(sent);
  });

  describe('pausar, reanudar y cancelar una campaña', () => {
    const users: string[] = [];
    async function owner() {
      const u = await prisma.user.create({
        data: {
          email: `plan-owner-${randomUUID()}@test.local`,
          passwordHash: 'x',
          firstName: 'Dueña',
          lastName: 'Ciclo',
        },
        select: { id: true },
      });
      users.push(u.id);
      return u.id;
    }
    afterAll(async () => {
      if (!available) return;
      // Los AuditLog se borran con cada negocio (afterAll de arriba corre después).
      await prisma.auditLog.deleteMany({
        where: { actorUserId: { in: users } },
      });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    });

    async function runPlan(
      businessId: string,
      over: Parameters<typeof submitOnePlan>[1],
    ) {
      provider.script = (_req, round) =>
        round % 2 === 1
          ? [call('plan_history', {}), done()]
          : [submitOnePlan(20, over), done()];
      provider.requests.length = 0;
      const { run } = await planner.run(businessId, {
        trigger: 'MANUAL',
        now: NOW,
      });
      expect(`${run.status}: ${run.explanation}`).toMatch(/^EXECUTED/);
      return prisma.intelligencePlan.findFirstOrThrow({
        where: { runId: run.id },
        include: { experiment: true },
      });
    }
    const assignmentsOf = (experimentId: string) =>
      prisma.retentionAssignment.findMany({
        where: { experimentId },
        select: {
          id: true,
          customerId: true,
          status: true,
          skipReason: true,
          variant: { select: { strategyType: true } },
        },
      });

    it('pausar una frena solo esa; reanudar revalida y no duplica contactos', async () => {
      if (!available) return;
      const businessId = await business({ execute: true });
      const userId = await owner();
      const a = await runPlan(businessId, {
        title: 'Plan A',
        maxRecipients: 10,
      });
      const b = await runPlan(businessId, {
        title: 'Plan B',
        rule: JSON.stringify({ field: 'visitCount', op: 'gte', value: 1 }),
        maxRecipients: 10,
      });

      // Un mensaje de A ya encolado (creado, sin despachar) antes de pausar.
      const [firstA] = (await assignmentsOf(a.experiment!.id)).filter(
        (x) => x.status === 'PENDING',
      );
      let queued: string | null = null;
      for (const x of await assignmentsOf(a.experiment!.id)) {
        const outcome = await send.processAssignment(x.id, NOW);
        if (outcome.status === 'sent') {
          queued = outcome.messageId;
          break;
        }
      }
      expect(firstA).toBeDefined();
      expect(queued).not.toBeNull();

      const paused = await planControl.pause(businessId, a.id, userId);
      expect(paused).toMatchObject({ paused: true, status: 'EXECUTING' });
      expect(paused.events[0]).toMatchObject({
        action: 'PAUSED',
        by: { id: userId, name: 'Dueña Ciclo' },
      });
      await expect(planControl.pause(businessId, a.id, userId)).rejects.toThrow(
        'ya está pausada',
      );
      // Otro negocio no la ve (ni la puede pausar).
      await expect(
        planControl.pause(randomUUID(), a.id, userId),
      ).rejects.toThrow('no encontrada');

      // Lo encolado de A espera; lo pendiente de A no sale; B sale entero.
      expect(await dispatch.dispatch(queued!, NOW)).toMatchObject({
        status: 'deferred',
        reasonCode: 'PLAN_PAUSED',
      });
      await deliverAll(businessId, NOW);
      const afterPause = await assignmentsOf(a.experiment!.id);
      expect(afterPause.filter((x) => x.status === 'SENT')).toHaveLength(1);
      expect(afterPause.filter((x) => x.status === 'SKIPPED')).toHaveLength(0);
      const sentB = (await assignmentsOf(b.experiment!.id)).filter(
        (x) => x.status === 'SENT',
      );
      expect(sentB.length).toBeGreaterThan(0);
      expect(mockProviderSend).toHaveBeenCalledTimes(sentB.length);

      // Reanudar con el presupuesto agotado: sigue pausada y dice por qué.
      await prisma.businessPolicy.update({
        where: { businessId },
        data: { messagingBudgetMonthly: 1 },
      });
      await expect(
        planControl.resume(businessId, a.id, userId, NOW),
      ).rejects.toThrow('sigue pausada');
      expect(
        (
          await prisma.retentionExperiment.findUniqueOrThrow({
            where: { id: a.experiment!.id },
          })
        ).status,
      ).toBe('PAUSED');
      await prisma.businessPolicy.update({
        where: { businessId },
        data: { messagingBudgetMonthly: 500 },
      });

      // Reanudar: quien ya recibió el mensaje de B queda afuera (frecuencia).
      // El grupo de control no recibe nada: no se revalida ni se descarta.
      const resumed = await planControl.resume(businessId, a.id, userId, NOW);
      expect(resumed.paused).toBe(false);
      expect(resumed.events.map((e) => e.action)).toEqual([
        'RESUMED',
        'PAUSED',
      ]);
      const contactedByB = new Set(sentB.map((x) => x.customerId));
      for (const x of await assignmentsOf(a.experiment!.id)) {
        const treated = x.variant.strategyType !== 'CONTROL';
        if (
          treated &&
          x.status === 'PENDING' &&
          contactedByB.has(x.customerId)
        ) {
          throw new Error('un cliente contactado por B siguió pendiente en A');
        }
        if (x.status === 'SKIPPED') {
          expect(x.skipReason).toBe('RESUME_RECENT_PROMOTION');
        }
      }
      expect(await dispatch.dispatch(queued!, NOW)).toMatchObject({
        status: 'sent',
      });
      await deliverAll(businessId, NOW);
      // Nadie recibió dos promociones.
      const perCustomer = new Map<string, number>();
      for (const m of await prisma.message.findMany({
        where: { businessId, status: 'sent' },
        select: { customerId: true },
      })) {
        perCustomer.set(m.customerId, (perCustomer.get(m.customerId) ?? 0) + 1);
      }
      expect(Math.max(...perCustomer.values())).toBe(1);
    });

    it('cancelar: lo enviado queda, lo pendiente no sale nunca y queda registrado', async () => {
      if (!available) return;
      const businessId = await business({ execute: true });
      const userId = await owner();
      const plan = await runPlan(businessId, { maxRecipients: 10 });
      const pending = await assignmentsOf(plan.experiment!.id);
      for (const x of pending.slice(0, 4)) {
        const outcome = await send.processAssignment(x.id, NOW);
        if (outcome.status === 'sent')
          await dispatch.dispatch(outcome.messageId, NOW);
      }
      const sentBefore = (await assignmentsOf(plan.experiment!.id)).filter(
        (x) => x.status === 'SENT',
      ).length;
      expect(sentBefore).toBeGreaterThan(0);

      const cancelled = await planControl.cancel(
        businessId,
        plan.id,
        userId,
        NOW,
      );
      expect(cancelled).toMatchObject({
        status: 'STOPPED',
        stopReason: 'CANCELLED_BY_OWNER',
        paused: false,
      });
      expect(cancelled.events[0]).toMatchObject({
        action: 'CANCELLED',
        by: { id: userId },
      });
      const after = await assignmentsOf(plan.experiment!.id);
      expect(after.filter((x) => x.status === 'SENT')).toHaveLength(sentBefore);
      expect(after.some((x) => x.status === 'PENDING')).toBe(false);
      expect(
        after.filter((x) => x.skipReason === 'PLAN_CANCELLED').length,
      ).toBeGreaterThan(0);

      const calls = mockProviderSend.mock.calls.length;
      await deliverAll(businessId, later(1));
      expect(mockProviderSend).toHaveBeenCalledTimes(calls);
      await expect(
        planControl.cancel(businessId, plan.id, userId, NOW),
      ).rejects.toThrow('ya terminó');
      await expect(
        planControl.resume(businessId, plan.id, userId, NOW),
      ).rejects.toThrow('ya terminó');

      // La política global no se tocó.
      expect(
        (
          await prisma.businessPolicy.findUniqueOrThrow({
            where: { businessId },
          })
        ).paused,
      ).toBe(false);
    });
  });

  it('sin autorización de ejecución, el mismo plan solo se simula', async () => {
    if (!available) return;
    const businessId = await business({ execute: false });
    const { run } = await planner.run(businessId, {
      trigger: 'MANUAL',
      now: NOW,
    });
    expect(run).toMatchObject({ status: 'SIMULATED', mode: 'DRY_RUN' });
    expect(
      await prisma.retentionExperiment.count({ where: { businessId } }),
    ).toBe(0);
    expect(
      await prisma.retentionAssignment.count({ where: { businessId } }),
    ).toBe(0);
    expect(mockProviderSend).not.toHaveBeenCalled();
  });

  it('si se apaga la ejecución a mitad de camino, lo pendiente no sale', async () => {
    if (!available) return;
    const businessId = await business({ execute: true });
    await planner.run(businessId, { trigger: 'MANUAL', now: NOW });
    await prisma.businessPolicy.update({
      where: { businessId },
      data: { autonomyPlannerExecutionEnabled: false },
    });
    await deliverAll(businessId, NOW);
    expect(mockProviderSend).not.toHaveBeenCalled();
    expect(
      await prisma.retentionAssignment.count({
        where: { businessId, status: 'SENT' },
      }),
    ).toBe(0);
  });

  it('con bajas por encima del corte, el plan se detiene y lo pendiente no sale', async () => {
    if (!available) return;
    const businessId = await business({ execute: true });
    const { run } = await planner.run(businessId, {
      trigger: 'MANUAL',
      now: NOW,
    });
    const plan = await prisma.intelligencePlan.findFirstOrThrow({
      where: { runId: run.id },
    });

    // Se manda a la mitad, y dos de esos piden la baja.
    const pending = await prisma.retentionAssignment.findMany({
      where: { businessId, status: 'PENDING' },
      select: { id: true },
    });
    for (const a of pending.slice(0, 10)) {
      const outcome = await send.processAssignment(a.id, NOW);
      if (outcome.status === 'sent')
        await dispatch.dispatch(outcome.messageId, NOW);
    }
    const contacted = await prisma.retentionAssignment.findMany({
      where: { businessId, status: 'SENT' },
      select: { customerId: true },
      take: 2,
    });
    expect(contacted).toHaveLength(2);
    for (const c of contacted) {
      await prisma.customerConsentEvent.create({
        data: {
          businessId,
          customerId: c.customerId,
          channel: 'WHATSAPP',
          action: 'REVOKED',
          source: 'INBOUND_KEYWORD',
          createdAt: later(1),
        },
      });
    }

    const results = await measurement.refresh(plan.id, later(1));
    expect(results!.stop).toEqual({ triggered: true, reason: 'OPT_OUTS' });
    const stopped = await prisma.intelligencePlan.findUniqueOrThrow({
      where: { id: plan.id },
    });
    expect(stopped).toMatchObject({
      status: 'STOPPED',
      stopReason: 'OPT_OUTS',
    });
    expect(
      await prisma.retentionAssignment.count({
        where: { businessId, status: 'PENDING' },
      }),
    ).toBe(0);
    const before = mockProviderSend.mock.calls.length;
    await deliverAll(businessId, later(1));
    expect(mockProviderSend).toHaveBeenCalledTimes(before);
  });
});
