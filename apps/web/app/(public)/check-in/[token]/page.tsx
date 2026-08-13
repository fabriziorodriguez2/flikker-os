import { notFound } from "next/navigation";
import { getCheckinToken } from "@/lib/checkin-cookie";
import CheckinClient from "./checkin-client";

export interface PublicBenefit {
  type: string;
  title: string;
  description: string | null;
  terms: string | null;
}

export interface CheckinLanding {
  source: { name: string; type: string };
  business: {
    businessName: string;
    logoUrl: string | null;
    primaryColor: string | null;
    googleBusinessProfileUrl: string | null;
    /** Apariencia de la tarjeta de sellos. Null = usar la marca del negocio. */
    loyaltyCardColor: string | null;
    loyaltyStampColor: string | null;
    loyaltyStampIcon: string | null;
  };
  benefit: PublicBenefit | null;
  benefitText: string | null;
}

const API_URL = process.env.API_URL ?? "http://localhost:3000";

async function getLanding(token: string): Promise<CheckinLanding | null> {
  try {
    const res = await fetch(
      `${API_URL}/public/checkin/${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as CheckinLanding;
  } catch {
    return null;
  }
}

export default async function CheckinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const landing = await getLanding(token);
  if (!landing) notFound();

  // Presence of the cookie tells the client to attempt a recognized check-in
  // first. The actual (state-changing) check-in is a POST from the client — a
  // GET render must stay side-effect free.
  const hasSession = Boolean(await getCheckinToken());

  return (
    <CheckinClient token={token} landing={landing} hasSession={hasSession} />
  );
}
