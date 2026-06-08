import { redirect } from "next/navigation";
import { apiFetch, isUnauthorizedApiError } from "@/lib/api";
import { getEffectiveApiContext, getSession } from "@/lib/auth";
import TestLabClient from "./test-lab-client";

interface Campaign {
  id: string;
  name: string;
  slug: string;
  status: string;
  channel: string;
  templateKind: string | null;
  messageBody: string | null;
  offerText: string | null;
  destinationType: string;
  destinationUrl: string | null;
  description: string | null;
  _count: { executions: number };
}

interface Widget {
  id: string;
  mode: string;
  status: string;
  minStars: number;
  maxReviewsShown: number;
  primaryColor: string | null;
  position: string | null;
  enabled: boolean;
}

interface Business {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  reviewLandingUrl: string;
  googleBusinessProfileUrl: string | null;
  whatsappUrl: string | null;
  status: string;
  messageQuotaMonthly: number;
  messageCountCurrentMonth: number;
}

interface OverviewResponse {
  business: Business;
  campaigns: Campaign[];
  reviewCount: number;
  activeCampaigns: number;
  widget: Widget | null;
}

export default async function TestLabPage() {
  const session = await getSession();
  if (!session?.activeBusinessId) redirect("/dashboard");
  if (!session.user.isPlatformAdmin) redirect("/dashboard");

  const { accessToken, businessId } = getEffectiveApiContext(session);
  if (!businessId) redirect("/dashboard");

  let overview: OverviewResponse | null = null;
  let error: string | null = null;

  let sessionExpired = false;
  try {
    overview = await apiFetch<OverviewResponse>(
      "/test-lab/overview",
      accessToken,
      { businessId },
    );
  } catch (e) {
    if (isUnauthorizedApiError(e)) sessionExpired = true;
    else error = e instanceof Error ? e.message : "Error al cargar el panel de pruebas";
  }
  if (sessionExpired) redirect("/session-expired");

  if (error || !overview) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="rounded-[12px] border border-red-200 bg-red-50 p-4 text-sm text-[#C0392B]">
          {error ?? "No se pudo cargar el panel de pruebas."}
        </div>
      </div>
    );
  }

  return (
    <TestLabClient
      business={overview.business}
      campaigns={overview.campaigns}
      reviewCount={overview.reviewCount}
      activeCampaigns={overview.activeCampaigns}
      widget={overview.widget}
    />
  );
}
