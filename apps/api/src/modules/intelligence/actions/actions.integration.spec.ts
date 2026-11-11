import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import {
  BenefitType,
  CampaignStatus,
  CampaignTemplateKind,
  DestinationType,
  IntelligenceActionKind,
  IntelligenceActionStatus,
  MembershipRole,
  MissionPeriodPreset,
  MissionStatus,
} from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtGuard } from '../../auth/guards/jwt.guard';
import { HttpExceptionFilter } from '../../../common/filters/http-exception.filter';
import { AiConfigService } from '../../ai/ai-config.service';
import {
  AI_AGENT_PROVIDER,
  type AgentStreamEvent,
  type AgentTurnRequest,
  type AiAgentProvider,
} from '../../ai/ai-agent-provider.interface';
import { WhatsAppBspService } from '../../../jobs/whatsapp-bsp.service';
import { NotificationsPromotionsService } from '../../notifications/notifications-promotions.service';
import {
  createTestBusiness,
  createTestCampaign,
  createTestMembership,
  createTestUser,
  makeTestSuffix,
} from '../../reviews/reviews.test-helpers';
import { IntelligenceModule } from '../intelligence.module';
import { ConversationsService } from '../conversations.service';
import { AgentService, type AgentServerEvent } from '../agent/agent.service';
import { AgentToolsService } from '../agent/agent-tools.service';
import { UNVERIFIED_ANSWER_TEXT } from '../agent/agent-prompt';
import { ActionsService, type ActionView } from './actions.service';
import type { ActionParams } from './action-plan';
import { zonedMidnightToUtc } from '../../../jobs/owner-lifecycle-time';

// Los envíos pasan por MessagingService, que le pide el proveedor a la
// factory: se reemplaza para que ningún test llegue a WhatsApp de verdad, y
// delega en el espía de `WhatsAppBspService.sendText` de abajo para contar
// qué se mandó.
jest.mock('../../../jobs/whatsapp-provider.factory', () => ({
  getWhatsAppProvider: () => ({
    name: 'fake-test',
    isAvailable: () => Promise.resolve(true),
    sendText: async (input: { to: string; text: string }) => {
      const bsp = jest.requireActual<{
        WhatsAppBspService: {
          prototype: {
            sendText: (i: { phone: string; text: string }) => Promise<{
              whatsappMessageId: string;
            }>;
          };
        };
      }>('../../../jobs/whatsapp-bsp.service');
      const result = await bsp.WhatsAppBspService.prototype.sendText({
        phone: input.to,
        text: input.text,
      });
      return {
        providerMessageId: result.whatsappMessageId,
        status: 'accepted',
      };
    },
  }),
}));

class FakeJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const userId = req.headers['x-test-user-id'];
    if (!userId) return false;
    req.user = {
      id: userId,
      email: 'a@test.local',
      firstName: 'A',
      lastName: 'T',
      isActive: true,
      isPlatformAdmin: false,
    };
    return true;
  }
}

type Script = (
  req: AgentTurnRequest,
) => Iterable<AgentStreamEvent> | AsyncIterable<AgentStreamEvent>;

class ScriptedProvider implements AiAgentProvider {
  readonly configured = true;
  script: Script = () => [];
  lastToolNames: string[] = [];
  toolChoices: AgentTurnRequest['toolChoice'][] = [];
  async *streamAgentTurn(req: AgentTurnRequest) {
    this.lastToolNames = req.tools.map((t) => t.name);
    this.toolChoices.push(req.toolChoice);
    for await (const event of this.script(req)) yield event;
  }
}

const completed = (): AgentStreamEvent => ({
  type: 'completed',
  status: 'completed',
  model: 'gpt-test',
  inputTokens: 100,
  outputTokens: 20,
});

/** Primera ronda: pide la herramienta. Segunda: responde `answer`. */
function toolThenAnswer(
  tool: string,
  args: Record<string, unknown>,
  answer: string,
): Script {
  return function* (req) {
    const hasOutput = req.input.some(
      (i) => 'type' in i && i.type === 'function_call_output',
    );
    if (!hasOutput) {
      yield {
        type: 'tool_call',
        callId: `call-${randomUUID()}`,
        name: tool,
        arguments: JSON.stringify(args),
      };
      yield completed();
      return;
    }
    yield { type: 'text_delta', delta: answer };
    yield completed();
  };
}

// Reloj real: la confirmación por HTTP usa la hora del servidor.
const NOW = new Date();
const TZ = 'America/Montevideo';
const localDay = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(date);
const TODAY = localDay(NOW);
const IN_30_DAYS = localDay(new Date(NOW.getTime() + 30 * 86_400_000));
const IN_10_DAYS = localDay(new Date(NOW.getTime() + 10 * 86_400_000));

