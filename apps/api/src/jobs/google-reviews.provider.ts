import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

export interface DetectedGoogleReview {
  googleReviewId: string;
  reviewerName: string | null;
  stars: number;
  text: string | null;
  postedAt: Date;
}

// Scrape.do /plugin/google/maps/reviews does not return reviewer photos.
// `user` only contains `name`. To add photos, a different endpoint or a
// headless-browser scrape that captures `user.thumbnail` would be required,
// along with a `reviewerPhotoUrl` column on GoogleReview and object-storage
// proxying to avoid hot-linking Google CDN URLs (they expire).
interface ScrapeDoReview {
  review_id?: string;
  rating?: number;
  iso_date?: string;
  date?: string;
  snippet?: string;
  extracted_snippet?: {
    original?: string;
    translated?: string;
  };
  user?: {
    name?: string;
    // thumbnail?: string; // not delivered by current endpoint
  };
}

interface ScrapeDoReviewsResponse {
  reviews?: ScrapeDoReview[];
  pagination?: {
    next_page_token?: string;
  };
}

const SCRAPE_DO_REVIEWS_ENDPOINT =
  'https://api.scrape.do/plugin/google/maps/reviews';
const SCRAPE_TIMEOUT_MS = 50_000;
const MAX_RETRIES = 2;
const GOOGLE_REVIEWS_PAGE_SIZE = 20;
const GOOGLE_REVIEWS_MAX_PAGES = 3;

@Injectable()
export class GoogleReviewsProvider {
  private readonly logger = new Logger('google-reviews');

  async fetchReviews(input: {
    businessId: string;
    googlePlaceId: string;
    googleRefreshToken?: string | null;
  }): Promise<DetectedGoogleReview[]> {
    const token = process.env.SCRAPE_DO_TOKEN;
    if (!token) {
      this.logger.warn(
        'SCRAPE_DO_TOKEN no configurado — detección de reseñas desactivada.',
      );
      return [];
    }

    const reviews: DetectedGoogleReview[] = [];
    let nextPageToken: string | undefined;

    for (let page = 1; page <= GOOGLE_REVIEWS_MAX_PAGES; page += 1) {
      const payload = await this.fetchReviewsPage({
        token,
        businessId: input.businessId,
        googlePlaceId: input.googlePlaceId,
        nextPageToken,
      });

      reviews.push(...payload.reviews.map(mapScrapeDoReview));
      nextPageToken = payload.nextPageToken;
      if (!nextPageToken) break;
      await sleep(750);
    }

    const unique = new Map<string, DetectedGoogleReview>();
    for (const review of reviews) {
      if (review.stars < 1 || review.stars > 5) continue;
      unique.set(review.googleReviewId, review);
    }

    if (unique.size === 0) {
      this.logger.warn(
        `[google-reviews] WARNING: parsing devolvió 0 reseñas para businessId ${input.businessId} — puede que Google cambió la estructura o el negocio no tenga reseñas disponibles.`,
      );
    } else {
      this.logger.log(
        `[google-reviews] ${unique.size} reseñas detectadas para businessId ${input.businessId}`,
      );
    }

    return [...unique.values()];
  }

  private async fetchReviewsPage(input: {
    token: string;
    businessId: string;
    googlePlaceId: string;
    nextPageToken?: string;
  }) {
    const params = new URLSearchParams({
      token: input.token,
      place_id: input.googlePlaceId,
      num: String(GOOGLE_REVIEWS_PAGE_SIZE),
      sort_by: 'newestFirst',
      hl: 'es',
      gl: 'uy',
    });
    if (input.nextPageToken) {
      params.set('next_page_token', input.nextPageToken);
    }

    const url = `${SCRAPE_DO_REVIEWS_ENDPOINT}?${params.toString()}`;
    const safeUrl = url.replace(input.token, '[REDACTED]');

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const response = await fetchWithTimeout(url);
        const body = await response.text();

        if (!response.ok) {
          const retryable = [429, 502, 503, 504].includes(response.status);
          if (retryable && attempt < MAX_RETRIES) {
            await sleep(1_000 * 2 ** attempt);
            continue;
          }
          throw new Error(
            `[google-reviews] Error para businessId ${input.businessId}: Scrape.do respondió ${response.status} ${response.statusText}. Body: ${body.slice(
              0,
              300,
            )} | Status: ${response.status} | URL: ${safeUrl}`,
          );
        }

        const parsed = JSON.parse(body) as ScrapeDoReviewsResponse;
        return {
          reviews: parsed.reviews ?? [],
          nextPageToken: parsed.pagination?.next_page_token,
        };
      } catch (error) {
        if (attempt < MAX_RETRIES && isRetryableFetchError(error)) {
          await sleep(1_000 * 2 ** attempt);
          continue;
        }
        throw new Error(
          `[google-reviews] Error para businessId ${input.businessId}: ${
            error instanceof Error ? error.message : String(error)
          } | URL: ${safeUrl}`,
        );
      }
    }

    return { reviews: [], nextPageToken: undefined };
  }
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function mapScrapeDoReview(review: ScrapeDoReview): DetectedGoogleReview {
  const reviewerName = review.user?.name?.trim() || null;
  const text =
    review.extracted_snippet?.original?.trim() ||
    review.snippet?.trim() ||
    null;
  const stars = Math.max(
    1,
    Math.min(5, Math.round(Number(review.rating ?? 0))),
  );
  const isoDate = review.iso_date ? new Date(review.iso_date) : null;
  const postedAt =
    isoDate && !Number.isNaN(isoDate.getTime())
      ? isoDate
      : parseGoogleReviewDate(review.date ?? null);

  return {
    googleReviewId:
      review.review_id ??
      hashReviewId({
        reviewerName,
        stars,
        text,
        postedAt,
      }),
    reviewerName,
    stars,
    text,
    postedAt,
  };
}

function isRetryableFetchError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function parseGoogleReviewDate(value: string | null) {
  const now = new Date();
  if (!value) return now;
  const normalized = value.toLowerCase();
  const amount = Number(normalized.match(/\d+/)?.[0] ?? 1);
  const postedAt = new Date(now);

  if (/(minute|minuto)/i.test(normalized)) {
    postedAt.setUTCMinutes(postedAt.getUTCMinutes() - amount);
  } else if (/(hour|hora)/i.test(normalized)) {
    postedAt.setUTCHours(postedAt.getUTCHours() - amount);
  } else if (/(day|día|dia)/i.test(normalized)) {
    postedAt.setUTCDate(postedAt.getUTCDate() - amount);
  } else if (/(week|semana)/i.test(normalized)) {
    postedAt.setUTCDate(postedAt.getUTCDate() - amount * 7);
  } else if (/(month|mes)/i.test(normalized)) {
    postedAt.setUTCMonth(postedAt.getUTCMonth() - amount);
  } else if (/(year|año|ano)/i.test(normalized)) {
    postedAt.setUTCFullYear(postedAt.getUTCFullYear() - amount);
  }

  return postedAt;
}

function hashReviewId(input: {
  reviewerName: string | null;
  stars: number;
  text: string | null;
  postedAt: Date;
}) {
  return createHash('sha256')
    .update(
      [
        input.reviewerName ?? '',
        input.stars.toString(),
        input.text ?? '',
        input.postedAt.toISOString().slice(0, 10),
      ].join('|'),
    )
    .digest('hex')
    .slice(0, 24);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
