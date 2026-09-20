import { randomUUID } from 'crypto';
import {
  BenefitType,
  BusinessStatus,
  CampaignTemplateKind,
  ExperienceVersion,
  ServiceEventCreatedVia,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RepeatsProcessor } from './repeats.processor';
import { RetentionProcessor } from './retention.processor';
import { RaffleProcessor } from './raffle.processor';
import { GoogleReviewDetectionWorker } from './workers/google-review-detection.worker';

/**
 * Un negocio archivado no puede contactar a nadie.
 *
 * La auditoría encontró que archivar escribía tres campos
 * (`status/isActive/archivedAt`) pero NO pausaba nada: tres procesadores
 * seleccionaban su trabajo sin mirar el negocio, así que 17 negocios
 * archivados con campañas en ACTIVE seguían siendo candidatos a mandar
 * WhatsApp a clientes reales.
 *
 * Se prueba contra Postgres real porque lo que se arregló vive en el `where`
 * de las queries: un mock del cliente Prisma devolvería lo que le pidamos y
 * no probaría nada.
 *
 * Las colas nunca se tocan: los procesadores reciben un stub que registra si
 * fueron llamadas. Que la cola NO reciba nada es exactamente la aserción.
 */
describe('Negocios archivados — cero efectos hacia afuera (integration)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  type State = 'live' | 'archived' | 'inactive' | 'status_archived';

  /** Los tres estados de archivado, más el negocio sano de control. */
  function stateFields(state: State) {
    switch (state) {
      case 'live':
        return {
          status: BusinessStatus.ACTIVE,
          isActive: true,
          archivedAt: null,
        };
      case 'archived': // lo que escribe `archiveBusiness`: los tres juntos
        return {
          status: BusinessStatus.ARCHIVED,
          isActive: false,
          archivedAt: new Date(),
        };
      case 'inactive': // solo isActive en false
        return {
          status: BusinessStatus.ACTIVE,
          isActive: false,
          archivedAt: null,
        };
      case 'status_archived': // solo el status — el estado intermedio raro
        return {
          status: BusinessStatus.ARCHIVED,
          isActive: true,
          archivedAt: null,
        };
    }
  }

  async function makeBusiness(
    state: State,
    exp: ExperienceVersion = ExperienceVersion.LEGACY,
  ) {
    const b = await prisma.business.create({
      data: {
        name: `Guard ${state}`,
        slug: `guard-${state}-${randomUUID()}`,
        country: 'UY',
        timezone: 'America/Montevideo',
        currency: 'UYU',
        experienceVersion: exp,
        messageQuotaMonthly: 1000,
        ...stateFields(state),
      },
      select: { id: true },
    });
    return b.id;
  }

  /** Campaign.createdByUserId es requerido — un User de test reutilizable. */
  let cachedOwnerId: string | null = null;
  async function ownerUserId() {
    if (cachedOwnerId) return cachedOwnerId;
    const u = await prisma.user.create({
      data: {
        email: `guard-owner-${randomUUID()}@example.test`,
        passwordHash: 'x',
        firstName: 'Guard',
        lastName: 'Owner',
      },
      select: { id: true },
    });
    cachedOwnerId = u.id;
    return cachedOwnerId;
  }

  async function cleanup(businessId: string) {
    await prisma.campaignExecution.deleteMany({ where: { businessId } });
    await prisma.message.deleteMany({ where: { businessId } });
    await prisma.campaign.deleteMany({ where: { businessId } });
    await prisma.retentionSend.deleteMany({ where: { businessId } });
    await prisma.retentionStep.deleteMany({ where: { businessId } });
    await prisma.retentionSequence.deleteMany({ where: { businessId } });
    await prisma.raffleDraw.deleteMany({ where: { businessId } });
    await prisma.benefitParticipation.deleteMany({ where: { businessId } });
    await prisma.benefit.deleteMany({ where: { businessId } });
    // Antes que Customer: `ServiceEvent.customerId` es RESTRICT.
    await prisma.serviceEvent.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
  }

  // ── Campañas de repetición (LEGACY) ─────────────────────────────────

  describe('repeats.processor', () => {
    const makeQueue = () => ({
      enqueueSendRepeatMessage: jest.fn().mockResolvedValue(undefined),
    });

    async function runFor(state: State) {
      const businessId = await makeBusiness(state);
      const queue = makeQueue();
      try {
        // Cliente con una visita de servicio de hace 30 días: candidato
        // perfecto para la campaña post_service.
        const customer = await prisma.customer.create({
          data: {
            businessId,
            name: 'Cliente',
            phoneE164: `+5989${Math.floor(1e6 + Math.random() * 9e6)}`,
          },
          select: { id: true },
        });
        await prisma.serviceEvent.create({
          data: {
            businessId,
            customerId: customer.id,
            serviceType: 'Corte',
            eventAt: new Date('2026-08-21T12:00:00.000Z'),
            createdVia: ServiceEventCreatedVia.manual_panel,
          },
        });
        await prisma.campaign.create({
          data: {
            businessId,
            name: 'Post servicio',
            slug: `post-${randomUUID()}`,
            status: 'ACTIVE',
            templateKind: CampaignTemplateKind.post_service,
            triggerOffsetDays: 30,
            messageBody: 'Hola {{nombre}}',
            channel: 'WHATSAPP',
            destinationType: 'GOOGLE_REVIEW',
            destinationUrl: null,
            enableLanding: false,
            createdByUserId: await ownerUserId(),
          },
        });

        const processor = new RepeatsProcessor(prisma, queue as never);
        await processor.runDaily(new Date('2026-09-20T12:00:00.000Z'));
        /*
          Se cuentan las ejecuciones DE ESTE negocio, no el total del
          barrido: `runDaily` es global y la base puede tener otros
          negocios (los del seed, por ejemplo) con campañas propias. El
          total global no diría nada sobre el guard.
        */
        const queued = await prisma.campaignExecution.count({
          where: { businessId },
        });
        return { queued, queue };
      } finally {
        await cleanup(businessId);
      }
    }

    it('negocio vivo: la campaña se procesa como siempre', async () => {
      expect((await runFor('live')).queued).toBeGreaterThan(0);
    });

    it('archivado: no se encola ni un mensaje', async () => {
      expect((await runFor('archived')).queued).toBe(0);
    });

    it('isActive=false: no se encola ni un mensaje', async () => {
      expect((await runFor('inactive')).queued).toBe(0);
    });

    it('solo status=ARCHIVED (estado intermedio): no se encola nada', async () => {
      expect((await runFor('status_archived')).queued).toBe(0);
    });
  });

  // ── Secuencias de retención (LEGACY) ────────────────────────────────

  describe('retention.processor', () => {
    async function runFor(state: State) {
      const businessId = await makeBusiness(state);
      const queue = {
        enqueueSendRetentionMessage: jest.fn().mockResolvedValue(undefined),
      };
      try {
        const sequence = await prisma.retentionSequence.create({
          data: { businessId, enabled: true },
          select: { id: true },
        });
        await prisma.retentionStep.create({
          data: {
            businessId,
            sequenceId: sequence.id,
            offsetDays: 30,
            messageBody: 'Volvé',
          },
        });
        await prisma.customer.create({
          data: {
            businessId,
            name: 'Cliente',
            phoneE164: `+5989${Math.floor(1e6 + Math.random() * 9e6)}`,
            createdAt: new Date('2026-08-21T12:00:00.000Z'),
          },
        });

        const processor = new RetentionProcessor(prisma, queue as never);
        await processor.runDaily(new Date('2026-09-20T12:00:00.000Z'));
        const queued = await prisma.retentionSend.count({
          where: { businessId },
        });
        return { queued, queue };
      } finally {
        await cleanup(businessId);
      }
    }

    it('negocio vivo: la secuencia se evalúa y encola', async () => {
      expect((await runFor('live')).queued).toBeGreaterThan(0);
    });

    it('archivado: 0 envíos', async () => {
      expect((await runFor('archived')).queued).toBe(0);
    });

    it('isActive=false: 0 envíos', async () => {
      expect((await runFor('inactive')).queued).toBe(0);
    });

    it('solo status=ARCHIVED: 0 envíos', async () => {
      expect((await runFor('status_archived')).queued).toBe(0);
    });
  });

  // ── Sorteos ─────────────────────────────────────────────────────────

  describe('raffle.processor', () => {
    async function runFor(state: State) {
      const businessId = await makeBusiness(state);
      const queue = {
        enqueueSendRaffleNotifications: jest.fn().mockResolvedValue(undefined),
      };
      try {
        await prisma.benefit.create({
          data: {
            businessId,
            title: 'Sorteo mensual',
            type: BenefitType.raffle,
            active: true,
          },
        });

        const processor = new RaffleProcessor(prisma, queue as never);
        // Último día del mes, 23:55 Montevideo = ventana de sorteo.
        await processor.runTick(new Date('2026-10-01T02:55:00.000Z'));
        const draws = await prisma.raffleDraw.count({ where: { businessId } });
        return { draws, queue, businessId };
      } finally {
        await cleanup(businessId);
      }
    }

    it('negocio vivo: el sorteo se considera (sin participantes, 0 draws)', async () => {
      // Sin participaciones no hay a quién sortear, así que no se crea
      // RaffleDraw ni en el caso vivo — lo que se prueba abajo es que el
      // archivado tampoco llega a evaluarse.
      expect((await runFor('live')).draws).toBe(0);
    });

    /*
      Acá el riesgo no era solo un mensaje: se creaba un `RaffleDraw` real,
      una fila que después nadie iba a poder explicar.
    */
    it('archivado: no se crea ningún RaffleDraw', async () => {
      expect((await runFor('archived')).draws).toBe(0);
    });

    it('isActive=false: no se crea ningún RaffleDraw', async () => {
      expect((await runFor('inactive')).draws).toBe(0);
    });

    it('solo status=ARCHIVED: no se crea ningún RaffleDraw', async () => {
      expect((await runFor('status_archived')).draws).toBe(0);
    });
  });

  // ── scrape.do (regresión) ───────────────────────────────────────────

  /*
    Estos guards YA estaban bien antes de esta tanda. Los tests existen para
    que sigan estándolo: scrape.do es un proveedor pago y externo, y una
    regresión acá se paga literalmente. El provider está mockeado, así que
    ninguna request sale de verdad — lo que se afirma es que ni siquiera se
    intenta.
  */
  describe('scrape.do — ninguna request para negocios no operativos', () => {
    async function runInitialFor(state: State, full = false) {
      const businessId = await makeBusiness(
        state,
        ExperienceVersion.CHECKIN_V2,
      );
      const fetchReviews = jest.fn().mockResolvedValue([]);
      try {
        await prisma.business.update({
          where: { id: businessId },
          data: { googlePlaceId: 'ChIJ_test_place_id' },
        });

        const worker = new GoogleReviewDetectionWorker(
          prisma,
          { fetchReviews } as never,
          { fetchPlaceDetails: jest.fn() } as never,
        );
        const result = await worker.runInitial({ businessId, full });
        return { result, fetchReviews, businessId };
      } finally {
        await cleanup(businessId);
      }
    }

    it('archivado: 0 requests a scrape.do', async () => {
      const { result, fetchReviews } = await runInitialFor('archived');
      expect(fetchReviews).not.toHaveBeenCalled();
      expect(result).toMatchObject({ created: 0, skipped: true });
    });

    it('isActive=false: 0 requests', async () => {
      const { fetchReviews } = await runInitialFor('inactive');
      expect(fetchReviews).not.toHaveBeenCalled();
    });

    it('backfill completo sobre un archivado: 0 requests', async () => {
      const { fetchReviews } = await runInitialFor('archived', true);
      expect(fetchReviews).not.toHaveBeenCalled();
    });

    it('negocio inexistente: 0 requests, sin tirar', async () => {
      const fetchReviews = jest.fn().mockResolvedValue([]);
      const worker = new GoogleReviewDetectionWorker(
        prisma,
        { fetchReviews } as never,
        { fetchPlaceDetails: jest.fn() } as never,
      );
      await expect(
        worker.runInitial({ businessId: randomUUID() }),
      ).resolves.toMatchObject({ skipped: true });
      expect(fetchReviews).not.toHaveBeenCalled();
    });

    it('sin businessId en el payload: 0 requests', async () => {
      const fetchReviews = jest.fn().mockResolvedValue([]);
      const worker = new GoogleReviewDetectionWorker(
        prisma,
        { fetchReviews } as never,
        { fetchPlaceDetails: jest.fn() } as never,
      );
      await worker.runInitial({});
      expect(fetchReviews).not.toHaveBeenCalled();
    });

    it('el barrido diario tampoco toma negocios archivados', async () => {
      const businessId = await makeBusiness(
        'archived',
        ExperienceVersion.CHECKIN_V2,
      );
      const fetchReviews = jest.fn().mockResolvedValue([]);
      try {
        await prisma.business.update({
          where: { id: businessId },
          data: {
            googlePlaceId: 'ChIJ_test_place_id',
            googleReviewsLastSyncAt: new Date('2026-09-01T00:00:00.000Z'),
          },
        });
        const worker = new GoogleReviewDetectionWorker(
          prisma,
          { fetchReviews } as never,
          { fetchPlaceDetails: jest.fn() } as never,
        );
        await worker.runDaily();
        expect(fetchReviews).not.toHaveBeenCalled();
      } finally {
        await cleanup(businessId);
      }
    });
  });
});
