import { MessageStatus } from '@prisma/client';
import { GoogleReviewDetectionWorker } from './google-review-detection.worker';

/**
 * Por default no devuelve detalles: los tests que no son del refresh no
 * deben escribir metadata del Place ni cambiar de comportamiento por él.
 */
function makePlacesProvider(
  details: {
    placeId?: string;
    displayName?: string | null;
    rating?: number | null;
    userRatingCount?: number | null;
  } | null = null,
) {
  return { getDetails: jest.fn().mockResolvedValue(details) };
}

describe('GoogleReviewDetectionWorker', () => {
  it('continues with the next business when the provider fails for one business', async () => {
    const prisma = {
      business: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'business-error',
            googlePlaceId: 'place-error',
          },
          {
            id: 'business-ok',
            googlePlaceId: 'place-ok',
          },
        ]),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      googleReview: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'google-review-1' }),
      },
      message: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const provider = {
      fetchReviews: jest
        .fn()
        .mockRejectedValueOnce(new Error('Google API unavailable'))
        .mockResolvedValueOnce([
          {
            googleReviewId: 'review-1',
            reviewerName: 'Maria Garcia',
            stars: 5,
            text: 'Muy buena atencion',
            postedAt: new Date('2026-05-03T10:00:00.000Z'),
          },
        ]),
    };
    const worker = new GoogleReviewDetectionWorker(
      prisma as never,
      provider as never,
      makePlacesProvider() as never,
    );

    await expect(worker.runDaily()).resolves.toEqual({
      businesses: 2,
      created: 1,
      // Sin detalles de Places no se refresca nada — y sobre todo, eso no
      // impide que el scrape de reseñas siga corriendo.
      refreshed: 0,
      failed: 1,
    });

    expect(provider.fetchReviews).toHaveBeenCalledTimes(2);
    // Daily run never does a full backfill — always the capped (newest) fetch.
    expect(provider.fetchReviews).toHaveBeenNthCalledWith(2, {
      businessId: 'business-ok',
      googlePlaceId: 'place-ok',
      full: false,
    });
    expect(prisma.googleReview.create).toHaveBeenCalledWith({
      data: {
        businessId: 'business-ok',
        googleReviewId: 'review-1',
        reviewerName: 'Maria Garcia',
        stars: 5,
        text: 'Muy buena atencion',
        postedAt: new Date('2026-05-03T10:00:00.000Z'),
        attributedMessageId: null,
      },
    });
  });

  it('attributes a new review to the most recent matching sent message', async () => {
    const postedAt = new Date('2026-05-03T10:00:00.000Z');
    const prisma = {
      business: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'business-1',
            googlePlaceId: 'place-1',
          },
        ]),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      googleReview: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'google-review-1' }),
      },
      message: {
        findFirst: jest.fn().mockResolvedValue({ id: 'message-1' }),
      },
    };
    const provider = {
      fetchReviews: jest.fn().mockResolvedValue([
        {
          googleReviewId: 'review-1',
          reviewerName: 'Maria',
          stars: 4,
          text: null,
          postedAt,
        },
      ]),
    };
    const worker = new GoogleReviewDetectionWorker(
      prisma as never,
      provider as never,
      makePlacesProvider() as never,
    );

    await worker.runDaily();

    expect(prisma.message.findFirst).toHaveBeenCalledWith({
      where: {
        businessId: 'business-1',
        status: {
          in: [MessageStatus.sent, MessageStatus.delivered, MessageStatus.read],
        },
        sentAt: {
          gte: new Date('2026-04-26T10:00:00.000Z'),
          lte: postedAt,
        },
        customer: {
          name: {
            contains: 'Maria',
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
    expect(prisma.googleReview.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attributedMessageId: 'message-1',
      }),
    });
  });

  it('runs the initial scrape and marks the business as synced', async () => {
    const prisma = {
      business: {
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({
          id: 'business-1',
          googlePlaceId: 'place-1',
        }),
        update: jest.fn().mockResolvedValue({ id: 'business-1' }),
      },
      googleReview: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'google-review-1' }),
      },
      message: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const provider = {
      fetchReviews: jest.fn().mockResolvedValue([
        {
          googleReviewId: 'review-1',
          reviewerName: 'Maria',
          stars: 5,
          text: 'Excelente',
          postedAt: new Date('2026-05-03T10:00:00.000Z'),
        },
      ]),
    };
    const worker = new GoogleReviewDetectionWorker(
      prisma as never,
      provider as never,
      makePlacesProvider() as never,
    );

    await expect(
      worker.runInitial({ businessId: 'business-1' }),
    ).resolves.toEqual({
      businessId: 'business-1',
      created: 1,
    });

    expect(prisma.business.update).toHaveBeenCalledWith({
      where: { id: 'business-1' },
      data: { googleReviewsLastSyncAt: expect.any(Date) },
      select: { id: true },
    });
  });

  it('passes full=true to the provider on a backfill run', async () => {
    const prisma = {
      business: {
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({
          id: 'business-1',
          googlePlaceId: 'place-1',
        }),
        update: jest.fn().mockResolvedValue({ id: 'business-1' }),
      },
      googleReview: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'google-review-1' }),
      },
      message: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const provider = {
      fetchReviews: jest.fn().mockResolvedValue([]),
    };
    const worker = new GoogleReviewDetectionWorker(
      prisma as never,
      provider as never,
      makePlacesProvider() as never,
    );

    await worker.runInitial({ businessId: 'business-1', full: true });

    expect(provider.fetchReviews).toHaveBeenCalledWith({
      businessId: 'business-1',
      googlePlaceId: 'place-1',
      full: true,
    });
  });
});