describe('Intelligence actions (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let actions: ActionsService;
  let agent: AgentService;
  let tools: AgentToolsService;
  let conversations: ConversationsService;
  let promotions: NotificationsPromotionsService;
  const provider = new ScriptedProvider();
  const whatsAppSend = jest.spyOn(WhatsAppBspService.prototype, 'sendText');

  const ids = {
    users: [] as string[],
    businesses: [] as string[],
    plans: [] as string[],
  };
  let biz: string;
  let second: string;
  let other: string;
  let owner: string;
  let operator: string;
  let outsider: string;
  let conversationId: string;
  let s: string;

  const seed = {
    rewardBenefit: '',
    activeBenefit: '',
    inactiveBenefit: '',
    otherBenefit: '',
    templateCampaign: '',
    otherCampaign: '',
    mission: '',
  };

  const ctx = (
    overrides: Partial<{
      userId: string;
      role: MembershipRole;
      businessId: string;
      source: string;
      now: Date;
    }> = {},
  ) => ({
    businessId: overrides.businessId ?? biz,
    userId: overrides.userId ?? owner,
    role: overrides.role ?? MembershipRole.OWNER,
    conversationId,
    sourceMessageId: overrides.source ?? randomUUID(),
    now: overrides.now ?? NOW,
  });

  async function propose(
    kind: IntelligenceActionKind,
    params: ActionParams,
    overrides: Parameters<typeof ctx>[0] = {},
  ): Promise<ActionView> {
    const outcome = await actions.request(ctx(overrides), kind, params);
    if (!outcome.ok) throw new Error(`${outcome.code}: ${outcome.message}`);
    return outcome.action;
  }

  const as = (userId: string, businessId = biz) => ({
    'x-test-user-id': userId,
    'x-business-id': businessId,
  });

  const confirmHttp = (
    action: { id: string; planHash: string },
    userId = owner,
    businessId = biz,
  ) =>
    request(app.getHttpServer())
      .post(`/intelligence/actions/${action.id}/confirm`)
      .set(as(userId, businessId))
      .send({ planHash: action.planHash });

  async function newCampaign(status: CampaignStatus, name = 'Campaña') {
    return createTestCampaign(prisma, biz, owner, `${s}-${randomUUID()}`, {
      name,
      status,
      destinationType: DestinationType.LANDING_ONLY,
      destinationUrl: null,
    });
  }

  const auditCount = (entityId: string, action: string) =>
    prisma.auditLog.count({
      where: { businessId: biz, entityId, action },
    });

  async function ask(content: string) {
    provider.toolChoices = [];
    const turn = await agent.prepare(
      { businessId: biz, userId: owner },
      MembershipRole.OWNER,
      conversationId,
      { kind: 'message', content },
    );
    if ('unavailable' in turn) throw new Error('agent unavailable');
    const events: AgentServerEvent[] = [];
    for await (const event of agent.stream(turn, new AbortController().signal))
      events.push(event);
    return events;
  }

  const finalMessage = (events: AgentServerEvent[]) => {
    const done = events.find((e) => e.type === 'done');
    if (!done || done.type !== 'done') throw new Error('no done event');
    return done.message;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1_000 }]),
        IntelligenceModule,
      ],
    })
      .overrideGuard(JwtGuard)
      .useClass(FakeJwtGuard)
      .overrideProvider(AI_AGENT_PROVIDER)
      .useValue(provider)
      .overrideProvider(AiConfigService)
      .useValue(
        Object.assign(
          Object.create(AiConfigService.prototype) as AiConfigService,
          {
            apiKey: 'sk-test',
            model: 'gpt-test',
            globallyEnabled: true,
            timeoutMs: 6000,
            maxDailyGenerationsPerBusiness: 10_000,
            maxMonthlyGenerationsPerBusiness: 100_000,
            maxDailyChatbotMessagesPerBusiness: 1000,
            maxDailyIntelligenceTurnsPerBusiness: 1000,
            agentTurnTimeoutMs: 10_000,
            priceInputPerMillionUsd: 0.15,
            priceOutputPerMillionUsd: 0.6,
          },
        ),
      )
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    actions = app.get(ActionsService);
    agent = app.get(AgentService);
    tools = app.get(AgentToolsService);
    conversations = app.get(ConversationsService);
    promotions = app.get(NotificationsPromotionsService);

    s = makeTestSuffix();
    biz = (await createTestBusiness(prisma, `${s}-act`)).id;
    second = (await createTestBusiness(prisma, `${s}-second`)).id;
    other = (await createTestBusiness(prisma, `${s}-other`)).id;
    ids.businesses.push(biz, second, other);
    owner = (await createTestUser(prisma, `${s}-owner`)).id;
    operator = (await createTestUser(prisma, `${s}-op`)).id;
    outsider = (await createTestUser(prisma, `${s}-out`)).id;
    ids.users.push(owner, operator, outsider);
    await createTestMembership(prisma, owner, biz, MembershipRole.OWNER);
    // El mismo dueño tiene otro local: sirve para probar el cambio de negocio.
    await createTestMembership(prisma, owner, second, MembershipRole.OWNER);
    await createTestMembership(prisma, operator, biz, MembershipRole.OPERATOR);
    await createTestMembership(prisma, outsider, other, MembershipRole.OWNER);

    // Plan con lugar para campañas (el default permite 1).
    const plan = await prisma.plan.create({
      data: {
        name: 'Test',
        slug: `test-${s}`,
        maxBranches: 5,
        maxMembers: 5,
        maxCampaigns: 50,
        maxReviewsPerMonth: 100,
      },
    });
    ids.plans.push(plan.id);
    await prisma.subscription.create({
      data: {
        businessId: biz,
        planId: plan.id,
        currentPeriodStart: new Date('2026-11-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-12-01T00:00:00Z'),
      },
    });

    // Tarjeta de sellos activa: 10 sellos → "Café gratis".
    await prisma.retentionSettings.create({
      data: {
        businessId: biz,
        aiInsightsEnabled: true,
        rewardGoalsEnabled: true,
        rewardGoalMinVisits: 10,
        rewardGoalMaxVisits: 10,
        progressReminderEnabled: true,
      },
    });
    const reward = await prisma.benefit.create({
      data: { businessId: biz, type: BenefitType.gift, title: 'Café gratis' },
    });
    seed.rewardBenefit = reward.id;
    await prisma.retentionIncentiveDefinition.create({
      data: {
        businessId: biz,
        name: 'Café gratis',
        type: BenefitType.gift,
        rewardGoalEligible: true,
        benefitId: reward.id,
        // Costo estimable: sin esto el motor no deja tocar la tarjeta.
        estimatedCost: 80,
      },
    });

    // Política aceptada: los cambios con impacto del agente la exigen.
    const business = await prisma.business.findUniqueOrThrow({
      where: { id: biz },
      select: { currency: true, timezone: true },
    });
    await prisma.businessPolicy.create({
      data: {
        businessId: biz,
        acceptedAt: NOW,
        acceptedVersion: 1,
        acceptedByUserId: owner,
        confirmedCurrency: business.currency,
        confirmedTimezone: business.timezone,
        messagingBudgetMonthly: 500,
        maxUniqueRecipientsPerWeek: 25,
        maxNewCampaignsPerWeek: 2,
        maxCampaignSharePercent: 25,
        messageUnitCost: 2,
        messageUnitCostCurrency: business.currency,
      },
    });
    await prisma.retentionSettings.update({
      where: { businessId: biz },
      data: { maxEstimatedIncentiveCostPerMonth: 1500 },
    });
    seed.activeBenefit = (
      await prisma.benefit.create({
        data: {
          businessId: biz,
          type: BenefitType.promotion,
          title: '2x1 en medialunas',
          active: true,
        },
      })
    ).id;
    seed.inactiveBenefit = (
      await prisma.benefit.create({
        data: { businessId: biz, type: BenefitType.gift, title: 'Postre' },
      })
    ).id;
    await prisma.retentionIncentiveDefinition.create({
      data: {
        businessId: biz,
        name: 'Postre',
        type: BenefitType.gift,
        benefitId: seed.inactiveBenefit,
        estimatedCost: 120,
      },
    });
    seed.otherBenefit = (
      await prisma.benefit.create({
        data: { businessId: other, type: BenefitType.gift, title: 'Ajeno' },
      })
    ).id;

    const template = await newCampaign(CampaignStatus.DRAFT, 'Post servicio');
    await prisma.campaign.update({
      where: { id: template.id },
      data: { templateKind: CampaignTemplateKind.post_service },
    });
    seed.templateCampaign = template.id;
    seed.otherCampaign = (
      await createTestCampaign(prisma, other, outsider, `${s}-o`, {
        status: CampaignStatus.ACTIVE,
      })
    ).id;

    seed.mission = (
      await prisma.mission.create({
        data: {
          businessId: biz,
          name: 'Vení 3 veces',
          targetVisits: 3,
          startsAt: new Date(NOW.getTime() - 86_400_000),
          endsAt: new Date(NOW.getTime() + 20 * 86_400_000),
          status: MissionStatus.DRAFT,
        },
      })
    ).id;

    // Clientes para las audiencias; uno pidió no recibir mensajes.
    await prisma.customer.createMany({
      data: [
        { businessId: biz, name: 'Ana', phoneE164: `+5989${s.slice(-4)}001` },
        { businessId: biz, name: 'Beto', phoneE164: `+5989${s.slice(-4)}002` },
        {
          businessId: biz,
          name: 'Caro',
          phoneE164: `+5989${s.slice(-4)}003`,
          optedOut: true,
        },
      ],
    });

    conversationId = (
      await conversations.create({ businessId: biz, userId: owner }, {})
    ).id;
  });

  afterEach(() => {
    whatsAppSend.mockClear();
  });

  afterAll(async () => {
    const where = { businessId: { in: ids.businesses } };
    await prisma.intelligenceAction.deleteMany({ where });
    await prisma.intelligenceConversation.deleteMany({ where });
    await prisma.aiUsageEvent.deleteMany({ where });
    await prisma.auditLog.deleteMany({ where });
    await prisma.programAuditEvent.deleteMany({ where });
    await prisma.mission.deleteMany({ where });
    await prisma.retentionIncentiveDefinition.deleteMany({ where });
    await prisma.benefit.deleteMany({ where });
    await prisma.campaign.deleteMany({ where });
    await prisma.customer.deleteMany({ where });
    await prisma.subscription.deleteMany({ where });
    await prisma.plan.deleteMany({ where: { id: { in: ids.plans } } });
    await prisma.retentionSettings.deleteMany({ where });
    await prisma.membership.deleteMany({ where });
    await prisma.business.deleteMany({ where: { id: { in: ids.businesses } } });
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
    whatsAppSend.mockRestore();
    await app.close();
  });

  // ---------------------------------------------------------------------------
  describe('Modo A: borradores sin confirmación', () => {
    it('borrador de campaña: se crea en DRAFT con el servicio de Campañas y queda auditado', async () => {
      const action = await propose('CREATE_CAMPAIGN_DRAFT', {
        name: 'Mesas de verano',
        description: null,
        channel: 'QR_TABLE',
        destination: 'LANDING_ONLY',
      });
      expect(action).toMatchObject({
        mode: 'DRAFT',
        status: 'EXECUTED',
        canConfirm: false,
      });
      const campaign = await prisma.campaign.findUniqueOrThrow({
        where: { id: action.result!.campaignId as string },
      });
      expect(campaign).toMatchObject({
        businessId: biz,
        createdByUserId: owner,
        status: CampaignStatus.DRAFT,
        name: 'Mesas de verano',
      });
      expect(await auditCount(action.id, 'INTELLIGENCE_ACTION_EXECUTED')).toBe(
        1,
      );
    });

    it('reintento del mismo pedido: misma acción, ningún duplicado', async () => {
      const source = randomUUID();
      const params = {
        name: 'Reintento',
        description: null,
        channel: 'QR_COUNTER',
        destination: 'LANDING_ONLY',
      };
      const first = await propose('CREATE_CAMPAIGN_DRAFT', params, { source });
      const again = await propose('CREATE_CAMPAIGN_DRAFT', params, { source });
      expect(again.id).toBe(first.id);
      expect(
        await prisma.campaign.count({
          where: { businessId: biz, name: 'Reintento' },
        }),
      ).toBe(1);
    });

    it('pedidos idénticos concurrentes: una sola campaña', async () => {
      const source = randomUUID();
      const params = {
        name: 'Concurrente',
        description: null,
        channel: 'QR_COUNTER',
        destination: 'LANDING_ONLY',
      };
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          actions.request(ctx({ source }), 'CREATE_CAMPAIGN_DRAFT', params),
        ),
      );
      const actionIds = new Set(
        results.map((r) => (r.ok ? r.action.id : r.code)),
      );
      expect(actionIds.size).toBe(1);
      expect(
        await prisma.campaign.count({
          where: { businessId: biz, name: 'Concurrente' },
        }),
      ).toBe(1);
    });

    it('recompensa: beneficio inactivo, con historial de Programa', async () => {
      const action = await propose('CREATE_REWARD_DRAFT', {
        type: 'discount',
        title: '10% off martes',
        description: null,
        terms: null,
      });
      const benefit = await prisma.benefit.findUniqueOrThrow({
        where: { id: action.result!.benefitId as string },
      });
      expect(benefit).toMatchObject({ businessId: biz, active: false });
      expect(
        await prisma.programAuditEvent.count({
          where: { businessId: biz, type: 'benefit_created' },
        }),
      ).toBeGreaterThan(0);
    });

    it('segmento: el conteo es el mismo que el de Promociones (sin opt-out)', async () => {
      const action = await propose('CREATE_SEGMENT', { audience: 'todos' });
      const { recipientCount } = await promotions.preview(biz, 'todos');
      expect(action.result).toMatchObject({ recipientCount });
      expect(recipientCount).toBe(2);
    });

    it('misión en borrador y edición de un borrador de campaña', async () => {
      const mission = await propose('CREATE_MISSION_DRAFT', {
        name: 'Tres en diciembre',
        description: null,
        targetVisits: 3,
        periodPreset: MissionPeriodPreset.NEXT_N_DAYS,
        periodDays: 14,
        rewardBenefitId: seed.inactiveBenefit,
      });
      expect(
        await prisma.mission.findUniqueOrThrow({
          where: { id: mission.result!.missionId as string },
        }),
      ).toMatchObject({ status: MissionStatus.DRAFT, businessId: biz });

      const draft = await newCampaign(CampaignStatus.DRAFT, 'Viejo nombre');
      await propose('UPDATE_CAMPAIGN_DRAFT', {
        campaignId: draft.id,
        name: 'Nombre nuevo',
        description: null,
      });
      expect(
        (await prisma.campaign.findUniqueOrThrow({ where: { id: draft.id } }))
          .name,
      ).toBe('Nombre nuevo');
    });

    it('editar una campaña que ya no es borrador se rechaza', async () => {
      const active = await newCampaign(CampaignStatus.ACTIVE);
      const outcome = await actions.request(ctx(), 'UPDATE_CAMPAIGN_DRAFT', {
        campaignId: active.id,
        name: 'X',
        description: null,
      });
      expect(outcome).toMatchObject({ ok: false, code: 'NOT_A_DRAFT' });
    });
  });

  // ---------------------------------------------------------------------------
  describe('Modo B: propuesta y confirmación', () => {
    it('proponer no cambia nada; confirmar con el plan exacto sí', async () => {
      const campaign = await newCampaign(CampaignStatus.ACTIVE, 'Mostrador');
      const action = await propose('PAUSE_CAMPAIGN', {
        campaignId: campaign.id,
      });
      expect(action).toMatchObject({
        status: 'PROPOSED',
        canConfirm: true,
        impact: {
          before: [{ label: 'Estado', value: 'Activa' }],
          after: [{ label: 'Estado', value: 'Pausada' }],
        },
      });
      expect(
        (
          await prisma.campaign.findUniqueOrThrow({
            where: { id: campaign.id },
          })
        ).status,
      ).toBe(CampaignStatus.ACTIVE);

      const wrong = await confirmHttp({
        id: action.id,
        planHash: '0'.repeat(64),
      });
      expect(wrong.status).toBe(409);
      expect(wrong.body.message).toContain('no coincide');

      const ok = await confirmHttp(action);
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ status: 'EXECUTED', canConfirm: false });
      expect(
        (
          await prisma.campaign.findUniqueOrThrow({
            where: { id: campaign.id },
          })
        ).status,
      ).toBe(CampaignStatus.PAUSED);
    });

    it('doble click: la segunda confirmación devuelve el resultado sin re-ejecutar', async () => {
      const campaign = await newCampaign(CampaignStatus.ACTIVE);
      const action = await propose('PAUSE_CAMPAIGN', {
        campaignId: campaign.id,
      });
      const [a, b] = [await confirmHttp(action), await confirmHttp(action)];
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(b.body.executedAt).toBe(a.body.executedAt);
      expect(await auditCount(action.id, 'INTELLIGENCE_ACTION_EXECUTED')).toBe(
        1,
      );
    });

    it('confirmaciones concurrentes: se ejecuta una sola vez', async () => {
      const campaign = await newCampaign(CampaignStatus.DRAFT, 'Simultánea');
      const action = await propose('SCHEDULE_CAMPAIGN', {
        campaignId: campaign.id,
        startsOn: TODAY,
        endsOn: IN_30_DAYS,
      });
      const responses = await Promise.all(
        Array.from({ length: 5 }, () => confirmHttp(action)),
      );
      for (const r of responses) {
        expect([200, 409]).toContain(r.status);
        if (r.status === 409)
          expect(r.body.message).toBe('Este cambio se está aplicando.');
      }
      expect(responses.some((r) => r.status === 200)).toBe(true);
      expect(await auditCount(action.id, 'INTELLIGENCE_ACTION_EXECUTED')).toBe(
        1,
      );
      const updated = await prisma.campaign.findUniqueOrThrow({
        where: { id: campaign.id },
      });
      expect(updated.status).toBe(CampaignStatus.ACTIVE);
      // Medianoche local de Montevideo (UTC-3).
      const [y, m, d] = TODAY.split('-').map(Number);
      expect(updated.startsAt?.toISOString()).toBe(
        zonedMidnightToUtc(y, m, d, TZ).toISOString(),
      );
    });

    it('si los datos cambiaron desde la propuesta, la aprobación caduca y no se ejecuta', async () => {
      const campaign = await newCampaign(CampaignStatus.ACTIVE, 'Cambiante');
      const action = await propose('PAUSE_CAMPAIGN', {
        campaignId: campaign.id,
      });
      // Otra persona la editó desde el panel.
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { name: 'Editada por otro' },
      });
      const res = await confirmHttp(action);
      expect(res.status).toBe(409);
      expect(
        await prisma.intelligenceAction.findUniqueOrThrow({
          where: { id: action.id },
          select: { status: true, errorCode: true },
        }),
      ).toEqual({
        status: IntelligenceActionStatus.EXPIRED,
        errorCode: 'DATA_CHANGED',
      });
      expect(
        (
          await prisma.campaign.findUniqueOrThrow({
            where: { id: campaign.id },
          })
        ).status,
      ).toBe(CampaignStatus.ACTIVE);
    });

    it('un plan nuevo sobre lo mismo reemplaza al anterior; el viejo ya no se puede confirmar', async () => {
      const first = await propose('UPDATE_STAMPS_CARD', {
        stampsRequired: 8,
        feedbackBonusEnabled: false,
      });
      const second = await propose('UPDATE_STAMPS_CARD', {
        stampsRequired: 6,
        feedbackBonusEnabled: true,
      });
      const old = await confirmHttp(first);
      expect(old.status).toBe(409);
      expect(
        await prisma.intelligenceAction.findUniqueOrThrow({
          where: { id: first.id },
          select: { status: true, errorCode: true },
        }),
      ).toEqual({
        status: IntelligenceActionStatus.EXPIRED,
        errorCode: 'SUPERSEDED',
      });

      const ok = await confirmHttp(second);
      expect(ok.status).toBe(200);
      expect(
        await prisma.retentionSettings.findUniqueOrThrow({
          where: { businessId: biz },
          select: {
            rewardGoalMinVisits: true,
            rewardGoalFeedbackBonusEnabled: true,
          },
        }),
      ).toEqual({
        rewardGoalMinVisits: 6,
        rewardGoalFeedbackBonusEnabled: true,
      });
      expect(
        await prisma.programAuditEvent.count({
          where: { businessId: biz, type: 'card_config_changed' },
        }),
      ).toBe(1);
    });

    it('sellos: null en el sello extra mantiene lo que había', async () => {
      const current = await prisma.retentionSettings.findUniqueOrThrow({
        where: { businessId: biz },
        select: { rewardGoalFeedbackBonusEnabled: true },
      });
      const action = await propose('UPDATE_STAMPS_CARD', {
        stampsRequired: 7,
        feedbackBonusEnabled: null,
      });
      const bonus = current.rewardGoalFeedbackBonusEnabled ? 'Sí' : 'No';
      expect(action.impact.after).toContainEqual({
        label: 'Sello extra por opinar',
        value: bonus,
      });
      expect((await confirmHttp(action)).status).toBe(200);
      expect(
        await prisma.retentionSettings.findUniqueOrThrow({
          where: { businessId: biz },
          select: {
            rewardGoalMinVisits: true,
            rewardGoalFeedbackBonusEnabled: true,
          },
        }),
      ).toEqual({
        rewardGoalMinVisits: 7,
        rewardGoalFeedbackBonusEnabled: current.rewardGoalFeedbackBonusEnabled,
      });
    });

    it('una propuesta vencida no se ejecuta', async () => {
      const action = await propose('ACTIVATE_BENEFIT', {
        benefitId: seed.inactiveBenefit,
      });
      const later = new Date(NOW.getTime() + 31 * 60_000);
      await expect(
        actions.confirm(
          { businessId: biz, userId: owner },
          MembershipRole.OWNER,
          action.id,
          action.planHash,
          later,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        (
          await prisma.benefit.findUniqueOrThrow({
            where: { id: seed.inactiveBenefit },
          })
        ).active,
      ).toBe(false);
    });

    it('activar un beneficio reemplaza al activo; activar una misión la publica', async () => {
      const benefit = await propose('ACTIVATE_BENEFIT', {
        benefitId: seed.inactiveBenefit,
      });
      expect(benefit.impact.before).toEqual([
        { label: 'Beneficio activo', value: '2x1 en medialunas' },
      ]);
      expect((await confirmHttp(benefit)).status).toBe(200);
      const [postre, dosPorUno] = await Promise.all([
        prisma.benefit.findUniqueOrThrow({
          where: { id: seed.inactiveBenefit },
        }),
        prisma.benefit.findUniqueOrThrow({ where: { id: seed.activeBenefit } }),
      ]);
      expect([postre.active, dosPorUno.active]).toEqual([true, false]);

      const mission = await propose('SET_MISSION_STATUS', {
        missionId: seed.mission,
        status: 'ACTIVE',
      });
      expect((await confirmHttp(mission)).status).toBe(200);
      expect(
        (
          await prisma.mission.findUniqueOrThrow({
            where: { id: seed.mission },
          })
        ).status,
      ).toBe(MissionStatus.ACTIVE);
    });

    it('acción rechazada: cancelar deja todo como estaba y ya no se puede confirmar', async () => {
      const campaign = await newCampaign(CampaignStatus.ACTIVE, 'Cancelada');
      const action = await propose('PAUSE_CAMPAIGN', {
        campaignId: campaign.id,
      });
      const cancel = await request(app.getHttpServer())
        .post(`/intelligence/actions/${action.id}/cancel`)
        .set(as(owner));
      expect(cancel.status).toBe(200);
      expect(cancel.body).toMatchObject({
        status: 'CANCELLED',
        canConfirm: false,
      });
      const late = await confirmHttp(action);
      expect(late.status).toBe(409);
      expect(late.body.message).toBe('Esta propuesta fue cancelada.');
      expect(
        (
          await prisma.campaign.findUniqueOrThrow({
            where: { id: campaign.id },
          })
        ).status,
      ).toBe(CampaignStatus.ACTIVE);
      expect(await auditCount(action.id, 'INTELLIGENCE_ACTION_CANCELLED')).toBe(
        1,
      );
    });
  });

  // ---------------------------------------------------------------------------
  describe('reglas de negocio', () => {
    it.each([
      [
        'campaña automática que manda WhatsApp',
        () => ({
          kind: 'SCHEDULE_CAMPAIGN' as const,
          params: {
            campaignId: seed.templateCampaign,
            startsOn: TODAY,
            endsOn: null,
          },
        }),
        'SENDS_MESSAGES',
      ],
      [
        'inicio en una fecha futura (Flikker no activa campañas solas)',
        () => ({
          kind: 'SCHEDULE_CAMPAIGN' as const,
          params: {
            // Un id que no existe. Antes se derivaba cambiando el último
            // carácter por '0', que 1 de cada 16 veces era el mismo id.
            campaignId: randomUUID(),
            startsOn: IN_10_DAYS,
            endsOn: null,
          },
        }),
        'NOT_FOUND',
      ],
      [
        'campaña de otro negocio (por id directo)',
        () => ({
          kind: 'PAUSE_CAMPAIGN' as const,
          params: { campaignId: seed.otherCampaign },
        }),
        'NOT_FOUND',
      ],
      [
        'beneficio de otro negocio',
        () => ({
          kind: 'ACTIVATE_BENEFIT' as const,
          params: { benefitId: seed.otherBenefit },
        }),
        'NOT_FOUND',
      ],
    ])('rechaza: %s', async (_label, build, code) => {
      const { kind, params } = build();
      const before = await prisma.intelligenceAction.count({
        where: { businessId: biz },
      });
      const outcome = await actions.request(ctx(), kind, params);
      expect(outcome).toMatchObject({ ok: false, code });
      expect(
        await prisma.intelligenceAction.count({ where: { businessId: biz } }),
      ).toBe(before);
    });

    it('programar a futuro se explica en vez de guardar una fecha que nadie aplica', async () => {
      const campaign = await newCampaign(CampaignStatus.DRAFT);
      const outcome = await actions.request(ctx(), 'SCHEDULE_CAMPAIGN', {
        campaignId: campaign.id,
        startsOn: IN_10_DAYS,
        endsOn: null,
      });
      expect(outcome).toMatchObject({
        ok: false,
        code: 'FUTURE_START_NOT_SUPPORTED',
      });
    });

    it('cambiar los sellos con "Cerca del premio" apagado se rechaza (prendería mensajes)', async () => {
      await prisma.retentionSettings.update({
        where: { businessId: biz },
        data: { progressReminderEnabled: false },
      });
      try {
        const outcome = await actions.request(ctx(), 'UPDATE_STAMPS_CARD', {
          stampsRequired: 9,
          feedbackBonusEnabled: false,
        });
        expect(outcome).toMatchObject({
          ok: false,
          code: 'WOULD_ENABLE_MESSAGES',
        });
      } finally {
        await prisma.retentionSettings.update({
          where: { businessId: biz },
          data: { progressReminderEnabled: true },
        });
      }
    });
  });

  // ---------------------------------------------------------------------------
  describe('motor de políticas', () => {
    const setPaused = (paused: boolean) =>
      prisma.businessPolicy.update({
        where: { businessId: biz },
        data: { paused, pausedReason: paused ? 'MANUAL' : null },
      });

    it('kill switch: bloquea proponer cambios con impacto, pero pausar sigue permitido', async () => {
      await setPaused(true);
      try {
        const blocked = await actions.request(ctx(), 'ACTIVATE_BENEFIT', {
          benefitId: seed.inactiveBenefit,
        });
        expect(blocked).toMatchObject({
          ok: false,
          code: 'POLICY_POLICY_PAUSED',
        });

        const campaign = await newCampaign(CampaignStatus.ACTIVE, 'Frenable');
        const pause = await propose('PAUSE_CAMPAIGN', {
          campaignId: campaign.id,
        });
        const res = await confirmHttp(pause);
        expect(res.status).toBe(200);
        expect(
          (
            await prisma.campaign.findUniqueOrThrow({
              where: { id: campaign.id },
            })
          ).status,
        ).toBe(CampaignStatus.PAUSED);
      } finally {
        await setPaused(false);
      }
    });

    it('si el negocio se pausa después de proponer, la confirmación no ejecuta nada', async () => {
      const campaign = await newCampaign(CampaignStatus.DRAFT, 'Para activar');
      const action = await propose('SCHEDULE_CAMPAIGN', {
        campaignId: campaign.id,
        startsOn: TODAY,
        endsOn: null,
      });
      await setPaused(true);
      try {
        const res = await confirmHttp(action);
        expect(res.status).toBe(409);
        expect(res.body.message).toContain('pausad');
        expect(
          (
            await prisma.campaign.findUniqueOrThrow({
              where: { id: campaign.id },
            })
          ).status,
        ).toBe(CampaignStatus.DRAFT);
        const stored = await prisma.intelligenceAction.findUniqueOrThrow({
          where: { id: action.id },
        });
        expect(stored.errorCode).toBe('POLICY_POLICY_PAUSED');
      } finally {
        await setPaused(false);
      }
    });

    it('sin la política aceptada, el agente no puede proponer cambios con impacto', async () => {
      const campaign = await createTestCampaign(
        prisma,
        second,
        owner,
        `${s}-sec-${randomUUID()}`,
        {
          status: CampaignStatus.DRAFT,
          destinationType: DestinationType.LANDING_ONLY,
          destinationUrl: null,
        },
      );
      const outcome = await actions.request(
        ctx({ businessId: second }),
        'SCHEDULE_CAMPAIGN',
        { campaignId: campaign.id, startsOn: TODAY, endsOn: null },
      );
      expect(outcome).toMatchObject({
        ok: false,
        code: 'POLICY_POLICY_NOT_ACCEPTED',
      });
      // Los borradores no tienen efecto: siguen permitidos.
      const draft = await actions.request(
        ctx({ businessId: second }),
        'CREATE_REWARD_DRAFT',
        {
          type: 'gift',
          title: 'Borrador libre',
          description: null,
          terms: null,
        },
      );
      expect(draft.ok).toBe(true);
    });

    it('un beneficio sin costo estimable no se ofrece', async () => {
      const noCost = await prisma.benefit.create({
        data: { businessId: biz, type: BenefitType.gift, title: 'Sin costo' },
      });
      const outcome = await actions.request(ctx(), 'ACTIVATE_BENEFIT', {
        benefitId: noCost.id,
      });
      expect(outcome).toMatchObject({
        ok: false,
        code: 'POLICY_INCENTIVE_COST_UNKNOWN',
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('sandbox: envíos', () => {
    it('una promoción es solo simulación: impacto calculado, nada enviado, no se puede confirmar', async () => {
      // Sin consentimiento explícito nadie es destinatario: no haberse dado
      // de baja no es autorización.
      const before = await propose('SEND_PROMOTION', {
        audience: 'todos',
        message: 'Esta semana te esperamos con 2x1',
        benefitId: seed.activeBenefit,
      });
      expect(before.impact.recipients.count).toBe(0);
      expect(before.impact.risks.join(' ')).toContain('consentimiento');

      const customers = await prisma.customer.findMany({
        where: { businessId: biz, optedOut: false },
        select: { id: true },
      });
      await prisma.customerConsentEvent.createMany({
        data: customers.map((c) => ({
          businessId: biz,
          customerId: c.id,
          channel: 'WHATSAPP' as const,
          action: 'GRANTED' as const,
          source: 'CHECKIN_FORM' as const,
        })),
      });

      const action = await propose('SEND_PROMOTION', {
        audience: 'todos',
        message: 'Esta semana te esperamos con 2x1 (de nuevo)',
        benefitId: seed.activeBenefit,
      });
      expect(action).toMatchObject({
        mode: 'DRY_RUN',
        status: 'DRY_RUN',
        canConfirm: false,
        impact: { recipients: { count: 2 } },
      });
      // El 2x1 no tiene costo estimado: el motor no lo ofrecería.
      expect(action.impact.risks.join(' ')).toContain(
        'No se puede estimar el costo',
      );
      const res = await confirmHttp(action);
      expect(res.status).toBe(409);
      expect(res.body.message).toContain('simulación');
      expect(whatsAppSend).not.toHaveBeenCalled();
      expect(
        await prisma.manualCampaign.count({ where: { businessId: biz } }),
      ).toBe(0);
      expect(
        await prisma.benefitParticipation.count({ where: { businessId: biz } }),
      ).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('autorización y tenancy', () => {
    it('un OPERATOR no puede preparar ni confirmar cambios', async () => {
      const outcome = await actions.request(
        ctx({ userId: operator, role: MembershipRole.OPERATOR }),
        'CREATE_SEGMENT',
        { audience: 'todos' },
      );
      expect(outcome).toMatchObject({ ok: false, code: 'FORBIDDEN' });

      const campaign = await newCampaign(CampaignStatus.ACTIVE);
      const action = await propose('PAUSE_CAMPAIGN', {
        campaignId: campaign.id,
      });
      expect((await confirmHttp(action, operator)).status).toBe(403);
    });

    it('solo quien la pidió la ve; con otro negocio activo es un 404', async () => {
      const campaign = await newCampaign(CampaignStatus.ACTIVE);
      const action = await propose('PAUSE_CAMPAIGN', {
        campaignId: campaign.id,
      });

      // El mismo dueño, con su otro local seleccionado.
      expect((await confirmHttp(action, owner, second)).status).toBe(404);
      const seen = await request(app.getHttpServer())
        .get(`/intelligence/actions/${action.id}`)
        .set(as(owner, second));
      expect(seen.status).toBe(404);
      // Alguien de otro negocio, mandando el negocio ajeno o el propio.
      expect((await confirmHttp(action, outsider, biz)).status).toBe(403);
      expect((await confirmHttp(action, outsider, other)).status).toBe(404);
      // Otro miembro del mismo negocio.
      const operatorView = await request(app.getHttpServer())
        .get(`/intelligence/actions/${action.id}`)
        .set(as(operator));
      expect(operatorView.status).toBe(404);

      expect(
        (
          await prisma.intelligenceAction.findUniqueOrThrow({
            where: { id: action.id },
          })
        ).status,
      ).toBe(IntelligenceActionStatus.PROPOSED);
      expect(
        (
          await prisma.campaign.findUniqueOrThrow({
            where: { id: campaign.id },
          })
        ).status,
      ).toBe(CampaignStatus.ACTIVE);
    });

    it('el planHash es obligatorio y con formato', async () => {
      const res = await request(app.getHttpServer())
        .post(`/intelligence/actions/${randomUUID()}/confirm`)
        .set(as(owner))
        .send({ planHash: 'sí, dale' });
      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('desde el agente', () => {
    it('sin un pedido explícito, las propuestas ni se ofrecen ni se ejecutan', async () => {
      const campaign = await newCampaign(CampaignStatus.ACTIVE, 'Proactiva');
      provider.script = toolThenAnswer(
        'propose_campaign_pause',
        { campaignId: campaign.id },
        'Te sugiero pausarla.',
      );
      const events = await ask('¿Cómo viene la campaña Proactiva?');
      expect(provider.toolChoices[0]).toBe('auto');
      expect(provider.lastToolNames).not.toContain('propose_campaign_pause');
      expect(provider.lastToolNames).toContain('draft_campaign');
      const tool = events.find((e) => e.type === 'tool_finished');
      expect(tool).toMatchObject({ ok: false });
      expect(
        await prisma.intelligenceAction.count({
          where: {
            businessId: biz,
            kind: 'PAUSE_CAMPAIGN',
            params: { equals: { campaignId: campaign.id } },
          },
        }),
      ).toBe(0);
    });

    it('con un pedido explícito arma la propuesta y nunca la da por hecha', async () => {
      const campaign = await newCampaign(CampaignStatus.ACTIVE, 'Pedida');
      provider.script = toolThenAnswer(
        'propose_campaign_pause',
        { campaignId: campaign.id },
        'Te dejé la propuesta para pausar la campaña: confirmala con el botón.',
      );
      const events = await ask('Pausá la campaña Pedida');
      expect(provider.lastToolNames).toContain('propose_campaign_pause');
      // Un pedido explícito obliga a usar una herramienta en la primera ronda.
      expect(provider.toolChoices[0]).toBe('required');
      const tool = events.find((e) => e.type === 'tool_finished');
      if (!tool || tool.type !== 'tool_finished') throw new Error('no tool');
      const actionId = (tool.message.metadata as { actionId?: string })
        .actionId;
      expect(actionId).toBeDefined();
      expect(finalMessage(events).metadata).toMatchObject({
        grounding: 'verified',
      });
      expect(
        (
          await prisma.intelligenceAction.findUniqueOrThrow({
            where: { id: actionId },
          })
        ).status,
      ).toBe(IntelligenceActionStatus.PROPOSED);
      expect(
        (
          await prisma.campaign.findUniqueOrThrow({
            where: { id: campaign.id },
          })
        ).status,
      ).toBe(CampaignStatus.ACTIVE);

      // Un modelo que diga que ya la pausó se reemplaza por el aviso.
      const other = await newCampaign(CampaignStatus.ACTIVE, 'Mentira');
      provider.script = toolThenAnswer(
        'propose_campaign_pause',
        { campaignId: other.id },
        'Listo, pausé la campaña.',
      );
      const lie = await ask('Pausá la campaña Mentira');
      expect(finalMessage(lie).content).toBe(UNVERIFIED_ANSWER_TEXT);
    });

    it('anunciar una propuesta sin crearla se reemplaza por el aviso (caso visto con el modelo real)', async () => {
      provider.script = function* () {
        yield {
          type: 'text_delta',
          delta:
            'Te dejé la propuesta para cambiar la tarjeta de sellos a 8 sellos. Podés confirmarla desde la tarjeta.',
        };
        yield completed();
      };
      const events = await ask('Cambiá la tarjeta de sellos a 8 sellos');
      expect(provider.lastToolNames).toContain('propose_stamps_card_change');
      expect(finalMessage(events)).toMatchObject({
        content: UNVERIFIED_ANSWER_TEXT,
        metadata: { groundingReason: 'CLAIMS_UNCREATED_ACTION' },
      });
    });

    it('un borrador desde el chat: "dejé el borrador" es verdad y queda la tarjeta', async () => {
      provider.script = toolThenAnswer(
        'draft_campaign',
        {
          name: 'QR del mostrador',
          description: null,
          channel: 'QR_COUNTER',
          destination: 'LANDING_ONLY',
        },
        'Creé el borrador de la campaña "QR del mostrador". Queda sin activar.',
      );
      const events = await ask('Armá un borrador de campaña para el mostrador');
      expect(finalMessage(events)).toMatchObject({
        content:
          'Creé el borrador de la campaña "QR del mostrador". Queda sin activar.',
        metadata: { grounding: 'verified' },
      });
      expect(
        await prisma.campaign.count({
          where: {
            businessId: biz,
            name: 'QR del mostrador',
            status: CampaignStatus.DRAFT,
          },
        }),
      ).toBe(1);
    });

    it('las herramientas de escritura no se le ofrecen a un OPERATOR', () => {
      const names = (role: MembershipRole, actionRequested: boolean) =>
        tools.definitions({ role, actionRequested }).map((d) => d.name);
      expect(names(MembershipRole.OPERATOR, true)).not.toContain(
        'draft_campaign',
      );
      expect(names(MembershipRole.OPERATOR, true)).not.toContain(
        'propose_campaign_pause',
      );
      expect(names(MembershipRole.ADMIN, false)).toContain('draft_campaign');
      // Simular nunca ejecuta: se ofrece sin pedido explícito, como un borrador.
      expect(names(MembershipRole.ADMIN, false)).toContain(
        'simulate_promotion',
      );
      expect(names(MembershipRole.ADMIN, false)).not.toContain(
        'propose_campaign_pause',
      );
      expect(names(MembershipRole.OPERATOR, true)).not.toContain(
        'simulate_promotion',
      );
    });
  });
});
