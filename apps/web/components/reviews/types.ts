export interface ReviewCampaignSummary {
  id: string;
  name: string;
  slug?: string;
}

export interface ReviewResponderSummary {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

export interface ReviewSummary {
  id: string;
  rating: number;
  authorDisplayName: string | null;
  reviewedAt: string;
  content: string | null;
  campaign: ReviewCampaignSummary | null;
  respondedAt: string | null;
  respondedBy: ReviewResponderSummary | null;
  isHighlighted: boolean;
  status: string;
}

export interface ReviewsResponse {
  data: ReviewSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface ReviewFiltersState {
  responded?: string;
  highlighted?: string;
  campaignId?: string;
  rating?: string;
}

export interface ReviewDetail extends ReviewSummary {
  source: string;
  externalReviewId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewResponseAuthor {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

export interface ReviewResponse {
  id: string;
  businessId: string;
  reviewId: string;
  content: string;
  respondedAt: string;
  respondedByUserId: string;
  createdAt: string;
  updatedAt: string;
  respondedBy: ReviewResponseAuthor;
}
