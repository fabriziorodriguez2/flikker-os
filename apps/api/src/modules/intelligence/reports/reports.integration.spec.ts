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
  BenefitIssuanceSource,
  BenefitType,
  MembershipRole,
  VisitVerificationType,
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
import {
  createTestBusiness,
  createTestMembership,
  createTestUser,
  makeTestSuffix,
} from '../../reviews/reviews.test-helpers';
import { IntelligenceModule } from '../intelligence.module';
import { ConversationsService } from '../conversations.service';
import { AgentService, type AgentServerEvent } from '../agent/agent.service';
import { ReportsService, type ReportMetrics } from './reports.service';
import type { Metric } from './report-math';

class FakeJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const userId = req.headers['x-test-user-id'];
    if (!userId) return false;
    req.user = {
      id: userId,
      email: 'r@test.local',
      firstName: 'R',
      lastName: 'T',
      isActive: true,
      isPlatformAdmin: false,
    };
    return true;
  }
}

class ScriptedProvider implements AiAgentProvider {
  readonly configured = true;
  script: (
    req: AgentTurnRequest,
  ) => Iterable<AgentStreamEvent> | AsyncIterable<AgentStreamEvent> = () => [];
  async *streamAgentTurn(req: AgentTurnRequest) {
    for await (const event of this.script(req)) yield event;
  }
}

/** Hora local de Montevideo (UTC-3, sin horario de verano) → instante real. */
const local = (iso: string) => new Date(`${iso}-03:00`);
const NOW = new Date('2026-11-10T15:00:00Z');
const TZ = 'America/Montevideo';

const value = (metrics: Metric[], key: string) =>
  metrics.find((m) => m.key === key)?.value;

