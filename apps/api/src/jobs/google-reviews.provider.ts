import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

export interface DetectedGoogleReview {
  googleReviewId: string;
  reviewerName: string | null;
  stars: number;
  text: string | null;
  postedAt: Date;
}

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

    const targetUrl = `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(
      input.googlePlaceId,
    )}`;
    const scrapeUrl = `https://api.scrape.do/?token=${encodeURIComponent(
      token,
    )}&url=${encodeURIComponent(targetUrl)}&render=true`;

    const response = await fetch(scrapeUrl);
    if (!response.ok) {
      throw new Error(
        `Scrape.do failed for business ${input.businessId} (${response.status})`,
      );
    }

    const html = await response.text();
    try {
      const reviews = parseGoogleMapsReviews(html);
      this.logger.log(
        `Parsed ${reviews.length} Google reviews for business ${input.businessId}`,
      );
      return reviews;
    } catch (error) {
      throw new Error(
        `Could not parse Google Maps reviews for business ${input.businessId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}

function parseGoogleMapsReviews(html: string): DetectedGoogleReview[] {
  const segments = extractReviewSegments(html);
  const reviews = segments
    .map(parseReviewSegment)
    .filter((review): review is DetectedGoogleReview => Boolean(review));
  const unique = new Map<string, DetectedGoogleReview>();

  for (const review of reviews) {
    if (review.stars < 1 || review.stars > 5) continue;
    unique.set(review.googleReviewId, review);
  }

  return [...unique.values()];
}

function extractReviewSegments(html: string) {
  const anchors = [
    ...findIndexes(html, 'data-review-id='),
    ...findIndexes(html, 'class="jftiEf'),
    ...findIndexes(html, 'class="wiI7pd'),
  ].sort((a, b) => a - b);

  if (anchors.length === 0) return [];

  return anchors.map((index) =>
    html.slice(Math.max(0, index - 2500), Math.min(html.length, index + 9000)),
  );
}

function parseReviewSegment(segment: string): DetectedGoogleReview | null {
  const reviewerName = extractClassText(segment, 'd4r55');
  const stars = extractStars(segment);
  const text = extractClassText(segment, 'wiI7pd');
  const postedAt = parseGoogleReviewDate(extractClassText(segment, 'rsqaWe'));
  const explicitId =
    matchFirst(segment, /data-review-id=["']([^"']+)["']/i) ??
    matchFirst(segment, /reviewId["']?\s*[:=]\s*["']([^"']+)["']/i);

  if (!reviewerName && !text) return null;
  if (!stars) return null;

  const googleReviewId =
    explicitId ??
    hashReviewId({
      reviewerName,
      stars,
      text,
      postedAt,
    });

  return {
    googleReviewId,
    reviewerName,
    stars,
    text,
    postedAt,
  };
}

function extractClassText(segment: string, className: string) {
  const escaped = escapeRegExp(className);
  const pattern = new RegExp(
    `<[^>]+class=["'][^"']*\\b${escaped}\\b[^"']*["'][^>]*>(.*?)<\\/[^>]+>`,
    'is',
  );
  const value = matchFirst(segment, pattern);
  return value ? cleanHtmlText(value) : null;
}

function extractStars(segment: string) {
  const ariaLabels = [...segment.matchAll(/aria-label=["']([^"']+)["']/gi)].map(
    (match) => decodeHtmlEntities(match[1]),
  );
  const ratingLabel = ariaLabels.find((label) =>
    /(\bstar\b|\bstars\b|estrella|estrellas)/i.test(label),
  );
  const value = ratingLabel?.match(/([1-5])(?:[,.]\d+)?/);
  if (value) return Number(value[1]);

  const fallback = segment.match(
    /([1-5])(?:[,.]\d+)?\s*(?:stars?|estrellas?)/i,
  );
  return fallback ? Number(fallback[1]) : null;
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

function findIndexes(value: string, pattern: string) {
  const indexes: number[] = [];
  let index = value.indexOf(pattern);
  while (index !== -1) {
    indexes.push(index);
    index = value.indexOf(pattern, index + pattern.length);
  }
  return indexes;
}

function matchFirst(value: string, pattern: RegExp) {
  return value.match(pattern)?.[1] ?? null;
}

function cleanHtmlText(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
