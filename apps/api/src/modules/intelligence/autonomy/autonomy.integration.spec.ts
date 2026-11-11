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
  AutonomyMode,
  ExperienceVersion,
  MembershipRole,
  Prisma,
  RetentionObjective,
  RetentionStrategyType,
} from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtGuard } from '../../auth/guards/jwt.guard';
import { HttpExceptionFilter } from '../../../common/filters/http-exception.filter';
import { localDayKey } from '../../../common/utils/timezone.util';
import { RetentionV2EvaluateService } from '../../retention-v2/retention-v2-evaluate.service';
import { RetentionV2SendService } from '../../retention-v2/retention-v2-send.service';
import { RetentionOutcomeService } from '../../retention-v2/retention-outcome.service';
import { RetentionV2MessageDispatchService } from '../../retention-v2/retention-v2-message-dispatch.service';
import { RetentionV2Worker } from '../../../jobs/workers/retention-v2.worker';
import { RUN_RETENTION_V2_EVALUATE_JOB } from '../../../jobs/retention-v2.queue';
import {
  createTestBusiness,
  createTestMembership,
  createTestUser,
  makeTestSuffix,
} from '../../reviews/reviews.test-helpers';
import { AutonomyModule } from './autonomy.module';
import { AutonomyService } from './autonomy.service';

/**
 * El modo autónomo contra Postgres real: lo que se prueba es que solo
 * recluta dentro de la política, por el camino de Autopilot, una estrategia
 * y un grupo chico por corrida, y que siempre deja rastro — incluso cuando
 * no hace nada, cuando la cola está caída o el cron corre dos veces.
 */

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
      isPlatformAdmin: req.headers['x-test-admin'] === '1',
    };
    return true;
  }
}

const NOW = new Date();
const TZ = 'America/Montevideo';
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

