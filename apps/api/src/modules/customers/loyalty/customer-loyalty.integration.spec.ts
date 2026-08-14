import { randomUUID } from 'crypto';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BenefitType,
  BusinessStatus,
  CustomerSegment,
  ExperienceVersion,
  MembershipRole,
  RewardGoalStatus,
  VisitVerificationType,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CustomerLoyaltyRepository } from './customer-loyalty.repository';
import { CustomerLoyaltyService } from './customer-loyalty.service';
import { CustomerOverviewService } from './customer-overview.service';

/**
 * Clientes + detalle, contra DB real.
 *
 * Dos cosas se prueban acá y en ningún otro lado: que visitas y sellos no se
 * mezclen nunca (el bonus por feedback suma sello y NO visita), y que un
 * negocio no pueda ver la relación de otro con el mismo cliente.
 */
describe('Clientes — fidelización (integration)', () => {
  let prisma: PrismaService;
  let loyalty: CustomerLoyaltyService;
  let overviewService: CustomerOverviewService;

  const NOW = new Date('2026-08-12T15:00:00.000Z');
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

  const businesses: string[] = [];

  /** Atajo del detalle con el instante fijo del test. */
  const overview = (
    businessId: string,
    customerId: string,
    role?: MembershipRole,
  ) => overviewService.overview(businessId, customerId, role, NOW);

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        CustomerLoyaltyRepository,
        CustomerLoyaltyService,
        CustomerOverviewService,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    loyalty = moduleRef.get(CustomerLoyaltyService);
    overviewService = moduleRef.get(CustomerOverviewService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    for (const id of businesses.splice(0)) {
      await prisma.message.deleteMany({ where: { businessId: id } });
      await prisma.retentionOutcome.deleteMany({ where: { businessId: id } });
      await prisma.retentionAssignment.deleteMany({
        where: { businessId: id },
      });
      await prisma.retentionVariant.deleteMany({ where: { businessId: id } });
      await prisma.retentionExperiment.deleteMany({
        where: { businessId: id },
      });
      await prisma.customerEvent.deleteMany({ where: { businessId: id } });
      await prisma.rewardGoalBonusStamp.deleteMany({
        where: { businessId: id },
      });
      await prisma.checkinFeedback.deleteMany({ where: { businessId: id } });
      await prisma.customerRewardGoal.deleteMany({ where: { businessId: id } });
      await prisma.visit.deleteMany({ where: { businessId: id } });
      await prisma.benefitParticipation.deleteMany({
        where: { businessId: id },
      });
      await prisma.retentionIncentiveDefinition.deleteMany({
        where: { businessId: id },
      });
      await prisma.benefit.deleteMany({ where: { businessId: id } });
      await prisma.customer.deleteMany({ where: { businessId: id } });
      await prisma.business.delete({ where: { id } }).catch(() => undefined);
    }
  });

  // ── Fixtures ────────────────────────────────────────────────────────────

  async function makeBusiness() {
    const business = await prisma.business.create({
      data: {
        id: randomUUID(),
        name: 'Café Fidelidad',
        slug: `fid-${randomUUID().slice(0, 8)}`,
        status: BusinessStatus.ACTIVE,
        country: 'UY',
        currency: 'UYU',
        timezone: 'America/Montevideo',
        experienceVersion: ExperienceVersion.CHECKIN_V2,
      },
    });
    businesses.push(business.id);
    return business.id;
  }

  async function makeCustomer(
    businessId: string,
    name: string,
    createdAt = daysAgo(90),
  ) {
    return prisma.customer.create({
      data: {
        id: randomUUID(),
        businessId,
        name,
        phoneE164: `+5989${String(Math.random()).slice(2, 9)}`,
        createdAt,
      },
    });
  }

  async function addVisit(
    businessId: string,
    customerId: string,
    occurredAt: Date,
  ) {
    return prisma.visit.create({
      data: {
        id: randomUUID(),
        businessId,
        customerId,
        occurredAt,
        visitDayKey: occurredAt.toISOString().slice(0, 10),
        verificationType: VisitVerificationType.persistent_session,
      },
    });
  }

  /** Crea la definición de recompensa y una tarjeta del cliente. */
  async function addGoal(
    businessId: string,
    customerId: string,
    options: {
      rewardName: string;
      target: number;
      activatedAt: Date;
      status?: RewardGoalStatus;
      unlockedAt?: Date;
      redeemedAt?: Date;
    },
  ) {
    const benefit = await prisma.benefit.create({
      data: {
        businessId,
        title: options.rewardName,
        type: BenefitType.gift,
        active: false,
      },
    });
    const definition = await prisma.retentionIncentiveDefinition.create({
      data: {
        businessId,
        benefitId: benefit.id,
        name: options.rewardName,
        type: BenefitType.gift,
        active: true,
        rewardGoalEligible: true,
      },
    });
    return prisma.customerRewardGoal.create({
      data: {
        id: randomUUID(),
        businessId,
        customerId,
        incentiveDefinitionId: definition.id,
        status: options.status ?? RewardGoalStatus.ACTIVE,
        startingVisitCount: 0,
        targetAdditionalVisits: options.target,
        activatedAt: options.activatedAt,
        createdAt: options.activatedAt,
        unlockedAt: options.unlockedAt ?? null,
        redeemedAt: options.redeemedAt ?? null,
        reasonCode: 'TEST',
        segmentAtCreation: CustomerSegment.NEW,
      },
    });
  }

  /** Feedback sobre una visita, con o sin el sello extra. */
  async function addFeedback(
    businessId: string,
    customerId: string,
    visitId: string,
    options: { score: number; comment?: string; goalId?: string; at: Date },
  ) {
    const feedback = await prisma.checkinFeedback.create({
      data: {
        id: randomUUID(),
        businessId,
        customerId,
        visitId,
        score: options.score,
        comment: options.comment ?? null,
        createdAt: options.at,
      },
    });
    if (options.goalId) {
      await prisma.rewardGoalBonusStamp.create({
        data: {
          id: randomUUID(),
          businessId,
          customerId,
          rewardGoalId: options.goalId,
          feedbackId: feedback.id,
          createdAt: options.at,
        },
      });
    }
    return feedback;
  }

  // ── Visitas vs sellos ───────────────────────────────────────────────────

  describe('visitas y sellos son cosas distintas', () => {
    it('el bonus por feedback suma UN SELLO y NO suma una visita', async () => {
      const businessId = await makeBusiness();
      const customer = await makeCustomer(businessId, 'Ana');
      const goal = await addGoal(businessId, customer.id, {
        rewardName: 'Café gratis',
        target: 5,
        activatedAt: daysAgo(30),
      });

      // Tres visitas reales.
      await addVisit(businessId, customer.id, daysAgo(20));
      await addVisit(businessId, customer.id, daysAgo(10));
      const last = await addVisit(businessId, customer.id, daysAgo(2));
      // Y feedback en la última, que da el sello extra.
      await addFeedback(businessId, customer.id, last.id, {
        score: 5,
        comment: 'Muy rico todo',
        goalId: goal.id,
        at: daysAgo(2),
      });

      const list = await loyalty.list(businessId, {}, NOW);
      const row = list.data[0];

      // 3 visitas, 4 sellos. Los dos números conviven y ninguno "corrige" al otro.
      expect(row.visitCount).toBe(3);
      expect(row.card?.progressVisits).toBe(4);
      expect(row.card?.targetAdditionalVisits).toBe(5);
      expect(row.card?.remainingVisits).toBe(1);

      const detail = await overview(businessId, customer.id);
      expect(detail.summary.visitCount).toBe(3);
      expect(detail.currentCard?.progressVisits).toBe(4);
      expect(detail.currentCard?.visitProgress).toBe(3);
      expect(detail.currentCard?.bonusStamps).toBe(1);
    });

    it('lista y detalle nunca muestran progresos distintos del mismo cliente', async () => {
      const businessId = await makeBusiness();
      const customer = await makeCustomer(businessId, 'Beto');
      const goal = await addGoal(businessId, customer.id, {
        rewardName: 'Postre',
        target: 6,
        activatedAt: daysAgo(40),
      });
      await addVisit(businessId, customer.id, daysAgo(30));
      const v = await addVisit(businessId, customer.id, daysAgo(5));
      await addFeedback(businessId, customer.id, v.id, {
        score: 4,
        goalId: goal.id,
        at: daysAgo(5),
      });

      const list = await loyalty.list(businessId, {}, NOW);
      const detail = await overview(businessId, customer.id);

      expect(list.data[0].card?.progressVisits).toBe(
        detail.currentCard?.progressVisits,
      );
      expect(list.data[0].visitCount).toBe(detail.summary.visitCount);
    });
  });

  // ── Estados de la recompensa ────────────────────────────────────────────

  describe('estados de la recompensa', () => {
    it('desbloqueada y sin canjear aparece como recompensa disponible', async () => {
      const businessId = await makeBusiness();
      const customer = await makeCustomer(businessId, 'Caro');
      await addGoal(businessId, customer.id, {
        rewardName: '3 medialunas gratis',
        target: 5,
        activatedAt: daysAgo(40),
        status: RewardGoalStatus.UNLOCKED,
        unlockedAt: daysAgo(3),
      });
      await addVisit(businessId, customer.id, daysAgo(4));

      const list = await loyalty.list(businessId, {}, NOW);
      expect(list.data[0].rewardAvailable?.rewardName).toBe(
        '3 medialunas gratis',
      );
      expect(list.kpis.conRecompensa).toBe(1);

      const detail = await overview(businessId, customer.id);
      expect(detail.currentCard?.state).toBe('disponible');
    });

    it('canjeada sale de "activa" y queda en el historial', async () => {
      const businessId = await makeBusiness();
      const customer = await makeCustomer(businessId, 'Dani');
      await addGoal(businessId, customer.id, {
        rewardName: 'Café gratis',
        target: 3,
        activatedAt: daysAgo(60),
        status: RewardGoalStatus.REDEEMED,
        unlockedAt: daysAgo(20),
        redeemedAt: daysAgo(19),
      });

      const detail = await overview(businessId, customer.id);

      expect(detail.currentCard).toBeNull();
      expect(detail.history).toHaveLength(1);
      expect(detail.history[0].status).toBe(RewardGoalStatus.REDEEMED);
      expect(detail.summary.rewardsRedeemed).toBe(1);
    });

    /**
     * Una tarjeta vieja NO se resetea visualmente cuando arranca la siguiente:
     * cada ciclo conserva sus propios sellos.
     */
    it('el historial conserva cada tarjeta anterior como ciclo separado', async () => {
      const businessId = await makeBusiness();
      const customer = await makeCustomer(businessId, 'Eli');

      // Ciclo 1: cerrado y canjeado, con 3 visitas dentro de su ventana.
      await addGoal(businessId, customer.id, {
        rewardName: 'Café gratis',
        target: 3,
        activatedAt: daysAgo(60),
        status: RewardGoalStatus.REDEEMED,
        unlockedAt: daysAgo(40),
        redeemedAt: daysAgo(39),
      });
      await addVisit(businessId, customer.id, daysAgo(55));
      await addVisit(businessId, customer.id, daysAgo(50));
      await addVisit(businessId, customer.id, daysAgo(45));

      // Ciclo 2: en curso, con 1 visita.
      await addGoal(businessId, customer.id, {
        rewardName: 'Postre gratis',
        target: 5,
        activatedAt: daysAgo(30),
      });
      await addVisit(businessId, customer.id, daysAgo(10));

      const detail = await overview(businessId, customer.id);

      expect(detail.currentCard?.rewardName).toBe('Postre gratis');
      expect(detail.currentCard?.progressVisits).toBe(1);

      expect(detail.history).toHaveLength(1);
      expect(detail.history[0].rewardName).toBe('Café gratis');
      // Las 3 visitas del ciclo viejo siguen contadas en el ciclo viejo.
      expect(detail.history[0].progressVisits).toBe(3);
      expect(detail.history[0].targetAdditionalVisits).toBe(3);

      // Y las visitas totales son la suma real: 4.
      expect(detail.summary.visitCount).toBe(4);
    });
  });

  // ── Timeline ────────────────────────────────────────────────────────────

  describe('timeline', () => {
    it('mezcla las fuentes reales, ordenada de más reciente a más vieja', async () => {
      const businessId = await makeBusiness();
      const customer = await makeCustomer(businessId, 'Fer', daysAgo(30));
      const goal = await addGoal(businessId, customer.id, {
        rewardName: 'Café gratis',
        target: 3,
        activatedAt: daysAgo(28),
        status: RewardGoalStatus.REDEEMED,
        unlockedAt: daysAgo(5),
        redeemedAt: daysAgo(4),
      });
      await addVisit(businessId, customer.id, daysAgo(20));
      const v = await addVisit(businessId, customer.id, daysAgo(10));
      await addFeedback(businessId, customer.id, v.id, {
        score: 5,
        goalId: goal.id,
        at: daysAgo(10),
      });

      const { timeline } = await overview(businessId, customer.id);

      const times = timeline.map((e) => e.at.getTime());
      expect([...times].sort((a, b) => b - a)).toEqual(times);

      expect(timeline.map((e) => e.kind)).toEqual([
        'canje',
        'desbloqueo',
        'feedback',
        'visita',
        'visita',
        'registro',
      ]);

      // El sello extra se atribuye al feedback, no a una visita inventada.
      const feedbackEvent = timeline.find((e) => e.kind === 'feedback');
      expect(feedbackEvent?.stamp).toBe('bonus');
      expect(timeline.filter((e) => e.kind === 'visita')).toHaveLength(2);
    });

    it('una visita fuera de toda tarjeta no dice que sumó sello', async () => {
      const businessId = await makeBusiness();
      const customer = await makeCustomer(businessId, 'Gus', daysAgo(40));
      // Visita ANTES de que existiera la tarjeta.
      await addVisit(businessId, customer.id, daysAgo(35));
      await addGoal(businessId, customer.id, {
        rewardName: 'Café gratis',
        target: 3,
        activatedAt: daysAgo(30),
      });
      await addVisit(businessId, customer.id, daysAgo(10));

      const { timeline } = await overview(businessId, customer.id);
      const visitas = timeline.filter((e) => e.kind === 'visita');

      expect(visitas).toHaveLength(2);
      expect(visitas[0].stamp).toBe('visita'); // la de hace 10 días
      expect(visitas[1].stamp).toBeNull(); // la anterior a la tarjeta
    });
  });

  // ── Escaneo, beneficios directos y reactivación ────────────────────────
  // Rediseño de /dashboard/customers (pedido explícito): un scan de un
  // cliente YA identificado es un evento real, distinto de una visita; los
  // beneficios pueden existir sin ninguna tarjeta de sellos; y "volvió
  // después de una reactivación" es un evento real, no inventado.

  describe('escaneo, beneficios directos y reactivación', () => {
    it('escaneo (sesión restaurada) es un evento propio, distinto de una visita', async () => {
      const businessId = await makeBusiness();
      const customer = await makeCustomer(businessId, 'Lu', daysAgo(10));
      // Escaneó de nuevo pero NO generó una visita nueva (deduplicada).
      await prisma.customerEvent.create({
        data: {
          businessId,
          customerId: customer.id,
          type: 'customer_session_restored',
          createdAt: daysAgo(2),
        },
      });

      const { timeline, summary } = await overview(businessId, customer.id);

      expect(timeline.map((e) => e.kind)).toEqual(['escaneo', 'registro']);
      // El escaneo NUNCA cuenta como visita.
      expect(summary.visitCount).toBe(0);
    });

    it('beneficio directo (sin tarjeta): ofrecido y canjeado quedan en la timeline y en "beneficios"', async () => {
      const businessId = await makeBusiness();
      const customer = await makeCustomer(businessId, 'Mati', daysAgo(15));
      const benefit = await prisma.benefit.create({
        data: {
          businessId,
          title: 'Café de bienvenida',
          type: BenefitType.gift,
          active: false,
        },
      });
      await prisma.benefitParticipation.create({
        data: {
          businessId,
          benefitId: benefit.id,
          customerId: customer.id,
          benefitTitleSnapshot: 'Café de bienvenida',
          redemptionCode: 'ABCD1234',
          createdAt: daysAgo(14),
          redeemedAt: daysAgo(13),
        },
      });

      const detail = await overview(businessId, customer.id);

      // Sin tarjeta de sellos — el beneficio existe igual.
      expect(detail.currentCard).toBeNull();
      expect(detail.benefits).toEqual([
        expect.objectContaining({
          title: 'Café de bienvenida',
          redeemedAt: daysAgo(13),
        }),
      ]);
      expect(detail.timeline.map((e) => e.kind)).toEqual([
        'beneficio_canjeado',
        'beneficio_ofrecido',
        'registro',
      ]);
    });

    it('el título del beneficio en la timeline es el prometido, no el actual del catálogo', async () => {
      const businessId = await makeBusiness();
      const customer = await makeCustomer(businessId, 'Nadia', daysAgo(15));
      const benefit = await prisma.benefit.create({
        data: {
          businessId,
          title: 'Nombre nuevo',
          type: BenefitType.gift,
          active: false,
        },
      });
      await prisma.benefitParticipation.create({
        data: {
          businessId,
          benefitId: benefit.id,
          customerId: customer.id,
          benefitTitleSnapshot: 'Nombre original',
          createdAt: daysAgo(14),
        },
      });

      const detail = await overview(businessId, customer.id);
      expect(detail.benefits[0].title).toBe('Nombre original');
    });

    it('reactivación exitosa: aparece como evento, y NUNCA si el motor solo observó (CONTROL)', async () => {
      const businessId = await makeBusiness();
      const customer = await makeCustomer(businessId, 'Oto', daysAgo(60));
      const definition = await prisma.retentionIncentiveDefinition.create({
        data: {
          businessId,
          name: 'Reactivación',
          type: BenefitType.gift,
          active: true,
        },
      });
      const experiment = await prisma.retentionExperiment.create({
        data: {
          businessId,
          name: 'Reactivar ausentes',
          objective: 'AT_RISK_RECOVERY',
        },
      });
      const variant = await prisma.retentionVariant.create({
        data: {
          businessId,
          experimentId: experiment.id,
          name: 'Mensaje',
          strategyType: 'REMINDER',
          incentiveDefinitionId: definition.id,
          allocationPercent: 100,
        },
      });

      const sentAssignment = await prisma.retentionAssignment.create({
        data: {
          businessId,
          experimentId: experiment.id,
          variantId: variant.id,
          customerId: customer.id,
          segmentAtAssignment: 'AT_RISK',
          visitCountAtAssignment: 5,
          daysSinceLastVisit: 40,
          status: 'SENT',
        },
      });
      await prisma.retentionOutcome.create({
        data: {
          businessId,
          experimentId: experiment.id,
          variantId: variant.id,
          assignmentId: sentAssignment.id,
          customerId: customer.id,
          returned: true,
          returnedAt: daysAgo(5),
          observedWithinWindow: true,
        },
      });

      // Un segundo cliente, en CONTROL (nunca se le mandó nada): "volvió"
      // igual, pero no hay ninguna reactivación que atribuirle.
      const control = await makeCustomer(businessId, 'Control', daysAgo(60));
      const controlAssignment = await prisma.retentionAssignment.create({
        data: {
          businessId,
          experimentId: experiment.id,
          variantId: variant.id,
          customerId: control.id,
          segmentAtAssignment: 'AT_RISK',
          visitCountAtAssignment: 5,
          daysSinceLastVisit: 40,
          status: 'OBSERVING',
        },
      });
      await prisma.retentionOutcome.create({
        data: {
          businessId,
          experimentId: experiment.id,
          variantId: variant.id,
          assignmentId: controlAssignment.id,
          customerId: control.id,
          returned: true,
          returnedAt: daysAgo(5),
          observedWithinWindow: true,
        },
      });

      const detail = await overview(businessId, customer.id);
      expect(detail.timeline.map((e) => e.kind)).toContain('reactivacion');

      const controlDetail = await overview(businessId, control.id);
      expect(controlDetail.timeline.map((e) => e.kind)).not.toContain(
        'reactivacion',
      );
    });

    it('mensaje enviado aparece en la timeline y en notificaciones', async () => {
      const businessId = await makeBusiness();
      const customer = await makeCustomer(businessId, 'Pau', daysAgo(20));
      await prisma.message.create({
        data: {
          businessId,
          customerId: customer.id,
          channel: 'whatsapp',
          trackingToken: randomUUID(),
          status: 'sent',
          sentAt: daysAgo(10),
        },
      });

      const detail = await overview(businessId, customer.id);

      expect(detail.timeline.map((e) => e.kind)).toContain('mensaje');
      expect(detail.notifications).toHaveLength(1);
    });
  });

  // ── Casos vacíos ────────────────────────────────────────────────────────

  describe('clientes sin historial', () => {
    it('cliente sin tarjeta: no explota y no inventa una', async () => {
      const businessId = await makeBusiness();
      const customer = await makeCustomer(businessId, 'Hugo');
      await addVisit(businessId, customer.id, daysAgo(1));

      const detail = await overview(businessId, customer.id);

      expect(detail.currentCard).toBeNull();
      expect(detail.history).toEqual([]);
      expect(detail.summary.visitCount).toBe(1);
    });

    it('cliente sin feedback devuelve lista vacía, no un comentario inventado', async () => {
      const businessId = await makeBusiness();
      const customer = await makeCustomer(businessId, 'Ivo');

      const detail = await overview(businessId, customer.id);

      expect(detail.feedback).toEqual([]);
      expect(detail.summary.feedbackCount).toBe(0);
    });

    it('feedback sin comentario conserva el puntaje y deja el texto en null', async () => {
      const businessId = await makeBusiness();
      const customer = await makeCustomer(businessId, 'Juli');
      const v = await addVisit(businessId, customer.id, daysAgo(3));
      await addFeedback(businessId, customer.id, v.id, {
        score: 4,
        at: daysAgo(3),
      });

      const detail = await overview(businessId, customer.id);

      expect(detail.feedback[0].score).toBe(4);
      expect(detail.feedback[0].comment).toBeNull();
      expect(detail.feedback[0].gaveBonusStamp).toBe(false);
    });

    it('sin historial suficiente no se afirma ninguna frecuencia', async () => {
      const businessId = await makeBusiness();
      const customer = await makeCustomer(businessId, 'Kari');
      await addVisit(businessId, customer.id, daysAgo(2));

      const detail = await overview(businessId, customer.id);
      expect(detail.summary.cadencePhrase).toBeNull();
    });
  });

  // ── Rediseño de /dashboard/customers: sellos opcionales, resumen ──────────
  // Benefits son independientes de la tarjeta desde el nuevo modelo de
  // Programa; un negocio con `rewardGoalsEnabled = false` nunca tuvo una
  // tarjeta y el resumen no debe inventar ninguna.

  describe('resumen con sellos desactivados y beneficios independientes', () => {
    it('negocio con sellos desactivados: sin tarjeta, sin historial, resumen sin inventar sellos', async () => {
      // `rewardGoalsEnabled` vive en RetentionSettings, no en Business, y su
      // default ya es `false` — un negocio nuevo arranca así. Se deja
      // explícito acá para no depender de un default que podría cambiar.
      const businessId = await makeBusiness();
      await prisma.retentionSettings.upsert({
        where: { businessId },
        create: { businessId, rewardGoalsEnabled: false },
        update: { rewardGoalsEnabled: false },
      });
      const customer = await makeCustomer(businessId, 'Rocío');
      await addVisit(businessId, customer.id, daysAgo(3));
      await addVisit(businessId, customer.id, daysAgo(1));

      const detail = await overview(businessId, customer.id);

      // Ni tarjeta activa ni historial: la sección de Sellos no tiene nada
      // que mostrar, y el resumen tampoco puede afirmar un "sellos actuales".
      expect(detail.currentCard).toBeNull();
      expect(detail.history).toEqual([]);
      // El resto del resumen sigue siendo real y útil.
      expect(detail.summary.visitCount).toBe(2);
      expect(detail.summary.benefitsReceived).toBe(0);
      expect(detail.summary.redemptionsCount).toBe(0);
    });

    it('beneficio recibido sin ninguna tarjeta: cuenta en "beneficios recibidos" y en "canjes" al canjearse', async () => {
      const businessId = await makeBusiness();
      const customer = await makeCustomer(businessId, 'Santi');
      const benefit = await prisma.benefit.create({
        data: {
          businessId,
          title: '10% de descuento',
          type: BenefitType.gift,
          active: false,
        },
      });
      await prisma.benefitParticipation.create({
        data: {
          businessId,
          benefitId: benefit.id,
          customerId: customer.id,
          benefitTitleSnapshot: '10% de descuento',
          createdAt: daysAgo(10),
          redeemedAt: null, // ofrecido, todavía sin canjear
        },
      });

      const offered = await overview(businessId, customer.id);
      expect(offered.summary.benefitsReceived).toBe(1);
      // Emitido ≠ canjeado: todavía no cuenta como canje.
      expect(offered.summary.redemptionsCount).toBe(0);

      await prisma.benefitParticipation.updateMany({
        where: { businessId, customerId: customer.id },
        data: { redeemedAt: daysAgo(2) },
      });

      const redeemed = await overview(businessId, customer.id);
      expect(redeemed.summary.benefitsReceived).toBe(1);
      expect(redeemed.summary.redemptionsCount).toBe(1);
    });

    it('"canjes" suma tarjeta + beneficio directo sin duplicar', async () => {
      const businessId = await makeBusiness();
      const customer = await makeCustomer(businessId, 'Vale');
      await addGoal(businessId, customer.id, {
        rewardName: 'Café gratis',
        target: 3,
        activatedAt: daysAgo(40),
        status: RewardGoalStatus.REDEEMED,
        unlockedAt: daysAgo(20),
        redeemedAt: daysAgo(19),
      });
      const benefit = await prisma.benefit.create({
        data: {
          businessId,
          title: 'Postre de bienvenida',
          type: BenefitType.gift,
          active: false,
        },
      });
      await prisma.benefitParticipation.create({
        data: {
          businessId,
          benefitId: benefit.id,
          customerId: customer.id,
          benefitTitleSnapshot: 'Postre de bienvenida',
          createdAt: daysAgo(15),
          redeemedAt: daysAgo(14),
        },
      });

      const detail = await overview(businessId, customer.id);

      expect(detail.summary.rewardsRedeemed).toBe(1); // solo tarjeta
      expect(detail.summary.benefitsReceived).toBe(1); // solo directo
      expect(detail.summary.redemptionsCount).toBe(2); // los dos, sin duplicar
    });
  });

  // ── Beneficio disponible en la lista ───────────────────────────────────

  describe('badge "Beneficio disponible" en la lista', () => {
    it('un beneficio directo sin canjear marca benefitAvailable en la fila', async () => {
      const businessId = await makeBusiness();
      const customer = await makeCustomer(businessId, 'Willy');
      const benefit = await prisma.benefit.create({
        data: {
          businessId,
          title: 'Postre gratis',
          type: BenefitType.gift,
          active: false,
        },
      });
      await prisma.benefitParticipation.create({
        data: {
          businessId,
          benefitId: benefit.id,
          customerId: customer.id,
          benefitTitleSnapshot: 'Postre gratis',
          createdAt: daysAgo(5),
        },
      });

      const list = await loyalty.list(businessId, {}, NOW);
      expect(list.data[0].benefitAvailable).toBe(true);
      expect(list.data[0].rewardAvailable).toBeNull();
    });

    it('canjeado deja de marcar benefitAvailable', async () => {
      const businessId = await makeBusiness();
      const customer = await makeCustomer(businessId, 'Xime');
      const benefit = await prisma.benefit.create({
        data: {
          businessId,
          title: 'Postre gratis',
          type: BenefitType.gift,
          active: false,
        },
      });
      await prisma.benefitParticipation.create({
        data: {
          businessId,
          benefitId: benefit.id,
          customerId: customer.id,
          benefitTitleSnapshot: 'Postre gratis',
          createdAt: daysAgo(5),
          redeemedAt: daysAgo(1),
        },
      });

      const list = await loyalty.list(businessId, {}, NOW);
      expect(list.data[0].benefitAvailable).toBe(false);
    });

    it('sin ningún beneficio ni recompensa, ningún badge', async () => {
      const businessId = await makeBusiness();
      await makeCustomer(businessId, 'Yago');

      const list = await loyalty.list(businessId, {}, NOW);
      expect(list.data[0].benefitAvailable).toBe(false);
      expect(list.data[0].rewardAvailable).toBeNull();
    });
  });

  // ── Filtros y búsqueda ──────────────────────────────────────────────────

  describe('filtros y búsqueda', () => {
    async function seedMixed() {
      const businessId = await makeBusiness();

      const nuevo = await makeCustomer(businessId, 'Nico Nuevo', daysAgo(3));
      await addVisit(businessId, nuevo.id, daysAgo(2));

      const repite = await makeCustomer(businessId, 'Rita Repite', daysAgo(60));
      await addVisit(businessId, repite.id, daysAgo(20));
      await addVisit(businessId, repite.id, daysAgo(10));
      await addVisit(businessId, repite.id, daysAgo(3));

      const cerca = await makeCustomer(businessId, 'Ceci Cerca', daysAgo(60));
      await addGoal(businessId, cerca.id, {
        rewardName: 'Café gratis',
        target: 3,
        activatedAt: daysAgo(50),
      });
      await addVisit(businessId, cerca.id, daysAgo(20));
      await addVisit(businessId, cerca.id, daysAgo(4));

      const premiado = await makeCustomer(
        businessId,
        'Pepe Premio',
        daysAgo(60),
      );
      await addGoal(businessId, premiado.id, {
        rewardName: 'Postre',
        target: 3,
        activatedAt: daysAgo(50),
        status: RewardGoalStatus.UNLOCKED,
        unlockedAt: daysAgo(2),
      });
      await addVisit(businessId, premiado.id, daysAgo(3));

      const ausente = await makeCustomer(
        businessId,
        'Ali Ausente',
        daysAgo(300),
      );
      await addVisit(businessId, ausente.id, daysAgo(250));

      return { businessId, nuevo, repite, cerca, premiado, ausente };
    }

    it('cada filtro devuelve exactamente a quien corresponde', async () => {
      const { businessId, nuevo, repite, cerca, premiado, ausente } =
        await seedMixed();

      const names = async (filter: Parameters<typeof loyalty.list>[1]) =>
        (await loyalty.list(businessId, filter, NOW)).data.map((r) => r.id);

      expect(await names({ filter: 'todos' })).toHaveLength(5);
      expect(await names({ filter: 'nuevos' })).toContain(nuevo.id);
      expect(await names({ filter: 'nuevos' })).not.toContain(repite.id);

      const volvieron = await names({ filter: 'volvieron' });
      expect(volvieron).toContain(repite.id);
      expect(volvieron).toContain(cerca.id);
      expect(volvieron).not.toContain(nuevo.id);

      // Ceci tiene 2 de 3 sellos: le falta 1.
      expect(await names({ filter: 'cerca' })).toEqual([cerca.id]);
      expect(await names({ filter: 'recompensa' })).toEqual([premiado.id]);
      expect(await names({ filter: 'ausentes' })).toContain(ausente.id);
    });

    it('"cerca de completar" excluye a quien ya la completó', async () => {
      const { businessId, premiado } = await seedMixed();
      const cercaIds = (
        await loyalty.list(businessId, { filter: 'cerca' }, NOW)
      ).data.map((r) => r.id);

      expect(cercaIds).not.toContain(premiado.id);
    });

    it('busca por nombre y por teléfono', async () => {
      const businessId = await makeBusiness();
      const ana = await prisma.customer.create({
        data: {
          id: randomUUID(),
          businessId,
          name: 'Ana Gómez',
          phoneE164: '+59891234567',
        },
      });
      await makeCustomer(businessId, 'Otro Cliente');

      const byName = await loyalty.list(businessId, { search: 'gómez' }, NOW);
      expect(byName.data.map((r) => r.id)).toEqual([ana.id]);

      const byPhone = await loyalty.list(businessId, { search: '234567' }, NOW);
      expect(byPhone.data.map((r) => r.id)).toEqual([ana.id]);
    });

    it('los KPIs no cambian al filtrar: describen el negocio, no la vista', async () => {
      const { businessId } = await seedMixed();

      const todos = await loyalty.list(businessId, { filter: 'todos' }, NOW);
      const soloPremio = await loyalty.list(
        businessId,
        { filter: 'recompensa' },
        NOW,
      );

      expect(soloPremio.kpis).toEqual(todos.kpis);
      expect(todos.kpis.conRecompensa).toBe(1);
      expect(todos.kpis.volvieron).toBe(2); // Rita y Ceci
    });
  });

  // ── Tenancy ─────────────────────────────────────────────────────────────

  describe('tenancy — un negocio ve SU relación con el cliente', () => {
    it('el detalle de un cliente de otro negocio da 404, no sus datos', async () => {
      const negocioA = await makeBusiness();
      const negocioB = await makeBusiness();
      const cliente = await makeCustomer(negocioB, 'Cliente de B');

      await expect(overview(negocioA, cliente.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('la lista de A nunca incluye clientes de B', async () => {
      const negocioA = await makeBusiness();
      const negocioB = await makeBusiness();
      await makeCustomer(negocioA, 'De A');
      await makeCustomer(negocioB, 'De B');

      const list = await loyalty.list(negocioA, {}, NOW);
      expect(list.data.map((r) => r.name)).toEqual(['De A']);
    });

    /**
     * El caso importante de Mi Flikker: la MISMA persona (mismo
     * `FlikkerAccount`) es cliente de dos negocios. Cada negocio ve solo su
     * propia relación — visitas, sellos y feedback del otro no se filtran.
     */
    it('mismo FlikkerAccount en dos negocios: ninguno ve los datos del otro', async () => {
      const negocioA = await makeBusiness();
      const negocioB = await makeBusiness();

      const account = await prisma.flikkerAccount.create({
        data: { id: randomUUID(), phoneE164: `+5989${Date.now() % 10000000}` },
      });

      const enA = await prisma.customer.create({
        data: {
          id: randomUUID(),
          businessId: negocioA,
          name: 'Misma Persona',
          phoneE164: account.phoneE164,
          flikkerAccountId: account.id,
        },
      });
      const enB = await prisma.customer.create({
        data: {
          id: randomUUID(),
          businessId: negocioB,
          name: 'Misma Persona',
          phoneE164: account.phoneE164,
          flikkerAccountId: account.id,
        },
      });

      // Actividad SOLO en B.
      const goalB = await addGoal(negocioB, enB.id, {
        rewardName: 'Secreto de B',
        target: 3,
        activatedAt: daysAgo(20),
      });
      const vB = await addVisit(negocioB, enB.id, daysAgo(10));
      await addVisit(negocioB, enB.id, daysAgo(5));
      await addFeedback(negocioB, enB.id, vB.id, {
        score: 5,
        comment: 'Comentario privado de B',
        goalId: goalB.id,
        at: daysAgo(10),
      });

      const detalleEnA = await overview(negocioA, enA.id);

      expect(detalleEnA.summary.visitCount).toBe(0);
      expect(detalleEnA.currentCard).toBeNull();
      expect(detalleEnA.feedback).toEqual([]);
      expect(detalleEnA.timeline.map((e) => e.kind)).toEqual(['registro']);
      // Ni el nombre de la recompensa ni el comentario del otro negocio
      // aparecen en ningún rincón de la respuesta.
      const serialized = JSON.stringify(detalleEnA);
      expect(serialized).not.toContain('Secreto de B');
      expect(serialized).not.toContain('Comentario privado de B');

      // Los Customer los limpia el afterEach por negocio; acá solo se suelta
      // la cuenta global (el FK es SetNull, así que se puede borrar antes).
      await prisma.flikkerAccount.delete({ where: { id: account.id } });
    });
  });

  // ── Permisos ────────────────────────────────────────────────────────────

  describe('permisos — qué ve cada rol', () => {
    it('OWNER y ADMIN ven el teléfono completo; OPERATOR lo ve enmascarado', async () => {
      const businessId = await makeBusiness();
      await prisma.customer.create({
        data: {
          id: randomUUID(),
          businessId,
          name: 'Ana',
          phoneE164: '+59891234567',
        },
      });

      const asOwner = await loyalty.list(
        businessId,
        { role: MembershipRole.OWNER },
        NOW,
      );
      const asAdmin = await loyalty.list(
        businessId,
        { role: MembershipRole.ADMIN },
        NOW,
      );
      const asOperator = await loyalty.list(
        businessId,
        { role: MembershipRole.OPERATOR },
        NOW,
      );

      expect(asOwner.data[0].phone).toBe('+59891234567');
      expect(asAdmin.data[0].phone).toBe('+59891234567');
      expect(asOperator.data[0].phone).toBe('••••4567');
      // Lo suficiente para reconocer al cliente, no para llevarse la agenda.
      expect(asOperator.data[0].phone).not.toContain('9123');
    });

    it('el enmascarado también aplica en el detalle', async () => {
      const businessId = await makeBusiness();
      const customer = await prisma.customer.create({
        data: {
          id: randomUUID(),
          businessId,
          name: 'Ana',
          phoneE164: '+59891234567',
        },
      });

      const detail = await overview(
        businessId,
        customer.id,
        MembershipRole.OPERATOR,
      );
      expect(detail.customer.phone).toBe('••••4567');
    });
  });

  // ── LEGACY ──────────────────────────────────────────────────────────────

  it('LEGACY sin regresión: un negocio sin tarjetas lista sus clientes igual', async () => {
    const business = await prisma.business.create({
      data: {
        id: randomUUID(),
        name: 'Negocio Legacy',
        slug: `leg-${randomUUID().slice(0, 8)}`,
        status: BusinessStatus.ACTIVE,
        country: 'UY',
        currency: 'USD',
        timezone: 'America/Montevideo',
        experienceVersion: ExperienceVersion.LEGACY,
      },
    });
    businesses.push(business.id);
    await makeCustomer(business.id, 'Cliente Legacy');

    const list = await loyalty.list(business.id, {}, NOW);

    expect(list.data).toHaveLength(1);
    expect(list.data[0].card).toBeNull();
    expect(list.data[0].rewardAvailable).toBeNull();
    expect(list.kpis.conRecompensa).toBe(0);
  });
});
