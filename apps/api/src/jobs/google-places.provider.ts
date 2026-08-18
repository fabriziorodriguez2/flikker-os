import { Injectable, Logger } from '@nestjs/common';

/**
 * Google Places API (New) — Text Search + Place Details. Server-side only:
 * la key nunca se manda al frontend (mismo criterio que `SCRAPE_DO_TOKEN`).
 *
 * A propósito NO usa Places Autocomplete ni Business Profile API — el pedido
 * es "buscar el negocio por nombre, guardar el Place ID, mostrar rating y
 * links de Maps", y Text Search + Place Details alcanzan para eso. Ambos
 * endpoints requieren un FieldMask explícito (`X-Goog-FieldMask`) — Google
 * cobra por campo pedido, así que solo se pide lo que esta pantalla
 * realmente usa.
 *
 * Sigue el mismo patrón de `GoogleReviewsProvider` (fetch nativo,
 * AbortController + timeout, reintento con backoff en 429/5xx) — no se
 * introduce axios ni otro cliente HTTP nuevo.
 */
export interface PlaceSearchResult {
  placeId: string;
  displayName: string;
  formattedAddress: string | null;
  rating: number | null;
  userRatingCount: number | null;
}

export interface PlaceDetails extends PlaceSearchResult {
  writeAReviewUri: string | null;
  reviewsUri: string | null;
}

interface GooglePlaceApiShape {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsLinks?: {
    writeAReviewUri?: string;
    reviewsUri?: string;
  };
}

const SEARCH_ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const DETAILS_ENDPOINT = 'https://places.googleapis.com/v1/places';
const SEARCH_FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount';
const DETAILS_FIELD_MASK =
  'id,displayName,formattedAddress,rating,userRatingCount,googleMapsLinks.writeAReviewUri,googleMapsLinks.reviewsUri';
const TIMEOUT_MS = 8_000;
const MAX_RETRIES = 2;
const MAX_RESULTS = 8;

function toSearchResult(place: GooglePlaceApiShape): PlaceSearchResult | null {
  if (!place.id || !place.displayName?.text) return null;
  return {
    placeId: place.id,
    displayName: place.displayName.text,
    formattedAddress: place.formattedAddress ?? null,
    rating: place.rating ?? null,
    userRatingCount: place.userRatingCount ?? null,
  };
}

@Injectable()
export class GooglePlacesProvider {
  private readonly logger = new Logger('google-places');

  /**
   * Nunca hardcodeado a `true` — el panel usa esto para mostrar "no
   * disponible" en vez de un buscador roto cuando todavía no se configuró
   * `GOOGLE_PLACES_API_KEY` (mismo patrón que `SimulationConfigService`).
   */
  isAvailable(): boolean {
    return Boolean(process.env.GOOGLE_PLACES_API_KEY);
  }

  async searchText(query: string): Promise<PlaceSearchResult[]> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'GOOGLE_PLACES_API_KEY no configurado — búsqueda de Google Places desactivada.',
      );
      return [];
    }

    const body = await this.request(apiKey, SEARCH_ENDPOINT, SEARCH_FIELD_MASK, {
      method: 'POST',
      body: JSON.stringify({ textQuery: query, maxResultCount: MAX_RESULTS }),
    });
    if (!body) return [];

    const parsed = JSON.parse(body) as { places?: GooglePlaceApiShape[] };
    return (parsed.places ?? [])
      .map(toSearchResult)
      .filter((p): p is PlaceSearchResult => p !== null);
  }

  async getDetails(placeId: string): Promise<PlaceDetails | null> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'GOOGLE_PLACES_API_KEY no configurado — no se pueden obtener detalles del Place.',
      );
      return null;
    }

    const body = await this.request(
      apiKey,
      `${DETAILS_ENDPOINT}/${encodeURIComponent(placeId)}`,
      DETAILS_FIELD_MASK,
      { method: 'GET' },
    );
    if (!body) return null;

    const place = JSON.parse(body) as GooglePlaceApiShape;
    const base = toSearchResult(place);
    if (!base) return null;

    return {
      ...base,
      writeAReviewUri: place.googleMapsLinks?.writeAReviewUri ?? null,
      reviewsUri: place.googleMapsLinks?.reviewsUri ?? null,
    };
  }

  private async request(
    apiKey: string,
    url: string,
    fieldMask: string,
    init: { method: 'GET' | 'POST'; body?: string },
  ): Promise<string | null> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const response = await fetchWithTimeout(url, {
          method: init.method,
          headers: {
            'Content-Type': 'application/json',
            // Nunca loguear estos dos headers — la key y el mask viajan acá.
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': fieldMask,
          },
          body: init.body,
        });

        if (!response.ok) {
          const retryable = [429, 500, 502, 503, 504].includes(response.status);
          if (retryable && attempt < MAX_RETRIES) {
            await sleep(500 * 2 ** attempt);
            continue;
          }
          // Google devuelve el motivo real en el body (ej. "API not enabled",
          // "billing not enabled", "API key not valid") — sin esto, un 403/400
          // era indistinguible en los logs y había que adivinar la causa.
          // Nunca incluir el header Authorization/API key en el log.
          const errorBody = await response.text().catch(() => '');
          this.logger.warn(
            `Google Places respondió ${response.status} ${response.statusText}: ${errorBody.slice(0, 500)}`,
          );
          return null;
        }

        return await response.text();
      } catch (error) {
        if (attempt < MAX_RETRIES && isRetryableFetchError(error)) {
          await sleep(500 * 2 ** attempt);
          continue;
        }
        this.logger.warn(
          `Google Places request failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      }
    }
    return null;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function isRetryableFetchError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