describe('Intelligence — modo autónomo (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let autonomy: AutonomyService;
  let evaluate: RetentionV2EvaluateService;
  const s = makeTestSuffix();
  const businesses: string[] = [];
  const users: string[] = [];
  let phoneSeq = 0;
  const phonePrefix = String(Math.floor(Math.random() * 900) + 100);

  /**
   * Un negocio listo para el piloto: Check-in V2 con el motor prendido,
   * política aceptada (ventana amplia para no depender de la hora del test),
   * experimentos de Autopilot corriendo y `n` clientes con historias de
   * visitas variadas (sanos, demorados, inactivos y de una sola visita).
   */
  async function business(
    label: string,
    opts: {
      customers: number;
      consented: number;
      mode?: AutonomyMode;
      policy?: Partial<Prisma.BusinessPolicyUncheckedCreateInput> | null;
    },
  ) {
    const id = (await createTestBusiness(prisma, `${s}-${label}`)).id;
    businesses.push(id);
    await prisma.business.update({
      where: { id },
      data: {
        experienceVersion: ExperienceVersion.CHECKIN_V2,
        retentionEngineV2Enabled: true,
      },
    });
    await prisma.retentionSettings.create({
      data: {
        businessId: id,
        sendingHourStart: 0,
        sendingHourEnd: 24,
        allowedSendingDays: [1, 2, 3, 4, 5, 6, 7],
        automaticCampaignsEnabled: true,
        maxEstimatedIncentiveCostPerMonth: 1500,
      },
    });
    if (opts.policy !== null) {
      await prisma.businessPolicy.create({
        data: {
          businessId: id,
          acceptedAt: NOW,
          acceptedVersion: 1,
          confirmedCurrency: 'UYU',
          confirmedTimezone: TZ,
          messagingBudgetMonthly: 500,
          maxUniqueRecipientsPerWeek: 25,
          maxNewCampaignsPerWeek: 2,
          maxCampaignSharePercent: 25,
          messageUnitCost: 2,
          messageUnitCostCurrency: 'UYU',
          autonomyMode: opts.mode ?? AutonomyMode.PILOT,
          autonomyPilotGroupSize: 10,
          ...opts.policy,
        },
      });
    }
    for (const objective of [
      RetentionObjective.AT_RISK_RECOVERY,
      RetentionObjective.INACTIVE_RECOVERY,
    ]) {
      const experiment = await prisma.retentionExperiment.create({
        data: {
          businessId: id,
          name: objective,
          objective,
          status: 'RUNNING',
        },
      });
      await prisma.retentionVariant.createMany({
        data: [
          ['Control', RetentionStrategyType.CONTROL, 15],
          ['Recordatorio', RetentionStrategyType.REMINDER, 45],
          ['Con beneficio', RetentionStrategyType.SOFT_BENEFIT, 40],
        ].map(([name, strategyType, allocationPercent]) => ({
          experimentId: experiment.id,
          businessId: id,
          name: name as string,
          strategyType: strategyType as RetentionStrategyType,
          allocationPercent: allocationPercent as number,
        })),
      });
    }
    const patterns = [
      [3, 10, 17, 24], // sano
      [12, 19, 26, 33], // demorado
      [40, 47, 54, 61], // inactivo
      [30], // una visita, pasado el plazo
    ];
    const customers: Prisma.CustomerCreateManyInput[] = [];
    const visits: Prisma.VisitCreateManyInput[] = [];
    for (let i = 0; i < opts.customers; i++) {
      phoneSeq += 1;
      const customerId = randomUUID();
      customers.push({
        id: customerId,
        businessId: id,
        name: `Cliente ${i}`,
        phoneE164: `+5989${phonePrefix}${String(phoneSeq).padStart(4, '0')}`,
      });
      for (const daysAgo of patterns[i % patterns.length]) {
        visits.push({
          businessId: id,
          customerId,
          occurredAt: ago(daysAgo),
          visitDayKey: localDayKey(ago(daysAgo), TZ),
          verificationType: 'manual',
        });
      }
    }
    await prisma.customer.createMany({ data: customers });
    await prisma.visit.createMany({ data: visits });
    // Consentimiento parcial: solo los primeros `consented`.
    await prisma.customerConsentEvent.createMany({
      data: customers.slice(0, opts.consented).map((c) => ({
        businessId: id,
        customerId: c.id!,
        channel: 'WHATSAPP' as const,
        action: 'GRANTED' as const,
        source: 'CHECKIN_FORM' as const,
      })),
    });
    return { id, customerIds: customers.map((c) => c.id!) };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1_000 }]),
        AutonomyModule,
      ],
    })
      .overrideGuard(JwtGuard)
      .useClass(FakeJwtGuard)
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
    autonomy = app.get(AutonomyService);
    evaluate = app.get(RetentionV2EvaluateService);
  });

  afterAll(async () => {
    const where = { businessId: { in: businesses } };
    await prisma.retentionDecisionLog.deleteMany({ where });
    await prisma.retentionAssignment.deleteMany({ where });
    await prisma.retentionVariant.deleteMany({ where });
    await prisma.retentionExperiment.deleteMany({ where });
    await prisma.auditLog.deleteMany({ where });
    await prisma.visit.deleteMany({ where });
    await prisma.customer.deleteMany({ where });
    await prisma.retentionSettings.deleteMany({ where });
    await prisma.membership.deleteMany({ where });
    await prisma.business.deleteMany({ where: { id: { in: businesses } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  });

  const assignmentsOf = (businessId: string) =>
    prisma.retentionAssignment.findMany({
      where: { businessId },
      include: { variant: { select: { strategyType: true } } },
    });

  // ---------------------------------------------------------------------------
  describe('DRY-RUN', () => {
    it('105 clientes con consentimiento parcial: deja el plan, no recluta a nadie', async () => {
      const biz = await business('dry', {
        customers: 105,
        consented: 60,
        mode: AutonomyMode.DRY_RUN,
      });
      const run = await autonomy.runForBusiness(biz.id, NOW);
      expect(run).toMatchObject({
        mode: 'DRY_RUN',
        status: 'SIMULATED',
        strategy: 'SECOND_VISIT',
        incentiveLevel: 1,
      });
      expect(run!.plannedCustomerIds.length).toBeGreaterThan(0);
      expect(run!.plannedCustomerIds.length).toBeLessThanOrEqual(10);
      // Solo clientes con consentimiento entran al plan.
      const consented = new Set(biz.customerIds.slice(0, 60));
      expect(run!.plannedCustomerIds.every((id) => consented.has(id))).toBe(
        true,
      );
      expect(await assignmentsOf(biz.id)).toHaveLength(0);
      expect(run!.explanation).toContain('No se contactó a nadie');
      expect(run!.facts).toMatchObject({
        activeCustomers: 105,
        withWhatsappConsent: 60,
      });
    });

    it('2.000 clientes: la corrida termina en tiempo razonable', async () => {
      const biz = await business('big', {
        customers: 2000,
        consented: 500,
        mode: AutonomyMode.DRY_RUN,
      });
      const started = Date.now();
      const run = await autonomy.runForBusiness(biz.id, NOW);
      expect(Date.now() - started).toBeLessThan(30_000);
      expect(run?.status).toBe('SIMULATED');
      expect(run!.plannedCustomerIds.length).toBeLessThanOrEqual(10);
    }, 120_000);
  });

  // ---------------------------------------------------------------------------
  describe('PILOT', () => {
    it('recluta un grupo chico en Autopilot, sin descuento y solo con consentimiento', async () => {
      const biz = await business('pilot', { customers: 105, consented: 60 });
      const run = await autonomy.runForBusiness(biz.id, NOW);
      expect(run).toMatchObject({
        status: 'EXECUTED',
        strategy: 'SECOND_VISIT',
      });
      const assignments = await assignmentsOf(biz.id);
      expect(assignments.length).toBe(run!.assignedCount);
      expect(assignments.length).toBeGreaterThan(0);
      expect(assignments.length).toBeLessThanOrEqual(10);
      expect(assignments.every((a) => a.autonomousRunId === run!.id)).toBe(
        true,
      );
      expect(assignments.every((a) => a.status === 'PENDING')).toBe(true);
      // Escalera: sin variantes con beneficio en el primer nivel.
      expect(
        assignments.some(
          (a) => a.variant.strategyType === RetentionStrategyType.SOFT_BENEFIT,
        ),
      ).toBe(false);
      const consented = new Set(biz.customerIds.slice(0, 60));
      expect(assignments.every((a) => consented.has(a.customerId))).toBe(true);
      expect(
        await prisma.auditLog.count({
          where: { businessId: biz.id, action: 'AUTONOMY_RUN_EXECUTED' },
        }),
      ).toBe(1);
    });

    it('con el planificador prendido, la corrida diaria es suya y solo simula aunque esté en PILOT', async () => {
      const biz = await business('planner', {
        customers: 40,
        consented: 40,
        policy: { autonomyPlannerEnabled: true },
      });
      const run = await autonomy.runForBusiness(biz.id, NOW);
      // En este entorno la IA está apagada: queda bloqueada con el motivo,
      // y las reglas fijas no corren en su lugar.
      expect(run).toMatchObject({
        engine: 'PLANNER',
        mode: 'DRY_RUN',
        status: 'BLOCKED',
      });
      expect(run!.explanation).toContain('IA');
      expect(await assignmentsOf(biz.id)).toHaveLength(0);
    });

    it('Autopilot no recluta por su cuenta un negocio en PILOT; los demás siguen igual', async () => {
      const pilot = await business('nodup', { customers: 40, consented: 40 });
      const regular = await business('regular', {
        customers: 40,
        consented: 40,
        policy: null,
      });
      await evaluate.runDaily(NOW, { onlyBusinessIds: [pilot.id, regular.id] });
      expect(await assignmentsOf(pilot.id)).toHaveLength(0);
      expect((await assignmentsOf(regular.id)).length).toBeGreaterThan(0);
      // Y el modo autónomo nunca toca un negocio sin modo prendido.
      expect(await autonomy.runForBusiness(regular.id, NOW)).toBeNull();
    }, 60_000);

    it('doble cron (secuencial y concurrente): una sola corrida, sin duplicar asignaciones', async () => {
      const biz = await business('cron', { customers: 60, consented: 60 });
      const [a, b, c] = await Promise.all([
        autonomy.runForBusiness(biz.id, NOW),
        autonomy.runForBusiness(biz.id, NOW),
        autonomy.runForBusiness(biz.id, NOW),
      ]);
      const again = await autonomy.runForBusiness(biz.id, NOW);
      const ids = new Set([a, b, c, again].map((r) => r?.id));
      expect(ids.size).toBe(1);
      expect(
        await prisma.autonomousRun.count({ where: { businessId: biz.id } }),
      ).toBe(1);
      const final = await prisma.autonomousRun.findFirstOrThrow({
        where: { businessId: biz.id },
      });
      expect(await assignmentsOf(biz.id)).toHaveLength(final.assignedCount);
    });

    it('reintento tras una caída: retoma la corrida y no duplica a nadie', async () => {
      const biz = await business('crash', { customers: 60, consented: 60 });
      // Una corrida que quedó colgada a mitad hace una hora.
      await prisma.autonomousRun.create({
        data: {
          businessId: biz.id,
          runKey: localDayKey(NOW, TZ),
          mode: AutonomyMode.PILOT,
          status: 'RUNNING',
          startedAt: new Date(NOW.getTime() - 60 * 60_000),
        },
      });
      const resumed = await autonomy.runForBusiness(biz.id, NOW);
      expect(resumed?.status).toBe('EXECUTED');
      const first = (await assignmentsOf(biz.id)).length;
      expect(first).toBe(resumed!.assignedCount);
      // Una corrida RUNNING reciente (otro worker trabajando) no se pisa.
      const other = await business('busy', { customers: 20, consented: 20 });
      await prisma.autonomousRun.create({
        data: {
          businessId: other.id,
          runKey: localDayKey(NOW, TZ),
          mode: AutonomyMode.PILOT,
          status: 'RUNNING',
          startedAt: NOW,
        },
      });
      const busy = await autonomy.runForBusiness(other.id, NOW);
      expect(busy?.status).toBe('RUNNING');
      expect(await assignmentsOf(other.id)).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('cuando no hay acciones, igual queda la explicación', () => {
    it('0 clientes', async () => {
      const biz = await business('empty', { customers: 0, consented: 0 });
      const run = await autonomy.runForBusiness(biz.id, NOW);
      expect(run).toMatchObject({ status: 'NO_ACTION', assignedCount: 0 });
      expect(run!.explanation).toContain('Todavía no hay clientes con visitas');
    });

    it('10 clientes sin consentimiento: no envía "para probar"; explica y sugiere', async () => {
      const biz = await business('noconsent', { customers: 10, consented: 0 });
      const run = await autonomy.runForBusiness(biz.id, NOW);
      expect(run).toMatchObject({ status: 'NO_ACTION', assignedCount: 0 });
      expect(run!.explanation).toContain(
        '10 clientes activos, 0 con WhatsApp autorizado',
      );
      expect(run!.explanation).toContain('pocos datos');
      expect((run!.suggestions as string[]).join(' ')).toContain(
        'autorizó WhatsApp',
      );
      expect(
        (run!.discarded as { reason: string }[]).every(
          (d) => d.reason === 'NO_ELIGIBLE',
        ),
      ).toBe(true);
      expect(await assignmentsOf(biz.id)).toHaveLength(0);
    });

    it('presupuesto agotado: bloquea con el motivo, sin reclutar', async () => {
      const biz = await business('budget', {
        customers: 40,
        consented: 40,
        policy: { messagingBudgetMonthly: 1 },
      });
      const run = await autonomy.runForBusiness(biz.id, NOW);
      expect(run?.status).toBe('BLOCKED');
      expect(
        (run!.blockers as { code: string }[]).map((b) => b.code),
      ).toContain('MESSAGING_BUDGET_EXCEEDED');
      expect(await assignmentsOf(biz.id)).toHaveLength(0);
    });

    it('tope de campañas de la semana alcanzado y kill switch', async () => {
      const capped = await business('capped', {
        customers: 40,
        consented: 40,
        policy: { maxNewCampaignsPerWeek: 0 },
      });
      const run = await autonomy.runForBusiness(capped.id, NOW);
      expect(run?.status).toBe('BLOCKED');
      expect((run!.blockers as { code: string }[])[0].code).toBe(
        'WEEKLY_CAMPAIGNS_LIMIT',
      );
      const paused = await business('paused', {
        customers: 40,
        consented: 40,
        policy: { paused: true, pausedReason: 'MANUAL' },
      });
      const pausedRun = await autonomy.runForBusiness(paused.id, NOW);
      expect(pausedRun?.status).toBe('BLOCKED');
      expect(await assignmentsOf(paused.id)).toHaveLength(0);
    });

    it('presupuesto que alcanza para pocos: achica el grupo en vez de saltear la regla', async () => {
      // 3 × 2 = 6 de presupuesto: entran 3 mensajes, no 10.
      const biz = await business('shrink', {
        customers: 60,
        consented: 60,
        policy: { messagingBudgetMonthly: 6 },
      });
      const run = await autonomy.runForBusiness(biz.id, NOW);
      expect(run?.status).toBe('EXECUTED');
      expect(run!.plannedCustomerIds.length).toBeLessThanOrEqual(3);
      expect(Number(run!.estimatedCost)).toBeLessThanOrEqual(6);
    });
  });

  // ---------------------------------------------------------------------------
  describe('cola caída y worker', () => {
    it('sin cola, la corrida queda registrada y lo reclutado espera PENDING; repetir no duplica', async () => {
      const biz = await business('queue', { customers: 60, consented: 60 });
      const deadQueue = {
        enqueueSendAssignment: jest.fn().mockResolvedValue(null),
        enqueueSendMessage: jest.fn().mockResolvedValue(null),
        enqueueDeferredAssignment: jest.fn().mockResolvedValue(null),
      };
      // El barrido de Autopilot recorre todos los negocios de la base: acá
      // no es lo que se prueba y solo interferiría con otros specs.
      const noSweep = {
        runDaily: jest
          .fn()
          .mockResolvedValue({ businesses: 0, assigned: 0, ms: 0 }),
      };
      const worker = new RetentionV2Worker(
        prisma,
        noSweep as never,
        app.get(RetentionV2SendService),
        app.get(RetentionOutcomeService),
        app.get(RetentionV2MessageDispatchService),
        deadQueue as never,
        autonomy,
      );
      const job = { name: RUN_RETENTION_V2_EVALUATE_JOB, data: {} } as never;
      await worker.process(job);
      await worker.process(job);
      const runs = await prisma.autonomousRun.findMany({
        where: { businessId: biz.id },
      });
      expect(runs).toHaveLength(1);
      const assignments = await assignmentsOf(biz.id);
      expect(assignments).toHaveLength(runs[0].assignedCount);
      expect(assignments.every((a) => a.status === 'PENDING')).toBe(true);
    }, 60_000);
  });

  // ---------------------------------------------------------------------------
  describe('acceso y rollout', () => {
    let biz: { id: string };
    let other: { id: string };
    let owner: string;
    let operator: string;
    let outsider: string;

    beforeAll(async () => {
      biz = await business('http', {
        customers: 20,
        consented: 20,
        mode: AutonomyMode.DRY_RUN,
      });
      other = await business('http-other', {
        customers: 5,
        consented: 5,
        mode: AutonomyMode.DRY_RUN,
      });
      for (const [label, businessId, role] of [
        ['owner', biz.id, MembershipRole.OWNER],
        ['op', biz.id, MembershipRole.OPERATOR],
        ['out', other.id, MembershipRole.OWNER],
      ] as const) {
        const user = await createTestUser(prisma, `${s}-${label}`);
        users.push(user.id);
        await createTestMembership(prisma, user.id, businessId, role);
        if (label === 'owner') owner = user.id;
        if (label === 'op') operator = user.id;
        if (label === 'out') outsider = user.id;
      }
      await autonomy.runForBusiness(biz.id, NOW);
      await autonomy.runForBusiness(other.id, NOW);
    });

    const as = (userId: string, businessId: string, admin = false) => ({
      'x-test-user-id': userId,
      'x-business-id': businessId,
      ...(admin ? { 'x-test-admin': '1' } : {}),
    });

    it('el dueño ve su actividad; nunca ids de clientes', async () => {
      const res = await request(app.getHttpServer())
        .get('/intelligence/autonomy')
        .set(as(owner, biz.id));
      expect(res.status).toBe(200);
      expect(res.body.mode).toBe('DRY_RUN');
      expect(res.body.runs).toHaveLength(1);
      expect(res.body.runs[0]).toHaveProperty('plannedCount');
      expect(JSON.stringify(res.body)).not.toContain('plannedCustomerIds');
    });

    it('acceso cruzado: la corrida de otro negocio es un 404; un OPERATOR no entra', async () => {
      const foreign = await prisma.autonomousRun.findFirstOrThrow({
        where: { businessId: other.id },
      });
      expect(
        (
          await request(app.getHttpServer())
            .get(`/intelligence/autonomy/runs/${foreign.id}`)
            .set(as(owner, biz.id))
        ).status,
      ).toBe(404);
      expect(
        (
          await request(app.getHttpServer())
            .get('/intelligence/autonomy')
            .set(as(operator, biz.id))
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app.getHttpServer())
            .get('/intelligence/autonomy')
            .set(as(outsider, biz.id))
        ).status,
      ).toBe(403);
    });

    it('la vista previa no guarda nada', async () => {
      const before = await prisma.autonomousRun.count({
        where: { businessId: biz.id },
      });
      const res = await request(app.getHttpServer())
        .post('/intelligence/autonomy/preview')
        .set(as(owner, biz.id));
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('plannedCount');
      expect(
        await prisma.autonomousRun.count({ where: { businessId: biz.id } }),
      ).toBe(before);
    });

    it('PILOT solo lo activa Platform Admin, con confirmación y prerequisitos', async () => {
      const url = `/platform/businesses/${biz.id}/autonomy`;
      expect(
        (
          await request(app.getHttpServer())
            .patch(url)
            .set(as(owner, biz.id))
            .send({ mode: 'PILOT', confirmPilot: true })
        ).status,
      ).toBe(403);
      const noConfirm = await request(app.getHttpServer())
        .patch(url)
        .set(as(owner, biz.id, true))
        .send({ mode: 'PILOT' });
      expect(noConfirm.status).toBe(400);
      expect(noConfirm.body.message).toContain('confirmación explícita');
      await prisma.businessPolicy.update({
        where: { businessId: biz.id },
        data: { messageUnitCost: null },
      });
      const noCost = await request(app.getHttpServer())
        .patch(url)
        .set(as(owner, biz.id, true))
        .send({ mode: 'PILOT', confirmPilot: true });
      expect(noCost.status).toBe(400);
      expect(noCost.body.message).toContain('costo por mensaje');
      await prisma.businessPolicy.update({
        where: { businessId: biz.id },
        data: { messageUnitCost: 2 },
      });
      const ok = await request(app.getHttpServer())
        .patch(url)
        .set(as(owner, biz.id, true))
        .send({ mode: 'PILOT', confirmPilot: true, pilotGroupSize: 5 });
      expect(ok.status).toBe(200);
      expect(ok.body).toEqual({
        mode: 'PILOT',
        pilotGroupSize: 5,
        plannerEnabled: false,
      });
    });

    it('el dueño lo apaga en cualquier momento (rollback)', async () => {
      const res = await request(app.getHttpServer())
        .post('/intelligence/autonomy/disable')
        .set(as(owner, biz.id));
      expect(res.status).toBe(200);
      expect(res.body.mode).toBe('OFF');
      expect(
        await prisma.auditLog.count({
          where: { businessId: biz.id, action: 'AUTONOMY_MODE_SET' },
        }),
      ).toBe(2);
    });
  });
});
