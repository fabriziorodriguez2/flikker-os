import { GoogleReviewsProvider } from './google-reviews.provider';

/**
 * El punto del fix (pedido explícito, auditoría de "Reseñas con Flikker"):
 * una reseña vieja real nunca debe terminar con `postedAt` de hoy solo
 * porque Scrape.do no trajo una fecha relativa parseable. Antes,
 * `parseGoogleReviewDate` devolvía `new Date()` como fallback silencioso —
 * exactamente lo que `detectedAt` ya representa, mezclado por error dentro
 * de `postedAt`. Ahora debe devolver `null`.
 */
describe('GoogleReviewsProvider — postedAt nunca se inventa', () => {
  const ORIGINAL_ENV = process.env.SCRAPE_DO_TOKEN;
  const ORIGINAL_FETCH = global.fetch;

  beforeEach(() => {
    process.env.SCRAPE_DO_TOKEN = 'test-token';
  });

  afterEach(() => {
    process.env.SCRAPE_DO_TOKEN = ORIGINAL_ENV;
    global.fetch = ORIGINAL_FETCH;
  });

  function mockScrapeDoResponse(reviews: Record<string, unknown>[]) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ reviews })),
    }) as unknown as typeof fetch;
  }

  it('usa `iso_date` cuando Scrape.do lo trae', async () => {
    mockScrapeDoResponse([
      {
        review_id: 'r1',
        rating: 5,
        iso_date: '2024-01-15T00:00:00.000Z',
        user: { name: 'Ana' },
      },
    ]);
    const provider = new GoogleReviewsProvider();

    const reviews = await provider.fetchReviews({
      businessId: 'biz-1',
      googlePlaceId: 'place-1',
    });

    expect(reviews[0].postedAt).toEqual(new Date('2024-01-15T00:00:00.000Z'));
  });

  it('sin `iso_date`, parsea el texto relativo ("hace 2 semanas") a una fecha real, no a hoy', async () => {
    mockScrapeDoResponse([
      {
        review_id: 'r2',
        rating: 4,
        date: 'hace 2 semanas',
        user: { name: 'Beto' },
      },
    ]);
    const provider = new GoogleReviewsProvider();
    const before = Date.now();

    const reviews = await provider.fetchReviews({
      businessId: 'biz-1',
      googlePlaceId: 'place-1',
    });

    const postedAt = reviews[0].postedAt;
    expect(postedAt).not.toBeNull();
    // "hace 2 semanas" desde ahora — nunca "ahora" mismo.
    expect(before - postedAt!.getTime()).toBeGreaterThan(13 * 86_400_000);
  });

  it('sin `iso_date` y sin texto de fecha, `postedAt` es null — nunca "ahora"', async () => {
    mockScrapeDoResponse([
      { review_id: 'r3', rating: 3, user: { name: 'Caro' } },
    ]);
    const provider = new GoogleReviewsProvider();

    const reviews = await provider.fetchReviews({
      businessId: 'biz-1',
      googlePlaceId: 'place-1',
    });

    expect(reviews[0].postedAt).toBeNull();
  });

  it('con texto de fecha en un formato irreconocible, `postedAt` es null — nunca "ahora"', async () => {
    mockScrapeDoResponse([
      {
        review_id: 'r4',
        rating: 2,
        date: 'formato-desconocido-xyz',
        user: { name: 'Dani' },
      },
    ]);
    const provider = new GoogleReviewsProvider();

    const reviews = await provider.fetchReviews({
      businessId: 'biz-1',
      googlePlaceId: 'place-1',
    });

    expect(reviews[0].postedAt).toBeNull();
  });

  it('sin `review_id` y sin fecha determinada, sigue generando un id estable en vez de romper', async () => {
    mockScrapeDoResponse([{ rating: 5, user: { name: 'Elena' } }]);
    const provider = new GoogleReviewsProvider();

    const reviews = await provider.fetchReviews({
      businessId: 'biz-1',
      googlePlaceId: 'place-1',
    });

    expect(reviews).toHaveLength(1);
    expect(reviews[0].googleReviewId).toBeTruthy();
    expect(reviews[0].postedAt).toBeNull();
  });
});
