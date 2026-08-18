import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BenefitType,
  BusinessStatus,
  CustomerSegment,
  ExperienceVersion,
  RewardGoalStatus,
  VisitVerificationType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomerLoyaltyRepository } from '../customers/loyalty/customer-loyalty.repository';
import { CustomerLoyaltyService } from '../customers/loyalty/customer-loyalty.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RetentionResultsOverviewService } from '../retention-v2/retention-results-overview.service';
import { RetentionSettingsService } from '../retention-v2/retention-settings.service';
import { RetentionExperimentService } from '../retention-v2/retention-experiment.service';
import { RetentionExperimentsAdminService } from '../retention-v2/retention-experiments-admin.service';
import { RetentionV2BootstrapService } from '../retention-v2/retention-v2-bootstrap.service';
import { RetentionBudgetService } from '../retention-v2/retention-budget.service';
import { ProgramAuditService } from '../program-audit/program-audit.service';
import { ReviewsOverviewService } from '../reviews/reviews-overview.service';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { HomeService } from './home.service';
import { PlansService } from '../plans/plans.service';
import { PlansRepository } from '../plans/plans.repository';

/**
 * Inicio contra DB real.
 *
 * Lo que más importa probar acá no es que los números existan, sino que sean
 * LOS MISMOS que muestra cada sección. Una portada que dice "8 clientes
 * activos" mientras Clientes dice 7 destruye la confianza en las dos.
 */
