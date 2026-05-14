import Link from "next/link";
import { Clock3, Edit2, Gift, UserRound } from "lucide-react";
import { redirect } from "next/navigation";
import { apiFetch, isUnauthorizedApiError } from "@/lib/api";
import { getEffectiveApiContext, getSession } from "@/lib/auth";
import CampaignStatusToggle from "@/components/campaigns/campaign-status-toggle";

interface Campaign {
  id: string;
  name: string;
  slug: string;
  status: string;
  channel: string;
  description: string | null;
  templateKind: string | null;
  triggerOffsetDays: number | null;
  offerText?: string | null;
  _count: { qrCodes: number; scanEvents: number; executions?: number };
}

const RECENT_ACTIVITY = [
  {
    patient: "Camila Fernández",
    campaign: "Pedido de reseña post-servicio",
    status: "respondido",
    date: "hoy 11:42",
  },
  {
    patient: "Sofía Bentancur",
    campaign: "Pedido de reseña post-servicio",
    status: "entregado",
    date: "hoy 10:18",
  },
  {
    patient: "Diego Pereira",
    campaign: "Reactivación de pacientes",
    status: "enviado",
    date: "hoy 09:05",
  },
  {
    patient: "Federico Lamas",
    campaign: "Reactivación de pacientes",
    status: "fallido",
    date: "ayer 17:21",
  },
  {
    patient: "Valentina Ríos",
    campaign: "Pedido de reseña post-servicio",
    status: "respondido",
    date: "ayer 14:08",
  },
];

function statusLabel(status: string) {
  return status === "ACTIVE" ? "activa" : "inactiva";
}

function CampaignIcon({ kind }: { kind: string | null }) {
  const className = "h-5 w-5";
  if (kind === "birthday") return <Gift className={className} />;
  if (kind === "reactivation") return <UserRound className={className} />;
  return <Clock3 className={className} />;
}

function descriptionFor(campaign: Campaign) {
  if (campaign.templateKind === "birthday") {
    return "Se envía el día del cumpleaños del paciente.";
  }
  if (campaign.templateKind === "reactivation") {
    return "Para pacientes que no vinieron en más de 6 meses.";
  }
  return campaign.description || "Se envía automáticamente después de cada atención.";
}

function metadataFor(campaign: Campaign) {
  if (campaign.templateKind === "birthday") {
    return "WhatsApp · 09:00 hora local · texto editable";
  }
  if (campaign.templateKind === "reactivation") {
    return "WhatsApp · primer martes de cada mes · 10:00";
  }
  const offset = campaign.triggerOffsetDays ?? 0;
  return `WhatsApp · ${offset > 0 ? `${offset} días` : "30 min"} después del check-out · pacientes con consentimiento`;
}

function reviewCountFor(campaign: Campaign) {
  return Math.round((campaign._count.executions ?? 0) * 0.5);
}

function badgeClass(status: string) {
  return status === "ACTIVE"
    ? "bg-[#EEF7E8] text-[#639922]"
    : "bg-[#F1F4F9] text-[#8891A4]";
}

function activityBadgeClass(status: string) {
  const classes: Record<string, string> = {
    respondido: "bg-[#EEF7E8] text-[#639922]",
    entregado: "bg-[#EEF0FB] text-[#5C6BC0]",
    enviado: "bg-[#F1F4F9] text-[#8891A4]",
    fallido: "bg-[#FBEDEC] text-[#C0392B]",
  };
  return classes[status] ?? classes.enviado;
}

