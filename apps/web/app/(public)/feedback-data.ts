export interface FeedbackData {
  businessName: string;
  businessLogo: string | null;
  googleReviewUrl: string;
}

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export async function getFeedbackData(
  token: string,
): Promise<FeedbackData | null> {
  const res = await fetch(`${API_URL}/feedback/${encodeURIComponent(token)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json() as Promise<FeedbackData>;
}
