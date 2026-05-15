import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { apiFetch, isUnauthorizedApiError } from "@/lib/api";
import { getEffectiveApiContext, getSession } from "@/lib/auth";
import CampaignEditForm from "@/components/campaigns/campaign-edit-form";

interface Campaign {
  id: string;
  name: string;
  status: string;
  channel: string;
  templateKind: string | null;
  triggerOffsetDays: number | null;
  messageBody: string | null;
  offerText: string | null;
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.activeBusinessId) redirect("/dashboard");

  const { accessToken, businessId } = getEffectiveApiContext(session);
  if (!businessId) redirect("/dashboard");

  let campaign: Campaign | null = null;
  let error: string | null = null;

  try {
    campaign = await apiFetch<Campaign>(`/campaigns/${id}`, accessToken, {
      businessId,
    });
  } catch (e) {
    if (isUnauthorizedApiError(e)) redirect("/session-expired");
    error = e instanceof Error ? e.message : "Error al cargar campaña";
  }

  if (error || !campaign) {
    return (
      <div className="mx-auto max-w-4xl">
        <Link
          href="/dashboard/campaigns"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#5C6BC0]"
        >
          <ChevronLeft className="h-4 w-4" />
          Volver a Campañas
        </Link>
        <div className="mt-4 rounded-[12px] border border-red-200 bg-red-50 p-4 text-sm text-[#C0392B]">
          {error  "Campaña no encontrada"}
        </div>
      </div>
    );
  }

  if (campaign.templateKind === "post_service") {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Link
          href="/dashboard/campaigns"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#5C6BC0]"
        >
          <ChevronLeft className="h-4 w-4" />
          Volver a Campañas
        </Link>
        <div className="rounded-[12px] border border-[#E8EAF0] bg-white px-6 py-8 text-center">
          <p className="text-base font-semibold text-[#1A202C]">
            Esta campaña no es editable
          </p>
          <p className="mt-1.5 text-sm text-[#8891A4]">
            Repeat: post-servicio se activa automáticamente luego de cada atención.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link
        href="/dashboard/campaigns"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#5C6BC0]"
      >
        <ChevronLeft className="h-4 w-4" />
        Volver a Campañas
      </Link>

      <div>
        <h1 className="font-display text-[22px] font-bold text-[#1A202C]">
          Editar campaña
        </h1>
        <p className="mt-1 text-sm text-[#8891A4]">{campaign.name}</p>
      </div>

      <CampaignEditForm campaign={campaign} />
    </div>
  );
}