describe('Inicio — portada (integration)', () => {
  let prisma: PrismaService;
  let home: HomeService;
  let bootstrap: RetentionV2BootstrapService;
  let loyalty: CustomerLoyaltyService;
  let reviews: ReviewsOverviewService;

  const businesses: string[] = [];
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
  const ORIGINAL_WHAPI_TOKEN = process.env.WHAPI_TOKEN;

  // El canal está "conectado" en todo este archivo — estos tests prueban
  // qué automatización se muestra activa, no el canal en sí (ver
  // `## Canal` en notifications.integration.spec.ts para ese caso).
  beforeEach(() => {
    process.env.WHAPI_TOKEN = 'test-token';
  });

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        CustomerLoyaltyRepository,
        CustomerLoyaltyService,
        ReviewsOverviewService,
        NotificationsService,
        RetentionSettingsService,
        RetentionExperimentService,
        RetentionExperimentsAdminService,
        RetentionV2BootstrapService,
        RetentionBudgetService,
        ProgramAuditService,
        WhatsAppBspService,
        HomeService,
        PlansService,
        PlansRepository,
        {
          provide: RetentionResultsOverviewService,
          useValue: { forBusiness: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    home = moduleRef.get(HomeService);
    bootstrap = moduleRef.get(RetentionV2BootstrapService);
    loyalty = moduleRef.get(CustomerLoyaltyService);
    reviews = moduleRef.get(ReviewsOverviewService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    process.env.WHAPI_TOKEN = ORIGINAL_WHAPI_TOKEN;
  });

  afterEach(async () => {
    for (const id of businesses.splice(0)) {
      await prisma.rewardGoalBonusStamp.deleteMany({
        where: { businessId: id },
      });
      await prisma.checkinFeedback.deleteMany({ where: { businessId: id } });
      await prisma.customerEvent.deleteMany({ where: { businessId: id } });
      await prisma.googleReview.deleteMany({ where: { businessId: id } });
      await prisma.benefitParticipation.deleteMany({
        where: { businessId: id },
      });
      await prisma.customerRewardGoal.deleteMany({ where: { businessId: id } });
      await prisma.visit.deleteMany({ where: { businessId: id } });
      await prisma.customer.deleteMany({ where: { businessId: id } });
      await prisma.visitSource.deleteMany({ where: { businessId: id } });
      await prisma.retentionIncentiveDefinition.deleteMany({
        where: { businessId: id },
      });
      await prisma.benefit.deleteMany({ where: { businessId: id } });
      await prisma.retentionSettings.deleteMany({ where: { businessId: id } });
      await prisma.business.delete({ where: { id } }).catch(() => undefined);
    }
  });

  async function makeBusiness(options: { google?: string | null } = {}) {
    const business = await prisma.business.create({
      data: {
        id: randomUUID(),
        name: 'Café Inicio',
        slug: `home-${randomUUID().slice(0, 8)}`,
        status: BusinessStatus.ACTIVE,
        country: 'UY',
        currency: 'UYU',
        timezone: 'America/Montevideo',
        experienceVersion: ExperienceVersion.CHECKIN_V2,
        googleBusinessProfileUrl: options.google ?? null,
      },
    });
    businesses.push(business.id);
    return business.id;
  }

  const makeCustomer = (businessId: string, name: string) =>
    prisma.customer.create({
      data: {
        id: randomUUID(),
        businessId,
        name,
        phoneE164: `+5989${String(Math.random()).slice(2, 9)}`,
      },
    });

  const addVisit = (businessId: string, customerId: string, at: Date) =>
    prisma.visit.create({
      data: {
        id: randomUUID(),
        businessId,
        customerId,
        occurredAt: at,
        visitDayKey: at.toISOString().slice(0, 10),
        verificationType: VisitVerificationType.persistent_session,
      },
    });

  async function addProgram(businessId: string, rewardName: string) {
    const benefit = await prisma.benefit.create({
      data: {
        businessId,
        title: rewardName,
        type: BenefitType.gift,
        active: false,
      },
    });
    const definition = await prisma.retentionIncentiveDefinition.create({
      data: {
        businessId,
        benefitId: benefit.id,
        name: rewardName,
        type: BenefitType.gift,
        active: true,
        rewardGoalEligible: true,
      },
    });
    await prisma.retentionSettings.upsert({
      where: { businessId },
      create: {
        businessId,
        rewardGoalsEnabled: true,
        rewardGoalMinVisits: 5,
      },
      update: { rewardGoalsEnabled: true, rewardGoalMinVisits: 5 },
    });
    return definition;
  }

  const addGoal = (
    businessId: string,
    customerId: string,
    definitionId: string,
    status: RewardGoalStatus,
  ) =>
    prisma.customerRewardGoal.create({
      data: {
        id: randomUUID(),
        businessId,
        customerId,
        incentiveDefinitionId: definitionId,
        status,
        startingVisitCount: 0,
        targetAdditionalVisits: 5,
        activatedAt: daysAgo(20),
        unlockedAt: status === RewardGoalStatus.ACTIVE ? null : daysAgo(5),
        redeemedAt: status === RewardGoalStatus.REDEEMED ? daysAgo(4) : null,
        reasonCode: 'TEST',
        segmentAtCreation: CustomerSegment.NEW,
      },
    });

  // ── La regla central ────────────────────────────────────────────────────

  describe('no redefine ninguna métrica', () => {
    it('"clientes activos" y "volvieron" son LOS MISMOS números que en Clientes', async () => {
      const businessId = await makeBusiness();
      const a = await makeCustomer(businessId, 'Ana');
      const b = await makeCustomer(businessId, 'Beto');
      await makeCustomer(businessId, 'Sin visitas');
      await addVisit(businessId, a.id, daysAgo(2));
      await addVisit(businessId, a.id, daysAgo(10));
      await addVisit(businessId, b.id, daysAgo(3));

      const inicio = await home.overview(businessId);
      const clientes = await loyalty.list(businessId, { limit: 1 });

      expect(inicio.kpis.activeCustomers).toBe(clientes.kpis.activos);
      expect(inicio.kpis.returningCustomers).toBe(clientes.kpis.volvieron);
      // Y son los valores correctos, no dos ceros que coinciden.
      expect(inicio.kpis.activeCustomers).toBe(2);
      expect(inicio.kpis.returningCustomers).toBe(1);
    });

    it('el rating y las reseñas nuevas son los MISMOS que en Reseñas', async () => {
      const businessId = await makeBusiness({ google: 'https://g.page/x' });
      for (const stars of [5, 4, 5]) {
        await prisma.googleReview.create({
          data: {
            businessId,
            googleReviewId: randomUUID(),
            stars,
            postedAt: daysAgo(3),
          },
        });
      }

      const inicio = await home.overview(businessId);
      const resenas = await reviews.forBusiness(businessId, 30);

      expect(inicio.reviews.rating).toBe(resenas.summary.rating);
      expect(inicio.kpis.newReviews).toBe(resenas.summary.inPeriod);
      expect(inicio.reviews.rating).toBe(4.7);
    });

    it('las automatizaciones reflejan el estado EFECTIVO, no el flag crudo', async () => {
      const businessId = await makeBusiness();
      // `automaticCampaignsEnabled` se pone en false EXPLÍCITAMENTE: su
      // default de schema es true, así que omitirlo dejaría dos
      // automatizaciones activas y el test estaría midiendo otra cosa.
      //
      // El kill switch (`retentionEngineV2Enabled`) se prende a mano: su
      // default es false, y sin esto NINGUNA automatización se mostraría
      // activa sin importar los flags propios — que es justamente el bug que
      // `resolveEffectiveAutomationState` existe para evitar mostrar al revés
      // (flag propio true, motor apagado, UI diciendo "Activo").
      await prisma.retentionSettings.upsert({
        where: { businessId },
        create: {
          businessId,
          progressReminderEnabled: true,
          automaticCampaignsEnabled: false,
          // Sin sellos, "cerca del premio" ni aparecería en `automations` —
          // ver el test dedicado más abajo. Este test es sobre el estado
          // EFECTIVO del flag propio, no sobre el gate de sellos.
          rewardGoalsEnabled: true,
        },
        update: {
          progressReminderEnabled: true,
          automaticCampaignsEnabled: false,
          rewardGoalsEnabled: true,
        },
      });
      await prisma.business.update({
        where: { id: businessId },
        data: { retentionEngineV2Enabled: true },
      });
      await bootstrap.ensureDefaultRetentionSetup(businessId);

      const inicio = await home.overview(businessId);

      expect(inicio.automations?.activeCount).toBe(1);
      expect(
        inicio.automations?.items.find((i) => i.key === 'cerca_del_premio')
          ?.enabled,
      ).toBe(true);
      expect(
        inicio.automations?.items.find((i) => i.key === 'te_extranamos')
          ?.enabled,
      ).toBe(false);
    });

    /**
     * El mismo caso de drift que prueba Notificaciones, visto desde Inicio.
     * Home no calcula nada por su cuenta: reenvía el `automations` que le da
     * `NotificationsService.overview`, así que un negocio con
     * `automaticCampaignsEnabled = true` (default) y el kill switch apagado
     * (también default) tiene que verse igual de OFF acá que en Notificaciones.
     */
    it('con el kill switch apagado, Inicio muestra Te extrañamos desactivado aunque el flag propio sea true', async () => {
      const businessId = await makeBusiness(); // retentionEngineV2Enabled queda en su default: false

      const inicio = await home.overview(businessId);

      expect(
        inicio.automations?.items.find((i) => i.key === 'te_extranamos')
          ?.enabled,
      ).toBe(false);
      expect(inicio.automations?.activeCount).toBe(0);
    });

    it('no filtra vocabulario interno del motor', async () => {
      const businessId = await makeBusiness();
      const serialized = JSON.stringify(await home.overview(businessId));

      for (const word of ['objective', 'experiment', 'variant', 'dryRun']) {
        expect(serialized).not.toContain(word);
      }
    });

    /**
     * §7 — Home no debe mostrar una automatización inexistente por contexto.
     * Igual que en Notificaciones: sin sellos, "cerca del premio" no está en
     * la lista (no es que esté "Desactivado" — no aplica a este negocio).
     */
    it('sin sellos activos, Inicio tampoco muestra "cerca del premio"', async () => {
      const businessId = await makeBusiness();
      await prisma.retentionSettings.upsert({
        where: { businessId },
        create: { businessId, automaticCampaignsEnabled: true },
        update: { automaticCampaignsEnabled: true },
      });
      await prisma.business.update({
        where: { id: businessId },
        data: { retentionEngineV2Enabled: true },
      });

      const inicio = await home.overview(businessId);

      // "Cumpleaños" no depende de sellos (aparece siempre, bloqueado sin
      // Pro) — solo "cerca del premio"/"sellos por vencer" desaparecen
      // cuando no hay tarjeta.
      expect(inicio.automations?.items.map((i) => i.key)).toEqual([
        'cumpleanos',
        'te_extranamos',
      ]);
    });

    /**
     * §8/§7 — sin canal, ninguna automatización puede leerse como "Activo"
     * en Inicio tampoco: hereda directo de Notificaciones, sin recalcular.
     */
    it('sin canal de WhatsApp disponible, ninguna automatización se ve activa en Inicio', async () => {
      const businessId = await makeBusiness();
      await prisma.retentionSettings.upsert({
        where: { businessId },
        create: { businessId, automaticCampaignsEnabled: true },
        update: { automaticCampaignsEnabled: true },
      });
      await prisma.business.update({
        where: { id: businessId },
        data: { retentionEngineV2Enabled: true },
      });
      delete process.env.WHAPI_TOKEN;

      const inicio = await home.overview(businessId);

      expect(inicio.automations?.activeCount).toBe(0);

      process.env.WHAPI_TOKEN = 'test-token';
    });

    /**
     * §E — reminder-only: "Te extrañamos" tiene que poder leerse como
     * genuinamente activo sin que exista un solo Benefit. Inicio hereda
     * `benefitsAutomation`/el conteo de autorizados de Notificaciones sin
     * recalcular nada — acá solo se confirma que el passthrough llega.
     */
    it('Retention reminder-only: Te extrañamos activo con 0 beneficios autorizados', async () => {
      const businessId = await makeBusiness();
      await prisma.retentionSettings.upsert({
        where: { businessId },
        create: { businessId, automaticCampaignsEnabled: true },
        update: { automaticCampaignsEnabled: true },
      });
      await prisma.business.update({
        where: { id: businessId },
        data: { retentionEngineV2Enabled: true },
      });
      await bootstrap.ensureDefaultRetentionSetup(businessId);

      const inicio = await home.overview(businessId);

      expect(
        inicio.automations?.items.find((i) => i.key === 'te_extranamos')
          ?.enabled,
      ).toBe(true);
      expect(inicio.automations?.authorizedBenefitsCount).toBe(0);
      expect(inicio.automations?.benefitsAutomation.status).toBe(
        'sin_autorizar',
      );
    });

    /**
     * §F — un beneficio autorizado sin límite mensual configurado (estado
     * heredado de antes del guardrail de presupuesto — ver Notificaciones)
     * tiene que reflejarse en `benefitsAutomation`, PERO nunca apagar "Te
     * extrañamos": son dos preguntas distintas (§3/§11).
     */
    it('beneficio autorizado sin límite: se refleja en benefitsAutomation sin apagar Te extrañamos', async () => {
      const businessId = await makeBusiness();
      await prisma.retentionSettings.upsert({
        where: { businessId },
        create: { businessId, automaticCampaignsEnabled: true },
        update: { automaticCampaignsEnabled: true },
      });
      await prisma.business.update({
        where: { id: businessId },
        data: { retentionEngineV2Enabled: true },
      });
      const benefit = await prisma.benefit.create({
        data: {
          businessId,
          title: 'Café gratis',
          type: BenefitType.gift,
          active: false,
        },
      });
      const definition = await prisma.retentionIncentiveDefinition.create({
        data: {
          businessId,
          benefitId: benefit.id,
          name: 'Café gratis',
          type: BenefitType.gift,
          active: true,
        },
      });
      // Escritura directa — el guardrail ya no permite llegar a este estado
      // por la API real; esto reproduce un negocio de antes de esa regla.
      await prisma.retentionIncentiveDefinition.update({
        where: { id: definition.id },
        data: { automationEligible: true },
      });
      await bootstrap.ensureDefaultRetentionSetup(businessId);

      const inicio = await home.overview(businessId);

      expect(inicio.automations?.benefitsAutomation.status).toBe(
        'necesita_limite',
      );
      expect(inicio.automations?.authorizedBenefitsCount).toBe(1);
      expect(
        inicio.automations?.items.find((i) => i.key === 'te_extranamos')
          ?.enabled,
      ).toBe(true); // sigue activo — el beneficio sin límite no lo apaga
    });
  });

  // ── Programa ────────────────────────────────────────────────────────────
  // Beneficios y la tarjeta de sellos son dos herramientas independientes:
  // Inicio nunca asume que la tarjeta está activa (`mode` lo dice siempre).

  describe('programa', () => {
    it('con sellos activos: mode "stamps", con estado agregado y diseño', async () => {
      const businessId = await makeBusiness();
      const definition = await addProgram(businessId, '3 medialunas gratis');
      const a = await makeCustomer(businessId, 'Ana');
      const b = await makeCustomer(businessId, 'Beto');
      await addGoal(businessId, a.id, definition.id, RewardGoalStatus.ACTIVE);
      await addGoal(businessId, b.id, definition.id, RewardGoalStatus.UNLOCKED);

      const inicio = await home.overview(businessId);

      expect(inicio.program).toMatchObject({
        mode: 'stamps',
        stampsRequired: 5,
        rewardName: '3 medialunas gratis',
        participating: 1,
        available: 1,
        // Nunca se tocó el diseño: sigue en default.
        isDefaultDesign: true,
      });
    });

    it('con la tarjeta ya diseñada, isDefaultDesign es false', async () => {
      const businessId = await makeBusiness();
      await addProgram(businessId, 'Café gratis');
      await prisma.business.update({
        where: { id: businessId },
        data: { loyaltyCardColor: '#1A1040' },
      });

      const inicio = await home.overview(businessId);

      expect(inicio.program).toMatchObject({
        mode: 'stamps',
        isDefaultDesign: false,
      });
      if (inicio.program.mode === 'stamps') {
        expect(inicio.program.appearance.cardColor).toBe('#1A1040');
      }
    });

    it('sin sellos activos: mode "benefits", nunca un hueco vacío de tarjeta', async () => {
      const businessId = await makeBusiness();
      await prisma.benefit.create({
        data: {
          businessId,
          title: '10% de descuento',
          type: BenefitType.discount,
          active: false,
        },
      });

      const inicio = await home.overview(businessId);

      expect(inicio.program).toEqual({
        mode: 'benefits',
        benefitsCount: 1,
        authorizedForReactivationCount: 0,
        // Solo tiene sentido real en modo `stamps` — acá siempre `false`,
        // para que `setupAlert`/`setupTasks` puedan mirarlo sin preguntar
        // antes por el modo (ver `HomeService.programState`).
        isDefaultDesign: false,
      });
    });

    it('sin sellos NI beneficios: sigue siendo "benefits", con todo en cero', async () => {
      const businessId = await makeBusiness();

      const inicio = await home.overview(businessId);

      expect(inicio.program).toEqual({
        mode: 'benefits',
        benefitsCount: 0,
        authorizedForReactivationCount: 0,
        isDefaultDesign: false,
      });
    });

    it('cuenta los beneficios autorizados para reactivación', async () => {
      const businessId = await makeBusiness();
      const benefit = await prisma.benefit.create({
        data: {
          businessId,
          title: '10% de descuento',
          type: BenefitType.discount,
          active: false,
        },
      });
      await prisma.retentionIncentiveDefinition.create({
        data: {
          businessId,
          benefitId: benefit.id,
          name: '10% de descuento',
          type: BenefitType.discount,
          active: true,
          automationEligible: true,
        },
      });

      const inicio = await home.overview(businessId);

      expect(inicio.program).toMatchObject({
        mode: 'benefits',
        benefitsCount: 1,
        authorizedForReactivationCount: 1,
      });
    });

    /**
     * Fase de Programa nuevo — un canje real SIEMPRE deja una
     * `BenefitParticipation.redeemedAt`, tarjeta o no (ver
     * `RedemptionService.closeRewardGoalIfRedeemed`, que sincroniza el
     * `redeemedAt` de la tarjeta con el de la participación en el mismo
     * momento). Por eso el fixture arma ambas filas juntas — un
     * `CustomerRewardGoal.redeemedAt` sin su `BenefitParticipation`
     * hermana no representa ningún canje real que el producto pueda
     * producir.
     */
    async function makeCardRedemption(
      businessId: string,
      definitionId: string,
      benefitId: string,
      customerId: string,
    ) {
      const participation = await prisma.benefitParticipation.create({
        data: {
          benefitId,
          businessId,
          customerId,
          redemptionCode: `TEST${randomUUID().slice(0, 8)}`,
          redeemedAt: daysAgo(4),
        },
      });
      await prisma.customerRewardGoal.create({
        data: {
          id: randomUUID(),
          businessId,
          customerId,
          incentiveDefinitionId: definitionId,
          benefitParticipationId: participation.id,
          status: RewardGoalStatus.REDEEMED,
          startingVisitCount: 0,
          targetAdditionalVisits: 5,
          activatedAt: daysAgo(20),
          unlockedAt: daysAgo(5),
          redeemedAt: daysAgo(4),
          reasonCode: 'TEST',
          segmentAtCreation: CustomerSegment.NEW,
        },
      });
      return participation;
    }

    it('cuenta los beneficios canjeados del período — de una tarjeta', async () => {
      const businessId = await makeBusiness();
      const definition = await addProgram(businessId, 'Café gratis');
      const customer = await makeCustomer(businessId, 'Ana');
      await makeCardRedemption(
        businessId,
        definition.id,
        definition.benefitId!,
        customer.id,
      );

      expect((await home.overview(businessId)).kpis.benefitsRedeemed).toBe(1);
    });

    it('cuenta los beneficios canjeados del período — sin ninguna tarjeta de por medio', async () => {
      const businessId = await makeBusiness();
      const benefit = await prisma.benefit.create({
        data: {
          businessId,
          title: '10% descuento',
          type: BenefitType.discount,
          active: false,
        },
      });
      const customer = await makeCustomer(businessId, 'Ana');
      await prisma.benefitParticipation.create({
        data: {
          benefitId: benefit.id,
          businessId,
          customerId: customer.id,
          redemptionCode: `TEST${randomUUID().slice(0, 8)}`,
          redeemedAt: daysAgo(4),
        },
      });

      expect((await home.overview(businessId)).kpis.benefitsRedeemed).toBe(1);
    });

    it('no duplica un canje de tarjeta — cuenta 1, no 2', async () => {
      const businessId = await makeBusiness();
      const definition = await addProgram(businessId, 'Café gratis');
      const customer = await makeCustomer(businessId, 'Ana');
      await makeCardRedemption(
        businessId,
        definition.id,
        definition.benefitId!,
        customer.id,
      );

      // El único conteo real: BenefitParticipation.redeemedAt. Si además se
      // contara CustomerRewardGoal.status=REDEEMED por separado, este mismo
      // canje aparecería dos veces.
      const goalCount = await prisma.customerRewardGoal.count({
        where: { businessId, status: RewardGoalStatus.REDEEMED },
      });
      expect(goalCount).toBe(1); // existe la fila...
      expect((await home.overview(businessId)).kpis.benefitsRedeemed).toBe(1); // ...pero se cuenta una sola vez
    });
  });

  // ── Actividad ───────────────────────────────────────────────────────────

  describe('actividad reciente', () => {
    it('usa eventos reales y los ordena de más reciente a más viejo', async () => {
      const businessId = await makeBusiness();
      const definition = await addProgram(businessId, 'Café gratis');
      const customer = await makeCustomer(businessId, 'Martina');
      await addVisit(businessId, customer.id, daysAgo(10));
      await addGoal(
        businessId,
        customer.id,
        definition.id,
        RewardGoalStatus.REDEEMED,
      );

      const { activity } = await home.overview(businessId);

      expect(activity.map((e) => e.kind)).toEqual([
        'canje',
        'desbloqueo',
        'visita',
      ]);
      const times = activity.map((e) => e.at.getTime());
      expect([...times].sort((a, b) => b - a)).toEqual(times);
      expect(activity[0].customer?.name).toBe('Martina');
    });

    it('sin actividad devuelve lista vacía', async () => {
      const businessId = await makeBusiness();
      expect((await home.overview(businessId)).activity).toEqual([]);
    });
  });

  // ── Checklist ───────────────────────────────────────────────────────────
  // Tareas de DESPUÉS del onboarding nuevo, no otro wizard: nunca pide
  // "activar sellos" ni "configurar automatizaciones" — esas ya se
  // resolvieron (o quedaron con su default) al terminar `/comenzar`.

  describe('checklist de puesta en marcha ("Primeros pasos")', () => {
    /** `setupTasks` ahora es parte de `overview()` — un solo round-trip. */
    async function taskIds(businessId: string) {
      const { setupTasks } = await home.overview(businessId);
      return setupTasks.map((t) => t.id);
    }

    it('un negocio recién creado (solo beneficios, sin sellos, sin clientes) pide Google, el primer beneficio y el primer cliente', async () => {
      const businessId = await makeBusiness();
      // El onboarding nuevo ya crea el QR principal en el paso 1.
      await prisma.visitSource.create({
        data: {
          businessId,
          name: 'Principal',
          token: randomUUID(),
          isDefault: true,
        },
      });

      // Cada tarea depende de SU propia señal, no de que las demás falten
      // (pedido explícito) — este negocio no tiene Google, ni beneficios, ni
      // clientes, así que las tres tareas correspondientes aparecen juntas.
      expect(await taskIds(businessId)).toEqual([
        'google',
        'beneficio',
        'primer-cliente',
      ]);
    });

    it('NUNCA pide activar sellos: un negocio "solo beneficios" no tiene esa tarea', async () => {
      const businessId = await makeBusiness({ google: 'https://g.page/x' });
      await prisma.visitSource.create({
        data: {
          businessId,
          name: 'Principal',
          token: randomUUID(),
          isDefault: true,
        },
      });
      await prisma.benefit.create({
        data: {
          businessId,
          title: '10% de descuento',
          type: BenefitType.discount,
          active: false,
        },
      });

      const pending = await taskIds(businessId);
      expect(pending).not.toContain('sellos');
      expect(pending).not.toContain('personalizar-tarjeta');
    });

    it('con sellos activos y diseño default: pide personalizar la tarjeta', async () => {
      const businessId = await makeBusiness({ google: 'https://g.page/x' });
      await addProgram(businessId, 'Café gratis');
      await prisma.visitSource.create({
        data: {
          businessId,
          name: 'Principal',
          token: randomUUID(),
          isDefault: true,
        },
      });

      expect(await taskIds(businessId)).toContain('personalizar-tarjeta');
    });

    it('con sellos activos y la tarjeta ya diseñada, NO pide personalizarla de nuevo', async () => {
      const businessId = await makeBusiness({ google: 'https://g.page/x' });
      await addProgram(businessId, 'Café gratis');
      await prisma.business.update({
        where: { id: businessId },
        data: { loyaltyCardColor: '#1A1040' },
      });
      await prisma.visitSource.create({
        data: {
          businessId,
          name: 'Principal',
          token: randomUUID(),
          isDefault: true,
        },
      });

      expect(await taskIds(businessId)).not.toContain('personalizar-tarjeta');
    });

    it('con al menos un beneficio creado, NO pide crear el primero (es opcional, no obligatorio)', async () => {
      const businessId = await makeBusiness({ google: 'https://g.page/x' });
      await prisma.visitSource.create({
        data: {
          businessId,
          name: 'Principal',
          token: randomUUID(),
          isDefault: true,
        },
      });
      await prisma.benefit.create({
        data: {
          businessId,
          title: '10% de descuento',
          type: BenefitType.discount,
          active: false,
        },
      });

      expect(await taskIds(businessId)).not.toContain('beneficio');
    });

    it('la tarea de crear un beneficio queda marcada `optional: true`', async () => {
      const businessId = await makeBusiness({ google: 'https://g.page/x' });
      await prisma.visitSource.create({
        data: {
          businessId,
          name: 'Principal',
          token: randomUUID(),
          isDefault: true,
        },
      });

      const { setupTasks } = await home.overview(businessId);
      const beneficio = setupTasks.find((t) => t.id === 'beneficio');
      expect(beneficio?.optional).toBe(true);
    });

    /**
     * §F — un beneficio autorizado sin límite mensual configurado SÍ es una
     * tarea pendiente real (bloqueante para ese beneficio, no opcional como
     * "creá tu primer beneficio"). Reusa la conclusión de
     * NotificationsService — el checklist no reevalúa la regla de
     * presupuesto por su cuenta.
     */
    it('beneficio autorizado sin límite mensual: pide definir el límite', async () => {
      const businessId = await makeBusiness({ google: 'https://g.page/x' });
      await prisma.visitSource.create({
        data: {
          businessId,
          name: 'Principal',
          token: randomUUID(),
          isDefault: true,
        },
      });
      const benefit = await prisma.benefit.create({
        data: {
          businessId,
          title: 'Café gratis',
          type: BenefitType.gift,
          active: false,
        },
      });
      const definition = await prisma.retentionIncentiveDefinition.create({
        data: {
          businessId,
          benefitId: benefit.id,
          name: 'Café gratis',
          type: BenefitType.gift,
          active: true,
        },
      });
      await prisma.retentionIncentiveDefinition.update({
        where: { id: definition.id },
        data: { automationEligible: true },
      });

      expect(await taskIds(businessId)).toContain('limite-beneficios');
    });

    it('con el límite mensual configurado, NO pide definirlo', async () => {
      const businessId = await makeBusiness({ google: 'https://g.page/x' });
      await prisma.visitSource.create({
        data: {
          businessId,
          name: 'Principal',
          token: randomUUID(),
          isDefault: true,
        },
      });
      const benefit = await prisma.benefit.create({
        data: {
          businessId,
          title: 'Café gratis',
          type: BenefitType.gift,
          active: false,
        },
      });
      await prisma.retentionIncentiveDefinition.create({
        data: {
          businessId,
          benefitId: benefit.id,
          name: 'Café gratis',
          type: BenefitType.gift,
          active: true,
          automationEligible: true,
        },
      });
      await prisma.retentionSettings.upsert({
        where: { businessId },
        create: { businessId, maxAutomatedIncentivesPerMonth: 10 },
        update: { maxAutomatedIncentivesPerMonth: 10 },
      });

      expect(await taskIds(businessId)).not.toContain('limite-beneficios');
    });

    /**
     * Lo importante del checklist es que se vaya. Un bloque "Primeros pasos"
     * eterno le recuerda al dueño cosas opcionales como si fueran errores.
     */
    it('DESAPARECE (lista vacía) cuando no queda nada relevante pendiente', async () => {
      const businessId = await makeBusiness({ google: 'https://g.page/x' });
      await addProgram(businessId, 'Café gratis');
      await prisma.business.update({
        where: { id: businessId },
        data: { loyaltyCardColor: '#1A1040' },
      });
      await prisma.benefit.create({
        data: {
          businessId,
          title: '10% de descuento',
          type: BenefitType.discount,
          active: false,
        },
      });
      await prisma.visitSource.create({
        data: {
          businessId,
          name: 'Principal',
          token: randomUUID(),
          isDefault: true,
        },
      });
      const customer = await makeCustomer(businessId, 'Ana');
      await prisma.customerEvent.create({
        data: {
          businessId,
          customerId: customer.id,
          type: 'customer_registered',
        },
      });

      expect(await taskIds(businessId)).toEqual([]);
    });

    /**
     * Caso de borde real, no el flujo normal: el onboarding ya crea el QR
     * principal en el paso 1, así que esto solo pasa si la fuente activa se
     * borró después. Ahí sí es bloqueante — el check-in no puede funcionar.
     */
    it('sin ninguna fuente QR/NFC activa, lo marca pendiente', async () => {
      const businessId = await makeBusiness({ google: 'https://g.page/x' });
      await addProgram(businessId, 'Café gratis');
      await prisma.business.update({
        where: { id: businessId },
        data: { loyaltyCardColor: '#1A1040' },
      });
      await prisma.benefit.create({
        data: {
          businessId,
          title: '10% de descuento',
          type: BenefitType.discount,
          active: false,
        },
      });

      expect(await taskIds(businessId)).toEqual(['qr']);
    });

    it('Google pendiente aparece como tarea y como estado', async () => {
      const businessId = await makeBusiness({ google: null });

      expect(await taskIds(businessId)).toContain('google');
      expect((await home.overview(businessId)).reviews.connected).toBe(false);
    });

    it('0 clientes (con fuente de check-in activa): pide conseguir el primer cliente', async () => {
      const businessId = await makeBusiness({ google: 'https://g.page/x' });
      await addProgram(businessId, 'Café gratis');
      await prisma.business.update({
        where: { id: businessId },
        data: { loyaltyCardColor: '#1A1040' },
      });
      await prisma.benefit.create({
        data: {
          businessId,
          title: '10% de descuento',
          type: BenefitType.discount,
          active: false,
        },
      });
      await prisma.visitSource.create({
        data: {
          businessId,
          name: 'Principal',
          token: randomUUID(),
          isDefault: true,
        },
      });

      expect(await taskIds(businessId)).toEqual(['primer-cliente']);
    });

    it('nunca pide "Descargá tu QR": no existe ninguna señal real de si ya se descargó', async () => {
      const businessId = await makeBusiness({ google: 'https://g.page/x' });
      await prisma.visitSource.create({
        data: {
          businessId,
          name: 'Principal',
          token: randomUUID(),
          isDefault: true,
        },
      });

      const ids = await taskIds(businessId);
      expect(ids.every((id) => !id.toLowerCase().includes('descarg'))).toBe(
        true,
      );
    });
  });

  // ── Alerta superior: tarjeta digital no configurada ────────────────────
  // Fiddelik-style banner, mismo criterio que "Personalizá tu tarjeta" en
  // Primeros pasos (misma señal, dos lugares en la UI a propósito).

  describe('setupAlert — tarjeta digital no configurada', () => {
    it('sellos ON + diseño default → alerta presente, con el href correcto', async () => {
      const businessId = await makeBusiness();
      await addProgram(businessId, 'Café gratis');

      const { setupAlert } = await home.overview(businessId);
      expect(setupAlert).toEqual({
        type: 'digital_card_not_configured',
        title: 'Tarjeta digital no configurada',
        description:
          'Terminá de personalizar tu tarjeta para que tus clientes la vean correctamente.',
        href: '/dashboard/programa?tab=configuracion&section=diseno',
      });
    });

    it('sellos ON + diseño personalizado → sin alerta', async () => {
      const businessId = await makeBusiness();
      await addProgram(businessId, 'Café gratis');
      await prisma.business.update({
        where: { id: businessId },
        data: { loyaltyCardColor: '#1A1040' },
      });

      expect((await home.overview(businessId)).setupAlert).toBeNull();
    });

    it('sellos OFF → sin alerta, sin importar el diseño', async () => {
      const businessId = await makeBusiness();
      await prisma.benefit.create({
        data: {
          businessId,
          title: '10% de descuento',
          type: BenefitType.discount,
          active: false,
        },
      });

      expect((await home.overview(businessId)).setupAlert).toBeNull();
    });

    it('nunca menciona Apple Wallet ni Google Wallet — Flikker no los ofrece', async () => {
      const businessId = await makeBusiness();
      await addProgram(businessId, 'Café gratis');

      const { setupAlert } = await home.overview(businessId);
      const text = `${setupAlert?.title} ${setupAlert?.description}`.toLowerCase();
      expect(text).not.toContain('wallet');
    });
  });

  // ── Tenancy ─────────────────────────────────────────────────────────────

  it('un negocio no ve la actividad ni los números de otro', async () => {
    const negocioA = await makeBusiness();
    const negocioB = await makeBusiness();
    const customerB = await makeCustomer(negocioB, 'Cliente de B');
    await addVisit(negocioB, customerB.id, daysAgo(1));

    const inicio = await home.overview(negocioA);

    expect(inicio.activity).toEqual([]);
    expect(inicio.kpis.activeCustomers).toBe(0);
    expect(JSON.stringify(inicio)).not.toContain('Cliente de B');
  });
});