export default async function CampaignsPage() {
  const session = await getSession();
  if (!session?.activeBusinessId) redirect("/dashboard");

  const { accessToken, businessId } = getEffectiveApiContext(session);
  if (!businessId) redirect("/dashboard");

  let campaigns: Campaign[] = [];
  let error: string | null = null;

  try {
    campaigns = await apiFetch<Campaign[]>("/campaigns", accessToken, {
      businessId,
    });
  } catch (e) {
    if (isUnauthorizedApiError(e)) redirect("/session-expired");
    error = e instanceof Error ? e.message : "Error al cargar campañas";
  }

  const activeCount = campaigns.filter((campaign) => campaign.status === "ACTIVE").length;

  if (error) {
    return (
      <div className="rounded-[12px] border border-red-200 bg-red-50 p-4 text-sm text-[#C0392B]">
        {error}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <h1 className="font-display text-[22px] font-bold text-[#1A202C]">
        Campañas
      </h1>

      <section className="rounded-[12px] border border-[#E8EAF0] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#1A202C]">
              Campañas automáticas
            </h2>
            <p className="mt-1 text-sm text-[#8891A4]">
              Las 3 campañas Repeat vienen pre-armadas. Activá o pausá cuando quieras.
            </p>
          </div>
          <span className="rounded-full bg-[#EEF7E8] px-3 py-1 text-xs font-semibold text-[#639922]">
            {activeCount} activas
          </span>
        </div>

        <div className="mt-5 space-y-3">
          {campaigns.map((campaign) => (
            <article
              key={campaign.id}
              className="flex flex-wrap items-center gap-4 rounded-[12px] border border-[#E8EAF0] bg-white p-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[#EEF0FB] text-[#5C6BC0]">
                <CampaignIcon kind={campaign.templateKind} />
              </div>

              <div className="min-w-[240px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-[#1A202C]">
                    {campaign.name}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeClass(campaign.status)}`}
                  >
                    {statusLabel(campaign.status)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[#8891A4]">
                  {descriptionFor(campaign)}
                </p>
                <p className="mt-1 text-[11px] font-medium text-[#8891A4]">
                  {metadataFor(campaign)}
                </p>
              </div>

              <div className="hidden h-12 w-px bg-[#E8EAF0] lg:block" />

              <div className="grid grid-cols-2 gap-5 text-center">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#8891A4]">
                    Enviados mes
                  </p>
                  <p className="mt-1 text-lg font-bold text-[#1A202C]">
                    {campaign._count.executions ?? 0}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#8891A4]">
                    Reseñas
                  </p>
                  <p className="mt-1 text-lg font-bold text-[#639922]">
                    {reviewCountFor(campaign)}
                  </p>
                </div>
              </div>

              <CampaignStatusToggle
                campaignId={campaign.id}
                initialStatus={campaign.status}
              />
              <Link
                href={`/dashboard/campaigns/${campaign.id}`}
                className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#E8EAF0] px-3 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA]"
              >
                <Edit2 className="h-4 w-4" />
                Editar
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-[12px] border border-[#E8EAF0] bg-white">
        <div className="flex items-start justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-[#1A202C]">
              Actividad reciente
            </h2>
            <p className="mt-1 text-sm text-[#8891A4]">
              Últimos mensajes salidos de tus campañas activas.
            </p>
          </div>
          <Link href="/dashboard/campaigns" className="text-sm font-semibold text-[#5C6BC0]">
            Ver todo
          </Link>
        </div>
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-[#F5F6FA] text-[11px] uppercase tracking-[0.08em] text-[#8891A4]">
            <tr>
              <th className="px-4 py-3 font-semibold">Paciente</th>
              <th className="px-4 py-3 font-semibold">Campaña</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 text-right font-semibold">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {RECENT_ACTIVITY.map((item) => (
              <tr key={`${item.patient}-${item.date}`} className="border-t border-[#E8EAF0]">
                <td className="px-4 py-4 font-semibold text-[#1A202C]">
                  {item.patient}
                </td>
                <td className="px-4 py-4 text-[#1A202C]">{item.campaign}</td>
                <td className="px-4 py-4">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${activityBadgeClass(item.status)}`}
                  >
                    {item.status}
                  </span>
                </td>
                <td className="px-4 py-4 text-right text-[#1A202C]">
                  {item.date}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
