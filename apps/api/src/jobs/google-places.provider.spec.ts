import { GooglePlacesProvider } from './google-places.provider';

describe('GooglePlacesProvider', () => {
  const ORIGINAL_KEY = process.env.GOOGLE_PLACES_API_KEY;
  let provider: GooglePlacesProvider;

  beforeEach(() => {
    provider = new GooglePlacesProvider();
  });

  afterEach(() => {
    process.env.GOOGLE_PLACES_API_KEY = ORIGINAL_KEY;
    jest.restoreAllMocks();
  });

  describe('sin GOOGLE_PLACES_API_KEY configurada', () => {
    beforeEach(() => {
      delete process.env.GOOGLE_PLACES_API_KEY;
    });

    it('isAvailable() es false', () => {
      expect(provider.isAvailable()).toBe(false);
    });

    it('searchText devuelve [] sin llamar a fetch', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');
      const result = await provider.searchText('Café Uno');
      expect(result).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('getDetails devuelve null sin llamar a fetch', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');
      const result = await provider.getDetails('some-place-id');
      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('con GOOGLE_PLACES_API_KEY configurada', () => {
    beforeEach(() => {
      process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    });

    it('isAvailable() es true', () => {
      expect(provider.isAvailable()).toBe(true);
    });

    it('searchText llama a Places Text Search con FieldMask y mapea los resultados', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            places: [
              {
                id: 'p1',
                displayName: { text: 'Café Uno' },
                formattedAddress: 'Av. Siempre Viva 123',
                rating: 4.5,
                userRatingCount: 10,
              },
            ],
          }),
      } as Response);

      const result = await provider.searchText('Café Uno');

      expect(result).toEqual([
        {
          placeId: 'p1',
          displayName: 'Café Uno',
          formattedAddress: 'Av. Siempre Viva 123',
          rating: 4.5,
          userRatingCount: 10,
        },
      ]);

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://places.googleapis.com/v1/places:searchText');
      const headers = init.headers as Record<string, string>;
      expect(headers['X-Goog-Api-Key']).toBe('test-key');
      expect(headers['X-Goog-FieldMask']).toContain('places.displayName');
      expect(JSON.parse(init.body as string)).toEqual({
        textQuery: 'Café Uno',
        maxResultCount: 8,
      });
    });

    it('getDetails devuelve writeAReviewUri/reviewsUri de googleMapsLinks', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: 'p1',
            displayName: { text: 'Café Uno' },
            formattedAddress: 'Av. Siempre Viva 123',
            rating: 4.5,
            userRatingCount: 10,
            googleMapsLinks: {
              writeAReviewUri: 'https://g.co/write/p1',
              reviewsUri: 'https://g.co/reviews/p1',
            },
          }),
      } as Response);

      const result = await provider.getDetails('p1');

      expect(result).toEqual({
        placeId: 'p1',
        displayName: 'Café Uno',
        formattedAddress: 'Av. Siempre Viva 123',
        rating: 4.5,
        userRatingCount: 10,
        writeAReviewUri: 'https://g.co/write/p1',
        reviewsUri: 'https://g.co/reviews/p1',
      });
    });

    it('nunca deja pasar la respuesta cruda si Google responde con error — devuelve [] / null', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => '{}',
      } as Response);

      expect(await provider.searchText('x')).toEqual([]);
      expect(await provider.getDetails('bad-id')).toBeNull();
    });

    it('nunca lanza si fetch rechaza (red caída) — degrada a [] / null', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));

      expect(await provider.searchText('x')).toEqual([]);
      expect(await provider.getDetails('p1')).toBeNull();
    });
  });
});
