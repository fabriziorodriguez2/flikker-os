export interface FeedbackData {
  businessName: string;
  businessLogo: string | null;
  /**
   * `null` solo es posible en Check-in V2, donde el feedback interno vale por
   * sí solo y Google es un paso opcional. LEGACY sigue garantizando una URL
   * (sin ella su landing devuelve 404, como siempre).
   */
  googleReviewUrl: string | null;
  /** Decide qué landing se renderiza — ver `r/[token]/page.tsx`. */
  experienceVersion?: "LEGACY" | "CHECKIN_V2";
  /** El cliente ya había contestado este mismo link. */
  alreadySubmitted?: boolean;
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
