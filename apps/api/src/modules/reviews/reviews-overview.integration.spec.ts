import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BusinessStatus,
  CustomerEventType,
  ExperienceVersion,
  VisitVerificationType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ReviewsOverviewService } from './reviews-overview.service';

/**
 * Reseñas, contra DB real.
 *
 * Dos cosas se prueban acá sobre todas las demás: que Google y el feedback
 * privado nunca se mezclen, y que un click en "abrir Google" no se convierta
 * en "dejó una reseña".
 */
describe('Reseñas — overview (integration)', () => {
  let prisma: PrismaService;
  let service: ReviewsOverviewService;

  const NOW = new Date('2026-08-12T15:00:00.000Z');
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
  const businesses: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, ReviewsOverviewService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(ReviewsOverviewService);
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
      await prisma.visit.deleteMany({ where: { businessId: id } });
      await prisma.customer.deleteMany({ where: { businessId: id } });
      await prisma.business.delete({ where: { id } }).catch(() => undefined);
    }
  });

  async function makeBusiness(googleUrl: string | null = null) {
    const business = await prisma.business.create({
      data: {
        id: randomUUID(),
        name: 'Café Reseñas',
        slug: `rev-${randomUUID().slice(0, 8)}`,
        status: BusinessStatus.ACTIVE,
        country: 'UY',
        currency: 'UYU',
        timezone: 'America/Montevideo',
        experienceVersion: ExperienceVersion.CHECKIN_V2,
        googleBusinessProfileUrl: googleUrl,
      },
    });
    businesses.push(business.id);
    return business.id;
  }

  const makeCustomer = (businessId: string, name = 'Fabrizio') =>
    prisma.customer.create({
      data: {
        id: randomUUID(),
        businessId,
        name,
        phoneE164: `+5989${String(Math.random()).slice(2, 9)}`,
      },
    });

  const addReview = (
    businessId: string,
    stars: number,
    options: { text?: string; postedAt?: Date; author?: string } = {},
  ) =>
    prisma.googleReview.create({
      data: {
        businessId,
        googleReviewId: randomUUID(),
        reviewerName: options.author ?? 'Cliente Google',
        stars,
        text: options.text ?? null,
        postedAt: options.postedAt ?? daysAgo(5),
      },
    });

  async function addFeedback(
    businessId: string,
    customerId: string,
    score: number,
    options: { comment?: string; at?: Date } = {},
  ) {
    const at = options.at ?? daysAgo(3);
    const visit = await prisma.visit.create({
      data: {
        id: randomUUID(),
        businessId,
        customerId,
        occurredAt: at,
        visitDayKey: at.toISOString().slice(0, 10),
        verificationType: VisitVerificationType.persistent_session,
      },
    });
    return prisma.checkinFeedback.create({
      data: {
        id: randomUUID(),
        businessId,
        customerId,
        visitId: visit.id,
        score,
        comment: options.comment ?? null,
        createdAt: at,
      },
    });
  }

  const overview = (businessId: string, days = 30) =>
    service.forBusiness(businessId, days, NOW);

  // ── Estado de Google ────────────────────────────────────────────────────

  describe('conexión con Google', () => {
    it('sin URL configurada, Google figura desconectado', async () => {
      const businessId = await makeBusiness(null);

      const data = await overview(businessId);

      expect(data.google.connected).toBe(false);
      expect(data.google.profileUrl).toBeNull();
      expect(data.google.lastSyncedAt).toBeNull();
    });

    it('con URL configurada figura conectado', async () => {
      const businessId = await makeBusiness('https://g.page/mi-cafe');

      const data = await overview(businessId);

      expect(data.google.connected).toBe(true);
      expect(data.google.profileUrl).toBe('https://g.page/mi-cafe');
    });

    it('la última sincronización es la última reseña detectada', async () => {
      const businessId = await makeBusiness('https://g.page/mi-cafe');
      await addReview(businessId, 5);

      const data = await overview(businessId);

      expect(data.google.lastSyncedAt).toBeInstanceOf(Date);
    });
  });

  // ── Resumen ─────────────────────────────────────────────────────────────

  describe('resumen', () => {
    it('la calificación es el promedio real', async () => {
      const businessId = await makeBusiness('https://g.page/x');
      await addReview(businessId, 5);
      await addReview(businessId, 4);
      await addReview(businessId, 5);

      const data = await overview(businessId);

      expect(data.summary.rating).toBe(4.7);
      expect(data.summary.total).toBe(3);
      expect(data.summary.ratingDistribution[5]).toBe(2);
      expect(data.summary.ratingDistribution[4]).toBe(1);
    });

    /** Un "0.0 ★" se lee como si el negocio estuviera pésimo. */
    it('sin reseñas la calificación es null, no cero', async () => {
      const businessId = await makeBusiness('https://g.page/x');

      const data = await overview(businessId);

      expect(data.summary.rating).toBeNull();
      expect(data.summary.total).toBe(0);
    });

    it('cuenta solo las nuevas del período elegido', async () => {
      const businessId = await makeBusiness('https://g.page/x');
      await addReview(businessId, 5, { postedAt: daysAgo(3) });
      await addReview(businessId, 4, { postedAt: daysAgo(20) });
      await addReview(businessId, 3, { postedAt: daysAgo(60) });

      expect((await overview(businessId, 7)).summary.inPeriod).toBe(1);
      expect((await overview(businessId, 30)).summary.inPeriod).toBe(2);
      expect((await overview(businessId, 90)).summary.inPeriod).toBe(3);
      // El total no depende del período.
      expect((await overview(businessId, 7)).summary.total).toBe(3);
    });
  });

  // ── Gráfico + "desde que conectaste" ────────────────────────────────────

  describe('gráfico diario', () => {
    it('un punto por día del período, en orden, sin huecos', async () => {
      const businessId = await makeBusiness('https://g.page/x');
      await addReview(businessId, 5, { postedAt: daysAgo(2) });
      await addReview(businessId, 4, { postedAt: daysAgo(2) });
      await addReview(businessId, 3, { postedAt: daysAgo(6) });

      const data = await overview(businessId, 7);

      expect(data.chart).toHaveLength(8); // 7 días atrás + hoy, inclusive
      expect(data.chart.map((p) => p.date)).toEqual(
        [...data.chart.map((p) => p.date)].sort(),
      );
      const byDate = new Map(data.chart.map((p) => [p.date, p.count]));
      expect(byDate.get(daysAgo(2).toISOString().slice(0, 10))).toBe(2);
      expect(byDate.get(daysAgo(6).toISOString().slice(0, 10))).toBe(1);
    });

    it('un negocio sin reseñas tiene el gráfico en cero, no vacío', async () => {
      const businessId = await makeBusiness('https://g.page/x');

      const data = await overview(businessId, 7);

      expect(data.chart).toHaveLength(8);
      expect(data.chart.every((p) => p.count === 0)).toBe(true);
    });

    it('una reseña fuera del período no aparece en el gráfico', async () => {
      const businessId = await makeBusiness('https://g.page/x');
      await addReview(businessId, 5, { postedAt: daysAgo(60) });

      const data = await overview(businessId, 7);

      expect(data.chart.reduce((sum, p) => sum + p.count, 0)).toBe(0);
    });
  });

  describe('"desde que conectaste"', () => {
    it('sin `googlePlaceConnectedAt`, `sinceConnected` es null — no se inventa un número', async () => {
      const businessId = await makeBusiness('https://g.page/x');
      await addReview(businessId, 5, { postedAt: daysAgo(2) });

      const data = await overview(businessId);

      expect(data.google.connectedAt).toBeNull();
      expect(data.summary.sinceConnected).toBeNull();
    });

    it('con `googlePlaceConnectedAt`, cuenta solo lo posterior a esa fecha', async () => {
      const businessId = await makeBusiness('https://g.page/x');
      await prisma.business.update({
        where: { id: businessId },
        data: { googlePlaceConnectedAt: daysAgo(10) },
      });
      await addReview(businessId, 5, { postedAt: daysAgo(20) }); // antes de conectar
      await addReview(businessId, 4, { postedAt: daysAgo(5) }); // después
      await addReview(businessId, 3, { postedAt: daysAgo(1) }); // después

      const data = await overview(businessId);

      expect(data.google.connectedAt).toEqual(daysAgo(10));
      expect(data.summary.sinceConnected).toBe(2);
      // El total histórico no cambia — sigue contando todo.
      expect(data.summary.total).toBe(3);
    });
  });

  // ── Separación Google / feedback ────────────────────────────────────────

  describe('Google y feedback privado no se mezclan', () => {
    it('cada uno vive en su propio bloque', async () => {
      const businessId = await makeBusiness('https://g.page/x');
      const customer = await makeCustomer(businessId);
      await addReview(businessId, 5, { text: 'Público en Google' });
      await addFeedback(businessId, customer.id, 3, {
        comment: 'Privado de Flikker',
      });

      const data = await overview(businessId);

      expect(data.reviews).toHaveLength(1);
      expect(data.reviews[0].text).toBe('Público en Google');
      expect(data.feedback).toHaveLength(1);
      expect(data.feedback[0].comment).toBe('Privado de Flikker');

      // Y ninguno se filtra en el bloque del otro.
      expect(JSON.stringify(data.reviews)).not.toContain('Privado de Flikker');
      expect(JSON.stringify(data.feedback)).not.toContain('Público en Google');
    });

    it('el feedback muestra cliente, puntaje y visita asociada', async () => {
      const businessId = await makeBusiness();
      const customer = await makeCustomer(businessId, 'Fabrizio');
      await addFeedback(businessId, customer.id, 3, {
        comment: 'Demoraron bastante hoy',
      });

      const data = await overview(businessId);

      expect(data.feedback[0]).toMatchObject({
        score: 3,
        comment: 'Demoraron bastante hoy',
        customer: { id: customer.id, name: 'Fabrizio' },
      });
    });

    it('feedback sin comentario conserva el puntaje y no inventa texto', async () => {
      const businessId = await makeBusiness();
      const customer = await makeCustomer(businessId);
      await addFeedback(businessId, customer.id, 4);

      const data = await overview(businessId);

      expect(data.feedback[0].score).toBe(4);
      expect(data.feedback[0].comment).toBeNull();
    });

    it('el sello extra se informa solo si de verdad ocurrió', async () => {
      const businessId = await makeBusiness();
      const customer = await makeCustomer(businessId);
      await addFeedback(businessId, customer.id, 5);

      const data = await overview(businessId);

      expect(data.feedback[0].gaveBonusStamp).toBe(false);
    });
  });

  // ── Comentarios para revisar ────────────────────────────────────────────

  describe('comentarios para revisar', () => {
    it('trae los puntajes bajos CON comentario', async () => {
      const businessId = await makeBusiness();
      const customer = await makeCustomer(businessId);
      await addFeedback(businessId, customer.id, 2, {
        comment: 'Muy lento',
        at: daysAgo(1),
      });
      await addFeedback(businessId, customer.id, 5, {
        comment: 'Todo genial',
        at: daysAgo(2),
      });

      const data = await overview(businessId);

      expect(data.toReview).toHaveLength(1);
      expect(data.toReview[0].comment).toBe('Muy lento');
    });

    it('un puntaje bajo SIN comentario no entra: no hay nada que atender', async () => {
      const businessId = await makeBusiness();
      const customer = await makeCustomer(businessId);
      await addFeedback(businessId, customer.id, 1, { at: daysAgo(1) });

      expect((await overview(businessId)).toReview).toEqual([]);
    });
  });

  // ── Embudo y atribución ─────────────────────────────────────────────────

  describe('embudo', () => {
    it('cada paso sale de un dato real', async () => {
      const businessId = await makeBusiness('https://g.page/x');
      const customer = await makeCustomer(businessId);

      await addFeedback(businessId, customer.id, 4, { at: daysAgo(2) });
      await prisma.customerEvent.create({
        data: {
          businessId,
          customerId: customer.id,
          type: CustomerEventType.review_link_clicked,
          createdAt: daysAgo(2),
        },
      });

      const data = await overview(businessId);

      expect(data.funnel.visits).toBe(1);
      expect(data.funnel.feedback).toBe(1);
      expect(data.funnel.openedGoogle).toBe(1);
    });

    /**
     * El invariante central de esta pantalla: abrir Google no es publicar una
     * reseña. Un click no puede aparecer nunca como reseña conseguida.
     */
    it('un click en Google NO cuenta como reseña', async () => {
      const businessId = await makeBusiness('https://g.page/x');
      const customer = await makeCustomer(businessId);
      await prisma.customerEvent.create({
        data: {
          businessId,
          customerId: customer.id,
          type: CustomerEventType.review_link_clicked,
          createdAt: daysAgo(1),
        },
      });

      const data = await overview(businessId);

      expect(data.funnel.openedGoogle).toBe(1);
      expect(data.funnel.linkedReviews).toBe(0);
      expect(data.summary.total).toBe(0);
    });

    it('una reseña sin mensaje asociado no se atribuye a Flikker', async () => {
      const businessId = await makeBusiness('https://g.page/x');
      await addReview(businessId, 5, { postedAt: daysAgo(2) });

      const data = await overview(businessId);

      expect(data.reviews[0].linkedToFlikkerActivity).toBe(false);
      expect(data.funnel.linkedReviews).toBe(0);
    });

    it('el campo de atribución no afirma que Flikker generó la reseña', async () => {
      const businessId = await makeBusiness('https://g.page/x');
      await addReview(businessId, 5);

      const serialized = JSON.stringify(await overview(businessId));

      // El nombre del campo es "asociada a actividad", no "generada por".
      expect(serialized).toContain('linkedToFlikkerActivity');
      expect(serialized).not.toContain('generatedByFlikker');
      expect(serialized).not.toContain('causedBy');
    });
  });

  // ── Tenancy ─────────────────────────────────────────────────────────────

  describe('tenancy', () => {
    it('un negocio nunca ve reseñas ni feedback de otro', async () => {
      const negocioA = await makeBusiness('https://g.page/a');
      const negocioB = await makeBusiness('https://g.page/b');
      const customerB = await makeCustomer(negocioB, 'Cliente de B');

      await addReview(negocioB, 5, { text: 'Reseña secreta de B' });
      await addFeedback(negocioB, customerB.id, 2, {
        comment: 'Feedback secreto de B',
      });

      const data = await overview(negocioA);
      const serialized = JSON.stringify(data);

      expect(data.reviews).toEqual([]);
      expect(data.feedback).toEqual([]);
      expect(data.toReview).toEqual([]);
      expect(data.summary.total).toBe(0);
      expect(serialized).not.toContain('Reseña secreta de B');
      expect(serialized).not.toContain('Feedback secreto de B');
    });

    it('el embudo tampoco cruza negocios', async () => {
      const negocioA = await makeBusiness();
      const negocioB = await makeBusiness();
      const customerB = await makeCustomer(negocioB);
      await prisma.customerEvent.create({
        data: {
          businessId: negocioB,
          customerId: customerB.id,
          type: CustomerEventType.review_link_clicked,
        },
      });

      expect((await overview(negocioA)).funnel.openedGoogle).toBe(0);
    });
  });

  // ── LEGACY ──────────────────────────────────────────────────────────────

  it('LEGACY sin regresión: un negocio legacy con reseñas las lista igual', async () => {
    const business = await prisma.business.create({
      data: {
        id: randomUUID(),
        name: 'Legacy Reseñas',
        slug: `legrev-${randomUUID().slice(0, 8)}`,
        status: BusinessStatus.ACTIVE,
        country: 'UY',
        currency: 'USD',
        timezone: 'America/Montevideo',
        experienceVersion: ExperienceVersion.LEGACY,
        googleBusinessProfileUrl: 'https://g.page/legacy',
      },
    });
    businesses.push(business.id);
    await addReview(business.id, 4);

    const data = await overview(business.id);

    expect(data.google.connected).toBe(true);
    expect(data.summary.total).toBe(1);
    // Sin actividad de check-in, el embudo simplemente está en cero.
    expect(data.funnel).toEqual({
      visits: 0,
      feedback: 0,
      openedGoogle: 0,
      linkedReviews: 0,
    });
  });

  // ── Vacíos ──────────────────────────────────────────────────────────────

  it('un negocio sin nada devuelve listas vacías y no explota', async () => {
    const businessId = await makeBusiness();

    const data = await overview(businessId);

    expect(data.reviews).toEqual([]);
    expect(data.feedback).toEqual([]);
    expect(data.toReview).toEqual([]);
    expect(data.summary.rating).toBeNull();
  });
});
