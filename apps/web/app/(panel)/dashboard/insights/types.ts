export interface InsightStatement {
  id: string;
  statement: string;
  kind: "positive" | "warning" | "neutral";
  hasEnoughData: boolean;
}

export interface BusinessImpactMetricsView {
  sinceFlikker: {
    windowStart: string;
    anchor: "onboarding" | "created";
    customersIdentified: number;
    customersReturned: number;
    customersReturnedAfterContact: number;
    benefitsRedeemed: number;
    newReviews: number;
  };
  lifetime: {
    benefitsIssued: number;
    cardsInProgress: number;
  };
  hasEnoughRetentionEvidence: boolean;
}

export interface InsightsMetricsView {
  totalCustomers: number;
  newCustomersInWindow: number;
  windowDays: number;
  returningCustomers: number;
  segmentCounts: Record<string, number>;
  visitTrend: Array<{
    days: 7 | 30 | 90;
    current: number;
    previous: number;
  }>;
  stampCard: {
    customersParticipating: number;
    cardsInProgress: number;
    unlockedTotal: number;
    redeemedTotal: number;
  };
  benefitsRedeemedInWindow: number;
  benefitStats: Array<{
    source: string;
    issued: number;
    redeemed: number;
  }>;
  reviewStats: {
    googleReviewsTotal: number | null;
    googleReviewsImported: number;
    sinceFlikker: number;
    googleRating: number | null;
    importedRating: number | null;
    historySyncStatus: "idle" | "running" | "done" | "partial";
    inPeriod: number;
    feedbackInPeriod: number;
  };
}

export function percentage(part: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((part / total) * 100);
}

export function comparisonPercentage(
  current: number,
  previous: number,
): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
