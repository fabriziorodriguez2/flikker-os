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
  }): Promise<DetectedGoogleReview[]> {
    if (!hasGoogleBusinessProfileCredentials()) {
      this.logger.warn(
        'Google Business Profile credentials are not configured; using stub review detection.',
      );

      return Promise.resolve([this.generateFakeReview(input.businessId)]);
    }

    // TODO: reemplazar el stub por Google Business Profile API:
    // GET https://mybusiness.googleapis.com/v4/accounts/{accountId}/locations/{locationId}/reviews
    // Env vars necesarias:
    // GOOGLE_BUSINESS_PROFILE_CLIENT_ID
    // GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET
    // GOOGLE_BUSINESS_PROFILE_REFRESH_TOKEN
    // y un google_location_id/parent por negocio cuando se modele.
    this.logger.warn(
      `GBP credentials detected, but real integration is pending; using stub for place ${input.googlePlaceId}.`,
    );

    return Promise.resolve([this.generateFakeReview(input.businessId)]);
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
}

function hasGoogleBusinessProfileCredentials() {
  return Boolean(
    process.env.GOOGLE_BUSINESS_PROFILE_CLIENT_ID &&
    process.env.GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET &&
    process.env.GOOGLE_BUSINESS_PROFILE_REFRESH_TOKEN,
  );
}
