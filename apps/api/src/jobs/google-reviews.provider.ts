import { Injectable, Logger } from '@nestjs/common';

export interface DetectedGoogleReview {
  googleReviewId: string;
  reviewerName: string | null;
  stars: number;
  text: string | null;
  postedAt: Date;
}

@Injectable()
export class GoogleReviewsProvider {
  private readonly logger = new Logger(GoogleReviewsProvider.name);

  fetchReviews(input: {
    businessId: string;
    googlePlaceId: string;
    googleRefreshToken?: string | null;
  }): Promise<DetectedGoogleReview[]> {
    if (!hasGoogleBusinessProfileAppCredentials()) {
      this.logger.warn(
        'Google Business Profile app credentials are not configured; review detection is disabled in production.',
      );

      return Promise.resolve(this.devStubReviews(input.businessId));
    }

    if (!input.googleRefreshToken) {
      this.logger.warn(
        `Business ${input.businessId} has no Google refresh token; skipping review detection.`,
      );

      return Promise.resolve([]);
    }

    // TODO: reemplazar el stub por Google Business Profile API:
    // GET https://mybusiness.googleapis.com/v4/accounts/{accountId}/locations/{locationId}/reviews
    // Env vars necesarias:
    // GOOGLE_BUSINESS_PROFILE_CLIENT_ID
    // GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET
    // El refresh token sale de Business.googleRefreshToken, obtenido por OAuth
    // durante onboarding del negocio.
    this.logger.warn(
      `GBP OAuth token found for business ${input.businessId}, but real integration is pending; using development stub for place ${input.googlePlaceId}.`,
    );

    return Promise.resolve(this.devStubReviews(input.businessId));
  }

  generateFakeReview(businessId: string): DetectedGoogleReview {
    const dateKey = new Date().toISOString().slice(0, 10);

    return {
      googleReviewId: `stub-${businessId}-${dateKey}`,
      reviewerName: 'Paciente Demo',
      stars: 5,
      text: 'STUB: reseña detectada para desarrollo.',
      postedAt: new Date(),
    };
  }

  private devStubReviews(businessId: string): DetectedGoogleReview[] {
    if (process.env.NODE_ENV === 'production') {
      return [];
    }

    return [this.generateFakeReview(businessId)];
  }
}

function hasGoogleBusinessProfileAppCredentials() {
  return Boolean(
    process.env.GOOGLE_BUSINESS_PROFILE_CLIENT_ID &&
    process.env.GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET,
  );
}
