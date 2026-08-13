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
import { ReviewsOverviewService } from '../reviews/reviews-overview.service';
import { HomeService } from './home.service';

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
  let loyalty: CustomerLoyaltyService;
  let reviews: ReviewsOverviewService;

  const businesses: string[] = [];
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        CustomerLoyaltyRepository,
        CustomerLoyaltyService,
        ReviewsOverviewService,
        NotificationsService,
        HomeService,
        {
          provide: RetentionResultsOverviewService,
          useValue: { forBusiness: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    home = moduleRef.get(HomeService);
    loyalty = moduleRef.get(CustomerLoyaltyService);
    reviews = moduleRef.get(ReviewsOverviewService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    for (const id of businesses.splice(0)) {
      await prisma.rewardGoalBonusStamp.deleteMany({
        where: { businessId: id },
      });
      await prisma.checkinFeedback.deleteMany({ where: { businessId: id } });
      await prisma.customerEvent.deleteMany({ where: { businessId: id } });
      await prisma.googleReview.deleteMany({ where: { businessId: id } });
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
        },
        update: {
          progressReminderEnabled: true,
          automaticCampaignsEnabled: false,
        },
      });
      await prisma.business.update({
        where: { id: businessId },
        data: { retentionEngineV2Enabled: true },
      });

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
  });

  // ── Programa ────────────────────────────────────────────────────────────

  describe('programa', () => {
    it('muestra sellos, recompensa y el estado agregado', async () => {
      const businessId = await makeBusiness();
      const definition = await addProgram(businessId, '3 medialunas gratis');
      const a = await makeCustomer(businessId, 'Ana');
      const b = await makeCustomer(businessId, 'Beto');
      await addGoal(businessId, a.id, definition.id, RewardGoalStatus.ACTIVE);
      await addGoal(businessId, b.id, definition.id, RewardGoalStatus.UNLOCKED);

      const inicio = await home.overview(businessId);

      expect(inicio.program).toMatchObject({
        stampsRequired: 5,
        rewardName: '3 medialunas gratis',
        participating: 1,
        available: 1,
      });
    });

    it('sin programa configurado devuelve null en vez de inventar uno', async () => {
      const businessId = await makeBusiness();
      expect((await home.overview(businessId)).program).toBeNull();
    });

    it('cuenta las recompensas canjeadas del período', async () => {
      const businessId = await makeBusiness();
      const definition = await addProgram(businessId, 'Café gratis');
      const customer = await makeCustomer(businessId, 'Ana');
      await addGoal(
        businessId,
        customer.id,
        definition.id,
        RewardGoalStatus.REDEEMED,
      );

      expect((await home.overview(businessId)).kpis.rewardsRedeemed).toBe(1);
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
        'sello',
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

  describe('checklist de puesta en marcha', () => {
    it('un negocio recién creado tiene todo pendiente', async () => {
      const businessId = await makeBusiness();

      expect(await home.setupTasks(businessId)).toEqual([
        'programa',
        'qr',
        'google',
        'automatizaciones',
      ]);
    });

    /**
     * Lo importante del checklist es que se vaya. Un bloque "Primeros pasos"
     * eterno le recuerda al dueño cosas opcionales como si fueran errores.
     */
    it('DESAPARECE cuando no queda nada relevante pendiente', async () => {
      const businessId = await makeBusiness({ google: 'https://g.page/x' });
      await addProgram(businessId, 'Café gratis');
      await prisma.retentionSettings.update({
        where: { businessId },
        data: { progressReminderEnabled: true },
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

      expect(await home.setupTasks(businessId)).toEqual([]);
    });

    it('el soporte físico QR+NFC no bloquea la configuración completa', async () => {
      const businessId = await makeBusiness({ google: 'https://g.page/x' });
      await addProgram(businessId, 'Café gratis');
      await prisma.retentionSettings.update({
        where: { businessId },
        data: { automaticCampaignsEnabled: true },
      });
      await prisma.visitSource.create({
        data: {
          businessId,
          name: 'Principal',
          token: randomUUID(),
          isDefault: true,
        },
      });

      // Nunca pidió el soporte físico, y aun así lo único pendiente es el
      // primer cliente — que no depende de él.
      expect(await home.setupTasks(businessId)).toEqual(['primer-cliente']);
    });

    it('Google pendiente aparece como tarea y como estado', async () => {
      const businessId = await makeBusiness({ google: null });

      expect(await home.setupTasks(businessId)).toContain('google');
      expect((await home.overview(businessId)).reviews.connected).toBe(false);
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