describe('Intelligence reports (integration, dataset controlado)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let reports: ReportsService;
  let agent: AgentService;
  let conversations: ConversationsService;
  const provider = new ScriptedProvider();

  const ids = { users: [] as string[], businesses: [] as string[] };
  let biz: string;
  let other: string;
  let owner: string;
  let operator: string;
  let outsider: string;

  const ctx = (
    userId = owner,
    role: MembershipRole = MembershipRole.OWNER,
  ) => ({
    scope: { businessId: biz, userId },
    role,
    conversationId: null,
    now: NOW,
  });

  /** Conteo independiente: la zona horaria la resuelve Postgres, no el servicio. */
  async function sqlCount(
    table: string,
    column: string,
    fromDay: string,
    toDayExclusive: string,
    businessColumn = 'business_id',
  ) {
    const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM "${table}"
       WHERE "${businessColumn}" = $1
         AND ("${column}" AT TIME ZONE 'UTC' AT TIME ZONE '${TZ}') >= $2::timestamp
         AND ("${column}" AT TIME ZONE 'UTC' AT TIME ZONE '${TZ}') < $3::timestamp`,
      biz,
      fromDay,
      toDayExclusive,
    );
    return rows[0].n;
  }

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
    reports = app.get(ReportsService);
    agent = app.get(AgentService);
    conversations = app.get(ConversationsService);

    const s = makeTestSuffix();
    biz = (await createTestBusiness(prisma, `${s}-rep`)).id;
    other = (await createTestBusiness(prisma, `${s}-other`)).id;
    ids.businesses.push(biz, other);
    owner = (await createTestUser(prisma, `${s}-owner`)).id;
    operator = (await createTestUser(prisma, `${s}-op`)).id;
    outsider = (await createTestUser(prisma, `${s}-out`)).id;
    ids.users.push(owner, operator, outsider);
    await createTestMembership(prisma, owner, biz, MembershipRole.OWNER);
    await createTestMembership(prisma, operator, biz, MembershipRole.OPERATOR);
    await createTestMembership(prisma, outsider, other, MembershipRole.OWNER);
    await prisma.retentionSettings.create({
      data: { businessId: biz, aiInsightsEnabled: true },
    });

    // ── Dataset ─────────────────────────────────────────────────────────
    const customers: Record<string, { created: string; visits: string[] }> = {
      C1: {
        created: '2026-08-15T10:00:00',
        visits: [
          '2026-08-20T10:00:00',
          '2026-09-05T10:00:00',
          '2026-10-10T10:00:00',
        ],
      },
      C2: {
        created: '2026-09-02T09:00:00',
        visits: [
          '2026-09-02T09:00:00',
          '2026-09-20T09:00:00',
          '2026-10-03T09:00:00',
          '2026-10-25T09:00:00',
        ],
      },
      C3: { created: '2026-09-28T12:00:00', visits: ['2026-09-28T12:00:00'] },
      C4: {
        created: '2026-10-05T18:00:00',
        visits: ['2026-10-05T18:00:00', '2026-10-06T18:00:00'],
      },
      C5: { created: '2026-10-20T11:00:00', visits: [] },
      // Bordes: 23:30 del 31/10 local ya es 1/11 en UTC, pero es octubre.
      C6: { created: '2026-10-31T23:30:00', visits: ['2026-10-31T23:30:00'] },
      // 00:30 del 1/11 local: noviembre, aunque en UTC sea 31/10... no: 03:30Z del 1/11.
      C7: { created: '2026-11-01T00:30:00', visits: ['2026-11-01T00:30:00'] },
    };
    const visitIds: Record<string, string[]> = {};
    const customerIds: Record<string, string> = {};
    let phone = 100;
    for (const [name, c] of Object.entries(customers)) {
      const customer = await prisma.customer.create({
        data: {
          businessId: biz,
          name: `Cliente ${name}`,
          phoneE164: `+59899${++phone}000`,
          createdAt: local(c.created),
        },
      });
      customerIds[name] = customer.id;
      visitIds[name] = [];
      for (const at of c.visits) {
        const visit = await prisma.visit.create({
          data: {
            businessId: biz,
            customerId: customer.id,
            occurredAt: local(at),
            visitDayKey: `${at}-${randomUUID()}`,
            verificationType: VisitVerificationType.manual,
          },
        });
        visitIds[name].push(visit.id);
      }
    }
    // Ruido de OTRO negocio en las mismas fechas: nunca debe aparecer.
    const noise = await prisma.customer.create({
      data: {
        businessId: other,
        name: 'Ruido',
        phoneE164: '+59899999000',
        createdAt: local('2026-10-10T10:00:00'),
      },
    });
    await prisma.visit.create({
      data: {
        businessId: other,
        customerId: noise.id,
        occurredAt: local('2026-10-10T10:00:00'),
        visitDayKey: `noise-${randomUUID()}`,
        verificationType: VisitVerificationType.manual,
      },
    });

    // Feedback: septiembre C3 (5); octubre C2 (4) y C4 (2).
    await prisma.checkinFeedback.createMany({
      data: [
        {
          businessId: biz,
          customerId: customerIds.C3,
          visitId: visitIds.C3[0],
          score: 5,
          comment: 'Muy bien',
          createdAt: local('2026-09-28T12:05:00'),
        },
        {
          businessId: biz,
          customerId: customerIds.C2,
          visitId: visitIds.C2[2],
          score: 4,
          comment: null,
          createdAt: local('2026-10-03T09:05:00'),
        },
        {
          businessId: biz,
          customerId: customerIds.C4,
          visitId: visitIds.C4[0],
          score: 2,
          comment: 'Lento',
          createdAt: local('2026-10-05T18:05:00'),
        },
      ],
    });

    // Canjes: septiembre C2; octubre C1 y C4. Uno emitido sin canjear.
    const benefit = await prisma.benefit.create({
      data: {
        businessId: biz,
        type: BenefitType.discount,
        title: '10% off',
        active: false,
      },
    });
    await prisma.benefitParticipation.createMany({
      data: [
        {
          benefitId: benefit.id,
          businessId: biz,
          customerId: customerIds.C2,
          source: BenefitIssuanceSource.WELCOME,
          redeemedAt: local('2026-09-20T09:10:00'),
        },
        {
          benefitId: benefit.id,
          businessId: biz,
          customerId: customerIds.C1,
          source: BenefitIssuanceSource.REWARD_GOAL,
          redeemedAt: local('2026-10-10T10:10:00'),
        },
        {
          benefitId: benefit.id,
          businessId: biz,
          customerId: customerIds.C4,
          source: BenefitIssuanceSource.WELCOME,
          redeemedAt: local('2026-10-06T18:10:00'),
        },
        {
          benefitId: benefit.id,
          businessId: biz,
          customerId: customerIds.C3,
          source: BenefitIssuanceSource.WELCOME,
          redeemedAt: null,
        },
      ],
    });

    // Reseñas de Google: una en octubre.
    await prisma.googleReview.create({
      data: {
        businessId: biz,
        googleReviewId: `g-${randomUUID()}`,
        stars: 5,
        postedAt: local('2026-10-15T20:00:00'),
      },
    });
  });

  afterAll(async () => {
    const where = { businessId: { in: ids.businesses } };
    await prisma.intelligenceReport.deleteMany({ where });
    await prisma.intelligenceConversation.deleteMany({ where });
    await prisma.aiUsageEvent.deleteMany({ where });
    await prisma.googleReview.deleteMany({ where });
    await prisma.benefitParticipation.deleteMany({ where });
    await prisma.benefit.deleteMany({ where });
    await prisma.checkinFeedback.deleteMany({ where });
    await prisma.visit.deleteMany({ where });
    await prisma.customer.deleteMany({ where });
    await prisma.retentionSettings.deleteMany({ where });
    await prisma.membership.deleteMany({ where });
    await prisma.business.deleteMany({ where: { id: { in: ids.businesses } } });
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
    await app.close();
  });

  describe('cada número coincide con la base', () => {
    it('octubre: valores esperados y conteos SQL independientes', async () => {
      const report = await reports.periodReport(
        ctx(),
        '2026-10-01',
        '2026-10-31',
      );
      const metrics = (
        report.metrics as Extract<ReportMetrics, { kind: 'PERIOD_SUMMARY' }>
      ).period.metrics;

      const expected = {
        registeredCustomers: 3, // C4, C5, C6 (C6 a las 23:30 del 31/10 local)
        visits: 6, // C1 ×1, C2 ×2, C4 ×2, C6 ×1
        activeCustomers: 4, // C1, C2, C4, C6
        returningCustomers: 2, // C1, C2
        firstTimeVisitors: 2, // C4, C6
        recurrenceRatePercent: 50,
        visitsPerActiveCustomer: 1.5,
        benefitsRedeemed: 2, // C1, C4
        privateFeedback: 2,
        privateFeedbackAvgScore: 3,
        googleReviews: 1,
      };
      for (const [key, v] of Object.entries(expected)) {
        expect([key, value(metrics, key)]).toEqual([key, v]);
      }

      const from = '2026-10-01 00:00';
      const to = '2026-11-01 00:00';
      expect(value(metrics, 'visits')).toBe(
        await sqlCount('visits', 'occurred_at', from, to),
      );
      expect(value(metrics, 'registeredCustomers')).toBe(
        await sqlCount('Customer', 'createdAt', from, to, 'businessId'),
      );
      expect(value(metrics, 'benefitsRedeemed')).toBe(
        await sqlCount('benefit_participations', 'redeemed_at', from, to),
      );
      expect(value(metrics, 'privateFeedback')).toBe(
        await sqlCount('checkin_feedback', 'created_at', from, to),
      );
      expect(value(metrics, 'googleReviews')).toBe(
        await sqlCount('GoogleReview', 'posted_at', from, to, 'businessId'),
      );

      const recurrence = metrics.find(
        (m) => m.key === 'recurrenceRatePercent',
      )!;
      expect([recurrence.numerator, recurrence.denominator]).toEqual([2, 4]);
    });

    it('septiembre: el mismo cálculo, otro período', async () => {
      const report = await reports.periodReport(
        ctx(),
        '2026-09-01',
        '2026-09-30',
      );
      const metrics = (
        report.metrics as Extract<ReportMetrics, { kind: 'PERIOD_SUMMARY' }>
      ).period.metrics;
      expect({
        registeredCustomers: value(metrics, 'registeredCustomers'),
        visits: value(metrics, 'visits'),
        activeCustomers: value(metrics, 'activeCustomers'),
        returningCustomers: value(metrics, 'returningCustomers'),
        recurrenceRatePercent: value(metrics, 'recurrenceRatePercent'),
        benefitsRedeemed: value(metrics, 'benefitsRedeemed'),
        privateFeedbackAvgScore: value(metrics, 'privateFeedbackAvgScore'),
      }).toEqual({
        registeredCustomers: 2,
        visits: 4,
        activeCustomers: 3,
        returningCustomers: 1,
        recurrenceRatePercent: 33.3,
        benefitsRedeemed: 1,
        privateFeedbackAvgScore: 5,
      });
      expect(value(metrics, 'visits')).toBe(
        await sqlCount(
          'visits',
          'occurred_at',
          '2026-09-01 00:00',
          '2026-10-01 00:00',
        ),
      );
    });

    it('comparación septiembre → octubre con variaciones del servidor', async () => {
      const report = await reports.comparisonReport(
        ctx(),
        { from: '2026-09-01', to: '2026-09-30' },
        { from: '2026-10-01', to: '2026-10-31' },
      );
      const m = report.metrics as Extract<
        ReportMetrics,
        { kind: 'PERIOD_COMPARISON' }
      >;
      const byKey = Object.fromEntries(m.deltas.map((d) => [d.key, d]));
      expect(byKey.visits).toMatchObject({
        a: 4,
        b: 6,
        absolute: 2,
        percentChange: 50,
      });
      expect(byKey.recurrenceRatePercent).toMatchObject({
        a: 33.3,
        b: 50,
        absolute: 16.7,
        percentChange: null,
      });
      expect(byKey.benefitsRedeemed).toMatchObject({
        a: 1,
        b: 2,
        absolute: 1,
        percentChange: 100,
      });
    });

    it('cohorte de octubre: qué pasó con los registrados', async () => {
      const report = await reports.cohortReport(
        ctx(),
        '2026-10-01',
        '2026-10-31',
      );
      const { cohort } = report.metrics as Extract<
        ReportMetrics,
        { kind: 'CUSTOMER_COHORT' }
      >;
      expect({
        customers: value(cohort.metrics, 'customers'),
        noVisits: value(cohort.metrics, 'noVisits'),
        oneVisit: value(cohort.metrics, 'oneVisit'),
        twoOrMoreVisits: value(cohort.metrics, 'twoOrMoreVisits'),
        twoOrMoreVisitsPercent: value(cohort.metrics, 'twoOrMoreVisitsPercent'),
        returnedWithin30DaysPercent: value(
          cohort.metrics,
          'returnedWithin30DaysPercent',
        ),
        redeemedAnyBenefit: value(cohort.metrics, 'redeemedAnyBenefit'),
        gaveFeedback: value(cohort.metrics, 'gaveFeedback'),
        contactable: value(cohort.metrics, 'contactable'),
      }).toEqual({
        customers: 3, // C4, C5, C6
        noVisits: 1, // C5
        oneVisit: 1, // C6
        twoOrMoreVisits: 1, // C4
        twoOrMoreVisitsPercent: 33.3,
        returnedWithin30DaysPercent: 50, // C4 de 2 con visitas
        redeemedAnyBenefit: 1, // C4
        gaveFeedback: 1, // C4
        contactable: 3,
      });
      const segmentTotal = cohort.segments.reduce(
        (sum, s) => sum + (s.value ?? 0),
        0,
      );
      expect(segmentTotal).toBe(3);
    });

    it('todos los clientes: la cohorte completa coincide con la base', async () => {
      const report = await reports.cohortReport(ctx(), null, null);
      const { cohort } = report.metrics as Extract<
        ReportMetrics,
        { kind: 'CUSTOMER_COHORT' }
      >;
      expect(value(cohort.metrics, 'customers')).toBe(
        await prisma.customer.count({ where: { businessId: biz } }),
      );
      expect(value(cohort.metrics, 'customers')).toBe(7);
    });

    it('informe mensual de octubre: mes, mes anterior y cohorte', async () => {
      const report = await reports.monthlyReport(ctx(), '2026-10');
      const m = report.metrics as Extract<ReportMetrics, { kind: 'MONTHLY' }>;
      expect(m.periods.map((p) => [p.from, p.to])).toEqual([
        ['2026-09-01', '2026-09-30'],
        ['2026-10-01', '2026-10-31'],
      ]);
      expect(value(m.periods[1].metrics, 'visits')).toBe(6);
      expect(value(m.cohort.metrics, 'customers')).toBe(3);
    });

    it('notas: sin ventas ni ROI, muestra chica y período sin terminar', async () => {
      const report = await reports.periodReport(
        ctx(),
        '2026-11-01',
        '2026-11-30',
      );
      expect(report.notes.dataNotes.join(' ')).toMatch(
        /no registra compras ni ventas.*ROI/,
      );
      expect(
        report.notes.dataNotes.some((n) => n.includes('muestra chica')),
      ).toBe(true);
      expect(
        report.notes.dataNotes.some((n) => n.includes('todavía no terminó')),
      ).toBe(true);
      const metrics = (
        report.metrics as Extract<ReportMetrics, { kind: 'PERIOD_SUMMARY' }>
      ).period.metrics;
      expect(value(metrics, 'visits')).toBe(1); // C7, 00:30 del 1/11 local
    });

    it('cada reporte queda guardado con negocio, creador, fechas, fuentes y cálculo', async () => {
      const { reportId } = await reports.periodReport(
        ctx(),
        '2026-10-01',
        '2026-10-31',
      );
      const row = await prisma.intelligenceReport.findUniqueOrThrow({
        where: { id: reportId },
      });
      expect(row).toMatchObject({
        businessId: biz,
        createdByUserId: owner,
        kind: 'PERIOD_SUMMARY',
        timezone: TZ,
        computedAt: NOW,
        periodFrom: new Date('2026-10-01T03:00:00Z'),
        periodTo: new Date('2026-11-01T03:00:00Z'),
      });
      expect(row.sources).toEqual(
        expect.arrayContaining(['Visit', 'Customer', 'BenefitParticipation']),
      );
    });
  });

  describe('acceso y exportación', () => {
    const as = (userId: string, businessId = biz) => ({
      'x-test-user-id': userId,
      'x-business-id': businessId,
    });

    it('el creador lo ve; otro miembro del negocio y otro negocio, no', async () => {
      const { reportId } = await reports.periodReport(
        ctx(),
        '2026-10-01',
        '2026-10-31',
      );
      const server = app.getHttpServer();
      const mine = await request(server)
        .get(`/intelligence/reports/${reportId}`)
        .set(as(owner))
        .expect(200);
      expect(mine.body).toMatchObject({ id: reportId, canExport: true });
      await request(server)
        .get(`/intelligence/reports/${reportId}`)
        .set(as(operator))
        .expect(404);
      await request(server)
        .get(`/intelligence/reports/${reportId}`)
        .set(as(outsider, other))
        .expect(404);
      await request(server)
        .get(`/intelligence/reports/${reportId}`)
        .set(as(outsider))
        .expect(403);
    });

    it('CSV: métricas trazables, sin datos de contacto ni nombres de clientes', async () => {
      const { reportId } = await reports.periodReport(
        ctx(),
        '2026-10-01',
        '2026-10-31',
      );
      const res = await request(app.getHttpServer())
        .get(`/intelligence/reports/${reportId}/export`)
        .query({ format: 'csv' })
        .set(as(owner))
        .expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.text).toContain(
        'Recurrencia,recurrenceRatePercent,50,percent,2,4',
      );
      expect(res.text).toContain('Visitas,visits,6,count');
      expect(res.text).not.toMatch(/\+5989|Cliente C\d/);
    });

    it('PDF: un documento real', async () => {
      const { reportId } = await reports.periodReport(
        ctx(),
        '2026-10-01',
        '2026-10-31',
      );
      const res = await request(app.getHttpServer())
        .get(`/intelligence/reports/${reportId}/export`)
        .query({ format: 'pdf' })
        .set(as(owner))
        .buffer(true)
        .parse((response, done) => {
          const chunks: Buffer[] = [];
          response.on('data', (c: Buffer) => chunks.push(c));
          response.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    });

    it('un OPERATOR ve su propio reporte pero no puede exportarlo', async () => {
      const { reportId } = await reports.periodReport(
        ctx(operator, MembershipRole.OPERATOR),
        '2026-10-01',
        '2026-10-31',
      );
      const server = app.getHttpServer();
      const view = await request(server)
        .get(`/intelligence/reports/${reportId}`)
        .set(as(operator))
        .expect(200);
      expect(view.body.canExport).toBe(false);
      await request(server)
        .get(`/intelligence/reports/${reportId}/export`)
        .query({ format: 'csv' })
        .set(as(operator))
        .expect(403);
    });

    it('formato inválido → 400', async () => {
      const { reportId } = await reports.periodReport(
        ctx(),
        '2026-10-01',
        '2026-10-31',
      );
      await request(app.getHttpServer())
        .get(`/intelligence/reports/${reportId}/export`)
        .query({ format: 'xlsx' })
        .set(as(owner))
        .expect(400);
    });
  });

  describe('desde el agente', () => {
    async function ask(content: string) {
      const conversationId = (
        await conversations.create({ businessId: biz, userId: owner }, {})
      ).id;
      const turn = await agent.prepare(
        { businessId: biz, userId: owner },
        MembershipRole.OWNER,
        conversationId,
        { kind: 'message', content },
      );
      const events: AgentServerEvent[] = [];
      if (!('unavailable' in turn)) {
        for await (const e of agent.stream(turn, new AbortController().signal))
          events.push(e);
      }
      return { conversationId, events };
    }

    function toolThen(
      name: string,
      args: object,
      answer: (out: Record<string, any>) => string,
    ) {
      provider.script = function* (req) {
        const outputs = req.input.filter(
          (i) => 'type' in i && i.type === 'function_call_output',
        );
        if (outputs.length === 0) {
          yield {
            type: 'tool_call',
            callId: `c-${randomUUID()}`,
            name,
            arguments: JSON.stringify(args),
          };
        } else {
          const last = outputs[outputs.length - 1] as { output: string };
          yield {
            type: 'text_delta',
            delta: answer(JSON.parse(last.output) as Record<string, any>),
          };
        }
        yield {
          type: 'completed',
          model: 'gpt-test',
          inputTokens: 10,
          outputTokens: 5,
          status: 'completed',
        };
      };
    }

    it('"compará octubre con septiembre": números del servidor, reporte enlazado y respuesta verificada', async () => {
      toolThen(
        'compare_periods',
        {
          aFrom: '2026-09-01',
          aTo: '2026-09-30',
          bFrom: '2026-10-01',
          bTo: '2026-10-31',
        },
        (out) => {
          const v = out.data.changes.visits;
          const r = out.data.changes.recurrenceRatePercent;
          return `Entre el 2026-09-01 y el 2026-10-31 las visitas pasaron de ${v.a} a ${v.b} (+${v.percentChange}%) y la recurrencia de ${r.a}% a ${r.b}% (+${r.difference} puntos). Una posible explicación es que más clientes de septiembre volvieron.`;
        },
      );
      const { conversationId, events } = await ask(
        'Compará octubre con septiembre',
      );
      const done = events.find((e) => e.type === 'done') as Extract<
        AgentServerEvent,
        { type: 'done' }
      >;
      expect(done.message.content).toContain('de 4 a 6 (+50%)');
      expect(done.message.metadata).toMatchObject({ grounding: 'verified' });

      const tool = events.find((e) => e.type === 'tool_finished') as Extract<
        AgentServerEvent,
        { type: 'tool_finished' }
      >;
      const reportId = (tool.message.metadata as { reportId: string }).reportId;
      const saved = await prisma.intelligenceReport.findUniqueOrThrow({
        where: { id: reportId },
      });
      expect(saved).toMatchObject({
        kind: 'PERIOD_COMPARISON',
        conversationId,
        businessId: biz,
        createdByUserId: owner,
      });
    });

    it('un período inválido vuelve como error explicable, sin crear reporte', async () => {
      const before = await prisma.intelligenceReport.count({
        where: { businessId: biz },
      });
      toolThen(
        'period_report',
        { from: '2030-01-01', to: '2030-01-31' },
        (out) =>
          out.ok ? 'raro' : 'Ese período todavía no empezó, no hay datos.',
      );
      const { events } = await ask('¿Cómo me va en enero de 2030?');
      const tool = events.find((e) => e.type === 'tool_finished') as Extract<
        AgentServerEvent,
        { type: 'tool_finished' }
      >;
      expect(JSON.parse(tool.message.content)).toMatchObject({
        ok: false,
        error: { code: 'INVALID_PERIOD' },
      });
      expect(
        await prisma.intelligenceReport.count({ where: { businessId: biz } }),
      ).toBe(before);
    });

    it('un ROI inventado sobre check-ins se reemplaza', async () => {
      toolThen(
        'period_report',
        { from: '2026-10-01', to: '2026-10-31' },
        (out) =>
          `Con ${out.data.metrics.visits} visitas, el ROI del programa es excelente.`,
      );
      const { events } = await ask('¿Cuál es el ROI de octubre?');
      const done = events.find((e) => e.type === 'done') as Extract<
        AgentServerEvent,
        { type: 'done' }
      >;
      expect(done.message.metadata).toMatchObject({
        grounding: 'rejected',
        groundingReason: 'MENTIONS_ROI',
      });
    });
  });
});
