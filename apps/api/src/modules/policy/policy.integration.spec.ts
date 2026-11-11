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
  ExperienceVersion,
  MembershipRole,
  Prisma,
} from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { CustomersModule } from '../customers/customers.module';
import { RetentionBudgetService } from '../retention-v2/retention-budget.service';
import {
  createTestBusiness,
  createTestMembership,
  createTestUser,
  makeTestSuffix,
} from '../reviews/reviews.test-helpers';
import { PolicyModule } from './policy.module';
import { PolicyGateService } from './policy-gate.service';
import { ConsentService } from './consent.service';
import {
  BALANCED_PRESET,
  POLICY_VERSION,
  type PolicyEffect,
} from './policy-rules';

/**
 * El motor contra Postgres real y por HTTP: lo que se prueba es que ningún
 * camino (pantalla, reintento, concurrencia, otro negocio, otro rol) pueda
 * pasar un tope de consentimiento, frecuencia, horario, costo o permisos.
 */

class FakeJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const userId = req.headers['x-test-user-id'];
    if (!userId) return false;
    req.user = {
      id: userId,
      email: 'p@test.local',
      firstName: 'P',
      lastName: 'T',
      isActive: true,
      isPlatformAdmin: req.headers['x-test-admin'] === '1',
    };
    return true;
  }
}

const NOW = new Date();