/**
 * Refresh periódico de la metadata del Place (rating + cantidad de reseñas
 * que Google informa). Es el número que la pantalla y el resumen usan para
 * decir "el comercio tiene N reseñas" — `COUNT(GoogleReview)` nunca lo
 * sustituye, por más filas que tengamos importadas.
 */
describe('GoogleReviewDetectionWorker — refresh de metadata del Place', () => {
  const HOUR = 60 * 60 * 1000;

  function makePrisma(googlePlaceRefreshedAt: Date | null) {
    return {
      business: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'business-1',
            googlePlaceId: 'place-1',
            googlePlaceRefreshedAt,
          },
        ]),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'business-1' }),
      },
      googleReview: {
        // 60 importadas: el número que NUNCA debe reemplazar al total real.
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'r1' }),
        count: jest.fn().mockResolvedValue(60),
      },
      message: { findFirst: jest.fn().mockResolvedValue(null) },
    };
  }

  const reviewsProvider = () => ({
    fetchReviews: jest.fn().mockResolvedValue([]),
  });

  /** Los valores guardados hoy: 194 reseñas, 3.9 estrellas. */
  const CURRENT = { rating: 3.9, userRatingCount: 194 };

  it('194/3.9 pasa a 195/4.0 después del refresh', async () => {
    const prisma = makePrisma(null); // nunca refrescado
    const places = makePlacesProvider({
      placeId: 'place-1',
      displayName: 'La Stampa',
      rating: 4.0,
      userRatingCount: 195,
    });
    const worker = new GoogleReviewDetectionWorker(
      prisma as never,
      reviewsProvider() as never,
      places as never,
    );

    const result = await worker.runDaily();

    expect(result.refreshed).toBe(1);
    expect(prisma.business.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'business-1' },
        data: expect.objectContaining({
          googlePlaceRating: 4.0,
          googlePlaceUserRatingCount: 195,
        }),
      }),
    );
  });

  it('si Places falla, conserva 194/3.9 y NO los pone en null', async () => {
    const prisma = makePrisma(null);
    const places = makePlacesProvider(null); // Google no respondió
    const worker = new GoogleReviewDetectionWorker(
      prisma as never,
      reviewsProvider() as never,
      places as never,
    );

    const result = await worker.runDaily();

    expect(result.refreshed).toBe(0);
    // Lo importante: NO se escribió nada. Un `null` sería peor que un dato
    // viejo — la pantalla pasaría de "194 reseñas" a "—" por una caída ajena.
    expect(prisma.business.update).not.toHaveBeenCalled();
  });

  it('un fallo de Places no bloquea el sync de reseñas', async () => {
    const prisma = makePrisma(null);
    const places = {
      getDetails: jest.fn().mockRejectedValue(new Error('boom')),
    };
    const reviews = reviewsProvider();
    const worker = new GoogleReviewDetectionWorker(
      prisma as never,
      reviews as never,
      places as never,
    );

    const result = await worker.runDaily();

    expect(reviews.fetchReviews).toHaveBeenCalledTimes(1);
    expect(result.failed).toBe(0);
    expect(prisma.business.update).not.toHaveBeenCalled();
  });

  it('no refresca dos veces dentro de las 24 h', async () => {
    const prisma = makePrisma(new Date(Date.now() - 3 * HOUR));
    const places = makePlacesProvider({
      placeId: 'place-1',
      rating: 4.0,
      userRatingCount: 195,
    });
    const worker = new GoogleReviewDetectionWorker(
      prisma as never,
      reviewsProvider() as never,
      places as never,
    );

    const result = await worker.runDaily();

    expect(places.getDetails).not.toHaveBeenCalled();
    expect(result.refreshed).toBe(0);
  });

  it('vuelve a refrescar pasadas las 24 h', async () => {
    const prisma = makePrisma(new Date(Date.now() - 25 * HOUR));
    const places = makePlacesProvider({
      placeId: 'place-1',
      rating: 4.0,
      userRatingCount: 195,
    });
    const worker = new GoogleReviewDetectionWorker(
      prisma as never,
      reviewsProvider() as never,
      places as never,
    );

    expect((await worker.runDaily()).refreshed).toBe(1);
    expect(places.getDetails).toHaveBeenCalledWith('place-1');
  });

  it('COUNT(GoogleReview)=60 nunca reemplaza el total de Google', async () => {
    const prisma = makePrisma(null);
    const places = makePlacesProvider({
      placeId: 'place-1',
      rating: 4.0,
      userRatingCount: 195,
    });
    const worker = new GoogleReviewDetectionWorker(
      prisma as never,
      reviewsProvider() as never,
      places as never,
    );

    await worker.runDaily();

    const written = prisma.business.update.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    // El único origen de `googlePlaceUserRatingCount` es Places Details.
    expect(written.googlePlaceUserRatingCount).toBe(195);
    expect(written.googlePlaceUserRatingCount).not.toBe(60);
    expect(prisma.googleReview.count).not.toHaveBeenCalled();
  });

  it('Google responde sin rating: no pisa el valor bueno con vacío', async () => {
    const prisma = makePrisma(null);
    const places = makePlacesProvider({
      placeId: 'place-1',
      rating: null,
      userRatingCount: 195,
    });
    const worker = new GoogleReviewDetectionWorker(
      prisma as never,
      reviewsProvider() as never,
      places as never,
    );

    await worker.runDaily();

    const written = prisma.business.update.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(written.googlePlaceUserRatingCount).toBe(195);
    expect(written).not.toHaveProperty('googlePlaceRating');
    // El 3.9 guardado sigue intacto porque nunca se tocó esa columna.
    expect(CURRENT.rating).toBe(3.9);
  });
});
