import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { MessageStatus, Prisma } from '@prisma/client';
import { Job, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { GooglePlacesProvider } from '../google-places.provider';
import {
  DetectedGoogleReview,
  GoogleReviewsProvider,
} from '../google-reviews.provider';
import {
  DETECT_GOOGLE_REVIEWS_DAILY_JOB,
  GOOGLE_REVIEW_DETECTION_QUEUE,
  INITIAL_GOOGLE_REVIEW_SCRAPE_JOB,
} from '../google-review-detection.queue';
import { createRedisConnection, REDIS_CONFIGURED } from '../redis-connection';

const ATTRIBUTION_WINDOW_DAYS = 7;
/** Tope de refresh de metadata del Place: una vez cada 24 h por negocio. */
const PLACE_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class GoogleReviewDetectionWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(GoogleReviewDetectionWorker.name);
  private connection?: IORedis;
  private worker?: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleReviewsProvider: GoogleReviewsProvider,
    private readonly googlePlacesProvider: GooglePlacesProvider,
  ) {}

  onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.worker = new Worker(
      GOOGLE_REVIEW_DETECTION_QUEUE,
      (job) => this.process(job),
      { connection: this.connection },
    );
  }

  async process(job: Job) {
    if (job.name === DETECT_GOOGLE_REVIEWS_DAILY_JOB) {
      return this.runDaily();
    }

    if (job.name === INITIAL_GOOGLE_REVIEW_SCRAPE_JOB) {
      return this.runInitial(
        job.data as { businessId?: string; full?: boolean },
      );
    }

    this.logger.warn(`Unknown Google review detection job: ${job.name}`);
    return null;
  }

  async runDaily() {
    const businesses = await this.prisma.business.findMany({
      where: {
        isActive: true,
        archivedAt: null,
        googlePlaceId: { not: null },
        googleReviewsLastSyncAt: { not: null },
      },
      select: {
        id: true,
        googlePlaceId: true,
        googlePlaceRefreshedAt: true,
      },
    });

    let created = 0;
    let failed = 0;
    let refreshed = 0;

    for (const business of businesses) {
      // El rating y la cantidad de reseñas que Google informa se refrescan
      // ACÁ, en el barrido de background, nunca desde un request del panel:
      // el dashboard no puede quedar atado a la latencia de Places, ni
      // gastar cuota una vez por visita a la pantalla.
      //
      // Va antes del scrape y en su propio try: es lo más barato de los dos
      // y un fallo suyo no puede impedir que se traigan reseñas nuevas.
      if (this.shouldRefreshPlace(business.googlePlaceRefreshedAt)) {
        if (
          await this.refreshPlaceMetadata(business.id, business.googlePlaceId!)
        ) {
          refreshed += 1;
        }
      }

      try {
        created += await this.detectForBusiness(
          business.id,
          business.googlePlaceId!,
        );
        await sleep(750);
      } catch (error) {
        failed += 1;
        this.logger.error(
          `Google review detection failed for business ${business.id}`,
          error instanceof Error ? error.stack || error.message : error,
        );
      }
    }

    return {
      businesses: businesses.length,
      created,
      refreshed,
      failed,
    };
  }

  /** Como máximo una vez cada 24 h por negocio. */
  private shouldRefreshPlace(
    lastRefreshedAt: Date | null,
    now: Date = new Date(),
  ): boolean {
    if (!lastRefreshedAt) return true;
    return (
      now.getTime() - lastRefreshedAt.getTime() >= PLACE_REFRESH_INTERVAL_MS
    );
  }

  /**
   * Actualiza `googlePlaceRating` / `googlePlaceUserRatingCount` con lo que
   * Google informa hoy. Devuelve `true` solo si de verdad se escribió algo.
   *
   * Regla central: ante cualquier fallo se CONSERVAN los últimos valores
   * válidos. `getDetails` ya devuelve `null` con un log sanitizado cuando
   * Google falla (nunca imprime la API key), así que basta con no escribir.
   * Poner `null` sería peor que un dato viejo: la pantalla pasaría de "194
   * reseñas" a "—" por una caída ajena, y el resumen dejaría de poder
   * afirmar un total.
   *
   * Tampoco se pisa un valor bueno con uno vacío: si Google responde pero no
   * trae `rating`/`userRatingCount`, esos campos quedan como estaban.
   */
  private async refreshPlaceMetadata(
    businessId: string,
    googlePlaceId: string,
  ): Promise<boolean> {
    try {
      const details = await this.googlePlacesProvider.getDetails(googlePlaceId);
      if (!details) {
        this.logger.warn(
          `[google-place-refresh] Sin detalles para businessId ${businessId} — se conservan los valores anteriores.`,
        );
        return false;
      }

      const data: {
        googlePlaceRefreshedAt: Date;
        googlePlaceRating?: number;
        googlePlaceUserRatingCount?: number;
        googlePlaceDisplayName?: string;
      } = { googlePlaceRefreshedAt: new Date() };
      if (details.rating != null) data.googlePlaceRating = details.rating;
      if (details.userRatingCount != null) {
        data.googlePlaceUserRatingCount = details.userRatingCount;
      }
      if (details.displayName)
        data.googlePlaceDisplayName = details.displayName;

      await this.prisma.business.update({
        where: { id: businessId },
        data,
        select: { id: true },
      });
      return true;
    } catch (error) {
      // Nunca propaga: el sync de reseñas sigue igual.
      this.logger.warn(
        `[google-place-refresh] Falló para businessId ${businessId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  async runInitial(input: { businessId?: string; full?: boolean }) {
    const businessId = input.businessId;
    if (!businessId) {
      this.logger.warn('Initial Google review scrape missing businessId');
      return { created: 0, skipped: true };
    }

    const full = input.full ?? false;
    this.logger.log(
      `[initial-review-scrape] Iniciando para businessId: ${businessId}${full ? ' (backfill completo)' : ''}`,
    );

    // "Sincronizando historial…" arranca acá para el caso en que el job se
    // haya encolado desde otro lado (Platform Admin) sin marcar el inicio.
    // Best-effort: el estado de una pantalla nunca frena la importación.
    if (full) await this.markBackfillStarted(businessId);

    let created = 0;

    try {
      const business = await this.prisma.business.findFirst({
        where: {
          id: businessId,
          isActive: true,
          archivedAt: null,
          googlePlaceId: { not: null },
        },
        select: {
          id: true,
          googlePlaceId: true,
        },
      });

      if (!business?.googlePlaceId) {
        this.logger.warn(
          `[initial-review-scrape] Sin googlePlaceId activo para businessId: ${businessId}`,
        );
        return { created: 0, skipped: true };
      }

      created = await this.detectForBusiness(
        business.id,
        business.googlePlaceId,
        full,
      );
      this.logger.log(
        `[initial-review-scrape] Completado: ${created} reseñas importadas`,
      );

      return { businessId: business.id, created };
    } catch (error) {
      this.logger.error(
        `[initial-review-scrape] Falló: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      return { businessId, created, failed: true };
    } finally {
      try {
        await this.prisma.business.update({
          where: { id: businessId },
          data: {
            googleReviewsLastSyncAt: new Date(),
            // El backfill se cierra pase lo que pase — también si falló.
            // Dejarlo "corriendo" para siempre sería peor que decir que
            // terminó: la pantalla deja de esperar y el detalle de qué se
            // importó ya quedó en el log de arriba.
            ...(full ? { googleReviewsBackfillCompletedAt: new Date() } : {}),
          },
          select: { id: true },
        });
      } catch (error) {
        this.logger.error(
          `[initial-review-scrape] No se pudo marcar sync para businessId ${businessId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  /** Best-effort: el estado de la pantalla nunca hace fallar la importación. */
  private async markBackfillStarted(businessId: string) {
    try {
      await this.prisma.business.update({
        where: { id: businessId },
        data: {
          googleReviewsBackfillStartedAt: new Date(),
          googleReviewsBackfillCompletedAt: null,
        },
        select: { id: true },
      });
    } catch (error) {
      this.logger.warn(
        `[initial-review-scrape] No se pudo marcar el inicio del backfill para ${businessId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.connection?.quit();
  }

  private async detectForBusiness(
    businessId: string,
    googlePlaceId: string,
    full = false,
  ) {
    const detectedReviews = await this.googleReviewsProvider.fetchReviews({
      businessId,
      googlePlaceId,
      full,
    });

    if (detectedReviews.length === 0) return 0;

    const existing = await this.prisma.googleReview.findMany({
      where: {
        businessId,
        googleReviewId: {
          in: detectedReviews.map((review) => review.googleReviewId),
        },
      },
      select: {
        googleReviewId: true,
      },
    });
    const existingIds = new Set(
      existing.map((review) => review.googleReviewId),
    );

    let created = 0;

    for (const review of detectedReviews) {
      if (existingIds.has(review.googleReviewId)) continue;

      const attributedMessageId = await this.findAttributedMessageId(
        businessId,
        review,
      );

      try {
        await this.prisma.googleReview.create({
          data: {
            businessId,
            googleReviewId: review.googleReviewId,
            reviewerName: review.reviewerName,
            stars: review.stars,
            text: review.text,
            postedAt: review.postedAt,
            attributedMessageId,
          },
        });
        created += 1;
      } catch (error) {
        // Idempotencia real: el pre-filtro de arriba evita el trabajo, pero
        // no es una garantía — el backfill completo y la corrida diaria
        // pueden solaparse y leer "no existe" a la vez. La única garantía es
        // el índice único (businessId, googleReviewId); un choque significa
        // que la reseña ya está guardada, no un error que deba abortar la
        // importación de las que faltan.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }
        throw error;
      }
    }

    return created;
  }

  private async findAttributedMessageId(
    businessId: string,
    review: DetectedGoogleReview,
  ) {
    const reviewerName = review.reviewerName?.trim();
    if (!reviewerName) return null;
    // Sin fecha real no hay ventana de atribución que tenga sentido —
    // nunca se inventa una a partir de `detectedAt`.
    if (!review.postedAt) return null;

    const from = new Date(review.postedAt);
    from.setUTCDate(from.getUTCDate() - ATTRIBUTION_WINDOW_DAYS);

    const message = await this.prisma.message.findFirst({
      where: {
        businessId,
        status: {
          in: [MessageStatus.sent, MessageStatus.delivered, MessageStatus.read],
        },
        sentAt: {
          gte: from,
          lte: review.postedAt,
        },
        customer: {
          name: {
            contains: reviewerName,
            mode: 'insensitive',
          },
        },
      },
      orderBy: {
        sentAt: 'desc',
      },
      select: {
        id: true,
      },
    });

    return message?.id ?? null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