describe('Policy & Budget Engine (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let gate: PolicyGateService;
  let consent: ConsentService;
  let budget: RetentionBudgetService;
  const whatsAppSend = jest
    .spyOn(WhatsAppBspService.prototype, 'sendText')
    .mockResolvedValue({ whatsappMessageId: 'wamid-test' });
  const sleep = jest
    .spyOn(CampaignsService.prototype as never, 'sleep')
    .mockResolvedValue(undefined as never);

  const s = makeTestSuffix();
  const users: string[] = [];
  const businesses: string[] = [];
  let phoneSeq = 0;
  // Prefijo numérico propio: el sufijo del test es alfanumérico y daría
  // teléfonos que `normalizeToE164` rechaza.
  const phonePrefix = String(Math.floor(Math.random() * 900) + 100);

  const as = (userId: string, businessId: string, admin = false) => ({
    'x-test-user-id': userId,
    'x-business-id': businessId,
    ...(admin ? { 'x-test-admin': '1' } : {}),
  });

  async function business(label: string) {
    const b = await createTestBusiness(prisma, `${s}-${label}`);
    await prisma.business.update({
      where: { id: b.id },
      data: { experienceVersion: ExperienceVersion.CHECKIN_V2 },
    });
    // Ventana amplia: el test no depende de la hora a la que corre.
    await prisma.retentionSettings.create({
      data: {
        businessId: b.id,
        sendingHourStart: 0,
        sendingHourEnd: 24,
        allowedSendingDays: [1, 2, 3, 4, 5, 6, 7],
      },
    });
    businesses.push(b.id);
    return b.id;
  }

  async function user(label: string, businessId: string, role: MembershipRole) {
    const u = await createTestUser(prisma, `${s}-${label}`);
    users.push(u.id);
    await createTestMembership(prisma, u.id, businessId, role);
    return u.id;
  }

  async function customers(businessId: string, n: number, granted: boolean) {
    const created: string[] = [];
    for (let i = 0; i < n; i++) {
      phoneSeq += 1;
      const c = await prisma.customer.create({
        data: {
          businessId,
          name: `Cliente ${phoneSeq}`,
          phoneE164: `+5989${phonePrefix}${String(phoneSeq).padStart(4, '0')}`,
        },
      });
      if (granted) {
        await prisma.customerConsentEvent.create({
          data: {
            businessId,
            customerId: c.id,
            channel: 'WHATSAPP',
            action: 'GRANTED',
            source: 'CHECKIN_FORM',
          },
        });
      }
      created.push(c.id);
    }
    return created;
  }

  /** Política aceptada directo en la base (el flujo HTTP tiene su propio test). */
  async function accept(
    businessId: string,
    overrides: Partial<Prisma.BusinessPolicyUncheckedCreateInput> = {},
  ) {
    await prisma.businessPolicy.create({
      data: {
        businessId,
        acceptedAt: NOW,
        acceptedVersion: POLICY_VERSION,
        confirmedCurrency: 'UYU',
        confirmedTimezone: 'America/Montevideo',
        messagingBudgetMonthly: BALANCED_PRESET.messagingBudgetMonthly,
        maxUniqueRecipientsPerWeek: BALANCED_PRESET.maxUniqueRecipientsPerWeek,
        maxNewCampaignsPerWeek: BALANCED_PRESET.maxNewCampaignsPerWeek,
        maxCampaignSharePercent: BALANCED_PRESET.maxCampaignSharePercent,
        messageUnitCost: 2,
        messageUnitCostCurrency: 'UYU',
        ...overrides,
      },
    });
    await prisma.retentionSettings.update({
      where: { businessId },
      data: {
        maxEstimatedIncentiveCostPerMonth:
          BALANCED_PRESET.incentiveBudgetMonthly,
      },
    });
  }

  const promotion = (
    userId: string,
    businessId: string,
    body: Record<string, unknown> = {},
  ) =>
    request(app.getHttpServer())
      .post('/notifications/promotions')
      .set(as(userId, businessId))
      .send({
        message: 'Hola {nombre}, te esperamos',
        audience: 'todos',
        ...body,
      });

  const effect = (
    candidateCustomerIds: string[],
    overrides: Partial<PolicyEffect> = {},
  ): PolicyEffect => ({
    source: 'PROMOTION',
    actorRole: 'OWNER',
    kind: 'MESSAGE',
    createsCampaign: true,
    candidateCustomerIds,
    incentive: null,
    ...overrides,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1_000 }]),
        PolicyModule,
        NotificationsModule,
        CustomersModule,
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
    gate = app.get(PolicyGateService);
    consent = app.get(ConsentService);
    budget = app.get(RetentionBudgetService);
  });

  afterEach(() => {
    whatsAppSend.mockClear();
  });

  afterAll(async () => {
    const where = { businessId: { in: businesses } };
    await prisma.benefitParticipation.deleteMany({ where });
    await prisma.manualCampaignContact.deleteMany({ where });
    await prisma.manualCampaign.deleteMany({ where });
    await prisma.auditLog.deleteMany({ where });
    await prisma.retentionIncentiveDefinition.deleteMany({ where });
    await prisma.benefit.deleteMany({ where });
    await prisma.customer.deleteMany({ where });
    await prisma.retentionSettings.deleteMany({ where });
    await prisma.membership.deleteMany({ where });
    await prisma.business.deleteMany({ where: { id: { in: businesses } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    whatsAppSend.mockRestore();
    sleep.mockRestore();
    await app.close();
  });

  // ---------------------------------------------------------------------------
  describe('configuración, aceptación y roles', () => {
    let biz: string;
    let owner: string;
    let admin: string;
    let operator: string;

    beforeAll(async () => {
      biz = await business('cfg');
      owner = await user('cfg-owner', biz, MembershipRole.OWNER);
      admin = await user('cfg-admin', biz, MembershipRole.ADMIN);
      operator = await user('cfg-op', biz, MembershipRole.OPERATOR);
    });

    const values = {
      messagingBudgetMonthly: 500,
      incentiveBudgetMonthly: 1500,
      maxUniqueRecipientsPerWeek: 25,
      maxNewCampaignsPerWeek: 2,
      minDaysBetweenPromotions: 14,
      maxPromotionsPer30Days: 2,
      sendingHourStart: 10,
      sendingHourEnd: 20,
      maxCampaignSharePercent: 25,
    };

    it('un negocio existente arranca sin política: nada se activa solo', async () => {
      const res = await request(app.getHttpServer())
        .get('/policy')
        .set(as(operator, biz));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        accepted: false,
        paused: false,
        preset: { messagingBudgetMonthly: 500, maxUniqueRecipientsPerWeek: 25 },
        blockers: [{ code: 'POLICY_NOT_ACCEPTED' }],
      });
      expect(
        await prisma.businessPolicy.count({ where: { businessId: biz } }),
      ).toBe(0);
    });

    it('solo el dueño acepta, confirmando la moneda y la zona reales del negocio', async () => {
      const body = {
        ...values,
        confirmedCurrency: 'UYU',
        confirmedTimezone: 'America/Montevideo',
        policyVersion: POLICY_VERSION,
      };
      const byAdmin = await request(app.getHttpServer())
        .post('/policy/accept')
        .set(as(admin, biz))
        .send(body);
      expect(byAdmin.status).toBe(403);

      const wrongCurrency = await request(app.getHttpServer())
        .post('/policy/accept')
        .set(as(owner, biz))
        .send({ ...body, confirmedCurrency: 'USD' });
      expect(wrongCurrency.status).toBe(400);

      const incomplete = await request(app.getHttpServer())
        .post('/policy/accept')
        .set(as(owner, biz))
        .send({ ...body, messagingBudgetMonthly: undefined });
      expect(incomplete.status).toBe(400);

      const ok = await request(app.getHttpServer())
        .post('/policy/accept')
        .set(as(owner, biz))
        .send(body);
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({
        accepted: true,
        confirmed: { currency: 'UYU', timezone: 'America/Montevideo' },
        values,
      });
      // Una sola fuente de verdad: frecuencia, ventana e incentivos viven en RetentionSettings.
      const settings = await prisma.retentionSettings.findUniqueOrThrow({
        where: { businessId: biz },
      });
      expect(settings).toMatchObject({
        minimumDaysBetweenRetentionMessages: 14,
        maximumRetentionMessagesPer30Days: 2,
        sendingHourStart: 10,
        sendingHourEnd: 20,
      });
      expect(Number(settings.maxEstimatedIncentiveCostPerMonth)).toBe(1500);
      expect(
        await prisma.auditLog.count({
          where: {
            businessId: biz,
            action: 'POLICY_ACCEPTED',
            actorUserId: owner,
          },
        }),
      ).toBe(1);
    });

    it('editar con una versión vieja no pisa el cambio de otro', async () => {
      const current = await request(app.getHttpServer())
        .get('/policy')
        .set(as(owner, biz));
      const version = current.body.version as number;
      const first = await request(app.getHttpServer())
        .put('/policy')
        .set(as(owner, biz))
        .send({
          ...values,
          maxUniqueRecipientsPerWeek: 30,
          expectedVersion: version,
        });
      expect(first.status).toBe(200);
      const stale = await request(app.getHttpServer())
        .put('/policy')
        .set(as(owner, biz))
        .send({
          ...values,
          maxUniqueRecipientsPerWeek: 99,
          expectedVersion: version,
        });
      expect(stale.status).toBe(409);
      const byAdmin = await request(app.getHttpServer())
        .put('/policy')
        .set(as(admin, biz))
        .send({ ...values, expectedVersion: version + 1 });
      expect(byAdmin.status).toBe(403);
      expect(
        (
          await prisma.businessPolicy.findUniqueOrThrow({
            where: { businessId: biz },
          })
        ).maxUniqueRecipientsPerWeek,
      ).toBe(30);
    });

    it('kill switch: un admin puede pausar, solo el dueño reanuda', async () => {
      const paused = await request(app.getHttpServer())
        .post('/policy/pause')
        .set(as(admin, biz));
      expect(paused.status).toBe(200);
      expect(paused.body).toMatchObject({
        paused: true,
        pausedReason: 'MANUAL',
      });
      expect(
        (
          await request(app.getHttpServer())
            .post('/policy/pause')
            .set(as(operator, biz))
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app.getHttpServer())
            .post('/policy/resume')
            .set(as(admin, biz))
        ).status,
      ).toBe(403);
      const resumed = await request(app.getHttpServer())
        .post('/policy/resume')
        .set(as(owner, biz));
      expect(resumed.body.paused).toBe(false);
      expect(
        await prisma.auditLog.count({
          where: {
            businessId: biz,
            action: { in: ['POLICY_PAUSED', 'POLICY_RESUMED'] },
          },
        }),
      ).toBe(2);
    });

    it('el costo por mensaje solo lo carga Platform Admin, en la moneda del negocio', async () => {
      const url = `/platform/businesses/${biz}/policy/message-cost`;
      const notAdmin = await request(app.getHttpServer())
        .patch(url)
        .set(as(owner, biz))
        .send({ unitCost: 1.5, currency: 'UYU' });
      expect(notAdmin.status).toBe(403);
      const wrong = await request(app.getHttpServer())
        .patch(url)
        .set(as(owner, biz, true))
        .send({ unitCost: 1.5, currency: 'USD' });
      expect(wrong.status).toBe(400);
      const ok = await request(app.getHttpServer())
        .patch(url)
        .set(as(owner, biz, true))
        .send({ unitCost: 1.5, currency: 'UYU' });
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({
        messageUnitCost: 1.5,
        messageUnitCostCurrency: 'UYU',
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('consentimiento', () => {
    let biz: string;
    let other: string;
    let owner: string;
    let operator: string;
    let customer: string;
    let foreign: string;

    beforeAll(async () => {
      biz = await business('cons');
      other = await business('cons-other');
      owner = await user('cons-owner', biz, MembershipRole.OWNER);
      operator = await user('cons-op', biz, MembershipRole.OPERATOR);
      [customer] = await customers(biz, 1, false);
      [foreign] = await customers(other, 1, false);
    });

    const record = (
      userId: string,
      id: string,
      body: Record<string, unknown>,
    ) =>
      request(app.getHttpServer())
        .post(`/customers/${id}/consent`)
        .set(as(userId, biz))
        .send(body);

    it('alta y baja del staff quedan como eventos, con el espejo optedOut', async () => {
      const granted = await record(operator, customer, {
        channel: 'WHATSAPP',
        action: 'GRANTED',
      });
      expect(granted.status).toBe(200);
      expect(granted.body.whatsapp).toBe('GRANTED');

      const revoked = await record(operator, customer, {
        channel: 'WHATSAPP',
        action: 'REVOKED',
      });
      expect(revoked.body.whatsapp).toBe('REVOKED');
      expect(
        (await prisma.customer.findUniqueOrThrow({ where: { id: customer } }))
          .optedOut,
      ).toBe(true);

      const again = await record(operator, customer, {
        channel: 'WHATSAPP',
        action: 'GRANTED',
      });
      expect(again.body.whatsapp).toBe('GRANTED');
      expect(
        (await prisma.customer.findUniqueOrThrow({ where: { id: customer } }))
          .optedOut,
      ).toBe(false);
      expect(again.body.events).toHaveLength(3);
      expect(again.body.events[0]).toMatchObject({
        source: 'STAFF',
        textVersion: 'whatsapp-marketing-v2',
      });
    });

    it('suprimir es de dueño/admin; un GRANTED posterior no la levanta', async () => {
      const byOperator = await record(operator, customer, {
        channel: 'WHATSAPP',
        action: 'SUPPRESSED',
      });
      expect(byOperator.status).toBe(403);
      await record(owner, customer, {
        channel: 'WHATSAPP',
        action: 'SUPPRESSED',
        complaint: true,
      });
      const regrant = await record(operator, customer, {
        channel: 'WHATSAPP',
        action: 'GRANTED',
      });
      expect(regrant.body.whatsapp).toBe('SUPPRESSED');
      const lifted = await record(owner, customer, {
        channel: 'WHATSAPP',
        action: 'UNSUPPRESSED',
      });
      expect(lifted.body.whatsapp).toBe('GRANTED');
    });

    it('un cliente de otro negocio es un 404, para leer y para escribir', async () => {
      expect(
        (
          await request(app.getHttpServer())
            .get(`/customers/${foreign}/consent`)
            .set(as(owner, biz))
        ).status,
      ).toBe(404);
      expect(
        (
          await record(owner, foreign, {
            channel: 'WHATSAPP',
            action: 'GRANTED',
          })
        ).status,
      ).toBe(404);
      expect(
        await prisma.customerConsentEvent.count({
          where: { customerId: foreign },
        }),
      ).toBe(0);
    });

    it('"BAJA" por WhatsApp revoca en todos los negocios donde está ese teléfono', async () => {
      const phone = `+5989${phonePrefix}7777`;
      const a = await prisma.customer.create({
        data: { businessId: biz, name: 'Doble', phoneE164: phone },
      });
      const b = await prisma.customer.create({
        data: { businessId: other, name: 'Doble', phoneE164: phone },
      });
      expect(await consent.revokeByPhone(`whatsapp:${phone}`)).toBe(2);
      const rows = await prisma.customer.findMany({
        where: { id: { in: [a.id, b.id] } },
        select: { optedOut: true },
      });
      expect(rows.every((r) => r.optedOut)).toBe(true);
      expect(
        await prisma.customerConsentEvent.count({
          where: {
            customerId: { in: [a.id, b.id] },
            source: 'INBOUND_KEYWORD',
          },
        }),
      ).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  describe('promociones', () => {
    it('sin política aceptada: igual solo a quien autorizó WhatsApp', async () => {
      const biz = await business('legacy');
      const owner = await user('legacy-owner', biz, MembershipRole.OWNER);
      await customers(biz, 2, false);
      await customers(biz, 1, true);
      const res = await promotion(owner, biz);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        sent: 1,
        consent: {
          audience: 3,
          whatsappEligible: 1,
          whatsappExcludedNoConsent: 2,
        },
      });
      expect(res.body.policy).toBeUndefined();
      expect(whatsAppSend).toHaveBeenCalledTimes(1);
    });

    it('sin nadie que haya autorizado, no se manda nada', async () => {
      const biz = await business('noconsent');
      const owner = await user('noconsent-owner', biz, MembershipRole.OWNER);
      await customers(biz, 2, false);
      const res = await promotion(owner, biz);
      expect(res.status).toBe(400);
      expect(whatsAppSend).not.toHaveBeenCalled();
    });

    it('con política: solo a quienes dieron consentimiento, y queda conciliado', async () => {
      const biz = await business('promo');
      const owner = await user('promo-owner', biz, MembershipRole.OWNER);
      await accept(biz);
      await customers(biz, 3, true);
      await customers(biz, 2, false);

      const preview = await request(app.getHttpServer())
        .get('/notifications/promotions/preview?audience=todos')
        .set(as(owner, biz));
      expect(preview.body).toMatchObject({
        recipientCount: 5,
        policy: {
          allowed: true,
          eligibleCount: 3,
          excluded: { NO_CONSENT: 2 },
        },
      });

      const res = await promotion(owner, biz, { idempotencyKey: randomUUID() });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        sent: 3,
        policy: { eligibleCount: 3, cost: { currency: 'UYU', messaging: 6 } },
      });
      expect(whatsAppSend).toHaveBeenCalledTimes(3);
      const reservation = await prisma.policyReservation.findFirstOrThrow({
        where: { businessId: biz },
      });
      expect(reservation).toMatchObject({
        status: 'COMMITTED',
        messageCount: 3,
      });
      expect(Number(reservation.messagingAmount)).toBe(6);
      expect(reservation.sourceRef).toBe(res.body.campaignId);
    });

    it('doble click y reintento: la misma clave nunca manda dos veces', async () => {
      const biz = await business('idem');
      const owner = await user('idem-owner', biz, MembershipRole.OWNER);
      await accept(biz);
      await customers(biz, 2, true);
      const key = randomUUID();

      const [a, b] = await Promise.all([
        promotion(owner, biz, { idempotencyKey: key }),
        promotion(owner, biz, { idempotencyKey: key }),
      ]);
      const statuses = [a.status, b.status].sort();
      // Uno envía; el otro ve el envío en curso (409) o su resultado (201).
      expect(statuses[0]).toBe(201);
      expect([201, 409]).toContain(statuses[1]);
      expect(whatsAppSend).toHaveBeenCalledTimes(2);

      const retry = await promotion(owner, biz, { idempotencyKey: key });
      expect(retry.status).toBe(201);
      expect(retry.body.campaignId).toBe(
        (a.status === 201 ? a : b).body.campaignId,
      );
      expect(whatsAppSend).toHaveBeenCalledTimes(2);
      expect(
        await prisma.manualCampaign.count({ where: { businessId: biz } }),
      ).toBe(1);
    });

    it('frecuencia: quien recibió una promoción no recibe otra antes de 14 días', async () => {
      const biz = await business('freq');
      const owner = await user('freq-owner', biz, MembershipRole.OWNER);
      await accept(biz);
      await customers(biz, 2, true);
      expect((await promotion(owner, biz)).body.sent).toBe(2);
      const again = await promotion(owner, biz);
      expect(again.status).toBe(400);
      expect(again.body.message).toContain('frecuencia');
      expect(whatsAppSend).toHaveBeenCalledTimes(2);
    });

    it('presupuesto de mensajería: si no alcanza, no sale nada ni queda reserva', async () => {
      const biz = await business('budget');
      const owner = await user('budget-owner', biz, MembershipRole.OWNER);
      await accept(biz, { messagingBudgetMonthly: 4 });
      await customers(biz, 3, true);
      const res = await promotion(owner, biz);
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('presupuesto de mensajería');
      expect(whatsAppSend).not.toHaveBeenCalled();
      expect(
        await prisma.policyReservation.count({ where: { businessId: biz } }),
      ).toBe(0);
      expect(
        await prisma.auditLog.count({
          where: { businessId: biz, action: 'POLICY_DENIED' },
        }),
      ).toBe(1);
    });

    it('sin costo por mensaje cargado, o con la moneda cambiada, se bloquea', async () => {
      const biz = await business('nocost');
      const owner = await user('nocost-owner', biz, MembershipRole.OWNER);
      await accept(biz, {
        messageUnitCost: null,
        messageUnitCostCurrency: null,
      });
      await customers(biz, 1, true);
      const res = await promotion(owner, biz);
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('costo por mensaje');

      await prisma.businessPolicy.update({
        where: { businessId: biz },
        data: { messageUnitCost: 2, messageUnitCostCurrency: 'UYU' },
      });
      await prisma.business.update({
        where: { id: biz },
        data: { currency: 'USD' },
      });
      const changed = await promotion(owner, biz);
      expect(changed.status).toBe(400);
      expect(changed.body.message).toContain('confirmalas de nuevo');
      expect(whatsAppSend).not.toHaveBeenCalled();
    });

    it('kill switch: con el negocio pausado no sale ninguna promoción', async () => {
      const biz = await business('paused');
      const owner = await user('paused-owner', biz, MembershipRole.OWNER);
      await accept(biz, { paused: true, pausedReason: 'MANUAL' });
      await customers(biz, 2, true);
      const res = await promotion(owner, biz);
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('pausados');
      expect(whatsAppSend).not.toHaveBeenCalled();
    });

    it('un OPERATOR puede mandar un mensaje, pero no una promoción con premio', async () => {
      const biz = await business('role');
      const operator = await user('role-op', biz, MembershipRole.OPERATOR);
      await accept(biz);
      const [customer] = await customers(biz, 1, true);
      const withPrize = await gate.reserve(
        {
          businessId: biz,
          effect: effect([customer], {
            actorRole: 'OPERATOR',
            incentive: { unitCost: 10 },
          }),
        },
        { idempotencyKey: randomUUID(), userId: operator },
      );
      expect(withPrize).toMatchObject({
        status: 'DENIED',
        decision: { blockers: [{ code: 'ROLE_NOT_ALLOWED' }] },
      });
      const res = await promotion(operator, biz);
      expect(res.status).toBe(201);
      expect(res.body.sent).toBe(1);
    });

    it('pausa automática por bajas: después de 3 "BAJA" el negocio se pausa solo', async () => {
      const biz = await business('autopause');
      const owner = await user('autopause-owner', biz, MembershipRole.OWNER);
      await accept(biz);
      const ids = await customers(biz, 3, true);
      expect((await promotion(owner, biz)).body.sent).toBe(3);

      const phones = await prisma.customer.findMany({
        where: { id: { in: ids } },
        select: { phoneE164: true },
      });
      for (const { phoneE164 } of phones)
        await consent.revokeByPhone(phoneE164);
      expect(await gate.checkHealth(biz)).toBe('AUTO_OPT_OUTS');

      const policy = await prisma.businessPolicy.findUniqueOrThrow({
        where: { businessId: biz },
      });
      expect(policy).toMatchObject({
        paused: true,
        pausedReason: 'AUTO_OPT_OUTS',
      });
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { businessId: biz, action: 'POLICY_PAUSED' },
      });
      expect(audit.actorUserId).toBeNull();
      // Nunca reanuda sola: un segundo chequeo no cambia nada.
      expect(await gate.checkHealth(biz)).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  describe('reservas: concurrencia, caducidad y conciliación', () => {
    let biz: string;
    let owner: string;

    beforeAll(async () => {
      biz = await business('res');
      owner = await user('res-owner', biz, MembershipRole.OWNER);
      await accept(biz, { maxNewCampaignsPerWeek: 3 });
    });

    afterEach(async () => {
      await prisma.policyReservation.deleteMany({ where: { businessId: biz } });
    });

    it('5 campañas concurrentes con lugar para 3: exactamente 3 reservan', async () => {
      const groups = await Promise.all(
        Array.from({ length: 5 }, () => customers(biz, 1, true)),
      );
      const outcomes = await Promise.all(
        groups.map((g) =>
          gate.reserve(
            { businessId: biz, effect: effect(g) },
            { idempotencyKey: randomUUID(), userId: owner },
          ),
        ),
      );
      const reserved = outcomes.filter((o) => o.status === 'RESERVED');
      const denied = outcomes.filter((o) => o.status === 'DENIED');
      expect(reserved).toHaveLength(3);
      expect(denied).toHaveLength(2);
      for (const d of denied) {
        expect(d.status === 'DENIED' && d.decision.blockers[0].code).toBe(
          'WEEKLY_CAMPAIGNS_LIMIT',
        );
      }
    });

    it('presupuesto de incentivos bajo concurrencia: nunca se pasa la bolsa', async () => {
      // 1500 de tope, 25% por campaña = 500; cada reserva: 1 × (2 + 400) = 402.
      const groups = await Promise.all(
        Array.from({ length: 6 }, () => customers(biz, 1, true)),
      );
      const outcomes = await Promise.all(
        groups.map((g) =>
          gate.reserve(
            {
              businessId: biz,
              effect: effect(g, {
                createsCampaign: false,
                incentive: { unitCost: 400 },
              }),
            },
            { idempotencyKey: randomUUID(), userId: owner },
          ),
        ),
      );
      expect(outcomes.filter((o) => o.status === 'RESERVED')).toHaveLength(3);
      const agg = await prisma.policyReservation.aggregate({
        where: { businessId: biz, status: 'HELD' },
        _sum: { incentiveAmount: true },
      });
      expect(Number(agg._sum.incentiveAmount)).toBeLessThanOrEqual(1500);
    });

    it('una reserva vencida deja de contar y queda EXPIRED', async () => {
      const groups = await Promise.all(
        Array.from({ length: 3 }, () => customers(biz, 1, true)),
      );
      for (const g of groups) {
        await gate.reserve(
          { businessId: biz, effect: effect(g) },
          { idempotencyKey: randomUUID(), userId: owner },
        );
      }
      await prisma.policyReservation.updateMany({
        where: { businessId: biz },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const fresh = await gate.reserve(
        { businessId: biz, effect: effect(await customers(biz, 1, true)) },
        { idempotencyKey: randomUUID(), userId: owner },
      );
      expect(fresh.status).toBe('RESERVED');
      expect(
        await prisma.policyReservation.count({
          where: { businessId: biz, status: 'EXPIRED' },
        }),
      ).toBe(3);
    });

    it('conciliación: se confirma lo que realmente salió; liberar devuelve todo', async () => {
      const group = await customers(biz, 4, true);
      const outcome = await gate.reserve(
        { businessId: biz, effect: effect(group, { createsCampaign: false }) },
        { idempotencyKey: randomUUID(), userId: owner },
      );
      if (outcome.status !== 'RESERVED') throw new Error(outcome.status);
      expect(Number(outcome.reservation.messagingAmount)).toBe(8);
      await gate.commit(outcome.reservation.id, {
        messagesSent: 3,
        incentivesIssued: 0,
      });
      const committed = await prisma.policyReservation.findUniqueOrThrow({
        where: { id: outcome.reservation.id },
      });
      expect(committed).toMatchObject({ status: 'COMMITTED', messageCount: 3 });
      expect(Number(committed.messagingAmount)).toBe(6);

      const other = await gate.reserve(
        {
          businessId: biz,
          effect: effect(await customers(biz, 1, true), {
            createsCampaign: false,
          }),
        },
        { idempotencyKey: randomUUID(), userId: owner },
      );
      if (other.status !== 'RESERVED') throw new Error(other.status);
      await gate.release(other.reservation.id, 'test');
      // Liberar dos veces no hace nada; confirmar una liberada tampoco.
      await gate.release(other.reservation.id, 'test');
      await gate.commit(other.reservation.id, {
        messagesSent: 1,
        incentivesIssued: 0,
      });
      expect(
        (
          await prisma.policyReservation.findUniqueOrThrow({
            where: { id: other.reservation.id },
          })
        ).status,
      ).toBe('RELEASED');
    });

    it('la misma clave mientras está en vuelo es IN_PROGRESS; liberada se puede reusar', async () => {
      const group = await customers(biz, 1, true);
      const key = randomUUID();
      const first = await gate.reserve(
        { businessId: biz, effect: effect(group, { createsCampaign: false }) },
        { idempotencyKey: key, userId: owner },
      );
      expect(first.status).toBe('RESERVED');
      const second = await gate.reserve(
        { businessId: biz, effect: effect(group, { createsCampaign: false }) },
        { idempotencyKey: key, userId: owner },
      );
      expect(second.status).toBe('IN_PROGRESS');
      if (first.status !== 'RESERVED') return;
      await gate.release(first.reservation.id, 'retry');
      const rearmed = await gate.reserve(
        { businessId: biz, effect: effect(group, { createsCampaign: false }) },
        { idempotencyKey: key, userId: owner },
      );
      expect(rearmed.status).toBe('RESERVED');
      expect(
        await prisma.policyReservation.count({
          where: { businessId: biz, idempotencyKey: key },
        }),
      ).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('una sola bolsa de incentivos con Autopilot', () => {
    it('lo comprometido por promociones cuenta para el tope de Autopilot', async () => {
      const biz = await business('shared');
      await accept(biz);
      const [customer] = await customers(biz, 1, true);
      const benefit = await prisma.benefit.create({
        data: { businessId: biz, type: BenefitType.gift, title: 'Torta' },
      });
      await prisma.retentionIncentiveDefinition.create({
        data: {
          businessId: biz,
          name: 'Torta',
          type: BenefitType.gift,
          benefitId: benefit.id,
          estimatedCost: 1400,
        },
      });
      await prisma.benefitParticipation.create({
        data: {
          businessId: biz,
          benefitId: benefit.id,
          customerId: customer,
          source: BenefitIssuanceSource.PROMOTION,
        },
      });

      const check = (cost: number) =>
        prisma.$transaction((tx) =>
          budget.checkWithinCaps(tx, {
            businessId: biz,
            timezone: 'America/Montevideo',
            now: new Date(),
            caps: {
              maxAutomatedIncentivesPerMonth: null,
              maxEstimatedIncentiveCostPerMonth: 1500,
            },
            estimatedCostOfThisIssue: cost,
            averageTicketAmount: null,
          }),
        );
      // 1400 ya comprometidos por la promoción: 100 entran, 101 no.
      expect(await check(100)).toEqual({ allowed: true });
      expect(await check(101)).toMatchObject({
        allowed: false,
        reasonCode: 'MONTHLY_BUDGET_LIMIT',
      });

      // Una emisión vencida sin canjear deja de contar (caducidad).
      await prisma.benefitParticipation.updateMany({
        where: { businessId: biz },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect(await check(1500)).toEqual({ allowed: true });

      // Con el kill switch, Autopilot tampoco emite.
      await prisma.businessPolicy.update({
        where: { businessId: biz },
        data: { paused: true, pausedReason: 'MANUAL' },
      });
      expect(await check(1)).toMatchObject({
        allowed: false,
        reasonCode: 'POLICY_PAUSED',
      });
    });
  });
});
