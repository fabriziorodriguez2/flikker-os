import { redirect } from "next/navigation";
import { apiFetch, isUnauthorizedApiError } from "@/lib/api";
import { getEffectiveApiContext, getSession } from "@/lib/auth";
import RepeatCampaignsSection, {
  type RepeatCampaign,
} from "./repeat-campaigns-section";
import NewCampaignButton from "./new-campaign-button";
import PageHeader from "@/components/ui/page-header";

// ---------------------------------------------------------------------------
// Types matching the backend responses
// ---------------------------------------------------------------------------

interface ActivityItem {
  id: string;
  status: string; // CampaignExecutionStatus: queued | sent | failed | responded
  executedAt: string;
  customer: { id: string; name: string };
  campaign: { id: string; name: string; templateKind: string | null };
  message: { id: string; status: string; sentAt: string | null; deliveredAt: string | null } | null;
}

// ---------------------------------------------------------------------------
// Status mapping
// Whapi webhook tracks: sent, delivered, read → stored in Message.status
// CampaignExecution.status tracks: queued, sent, failed, responded
// "responded" is set when an inbound reply from the customer is detected
// ---------------------------------------------------------------------------

const EXECUTION_STATUS_UI: Record<
  string,
  { label: string; className: string }
> = {
  responded: { label: "respondido", className: "bg-[#EEF7E8] text-[#639922]" },
  delivered: { label: "entregado", className: "bg-[#EEF0FB] text-[#5C6BC0]" },
  read: { label: "leído", className: "bg-[#EEF0FB] text-[#5C6BC0]" },
  sent: { label: "enviado", className: "bg-[#F1F4F9] text-[#8891A4]" },
  failed: { label: "fallido", className: "bg-[#FBEDEC] text-[#C0392B]" },
  queued: { label: "en cola", className: "bg-[#F1F4F9] text-[#8891A4]" },
};

function resolveUiStatus(item: ActivityItem) {
  if (item.status === "responded") return EXECUTION_STATUS_UI.responded;
  const msgStatus = item.message?.status;
  if (msgStatus === "read") return EXECUTION_STATUS_UI.read;
  if (msgStatus === "delivered") return EXECUTION_STATUS_UI.delivered;
  if (item.status === "failed" || msgStatus === "failed") return EXECUTION_STATUS_UI.failed;
  if (item.status === "sent" || msgStatus === "sent") return EXECUTION_STATUS_UI.sent;
  return EXECUTION_STATUS_UI.queued;
}

function formatActivityDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const hhmm = d.toLocaleTimeString("es-UY", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (target.getTime() === today.getTime()) return `hoy ${hhmm}`;
  if (target.getTime() === yesterday.getTime()) return `ayer ${hhmm}`;
  return new Intl.DateTimeFormat("es-UY", {
    day: "numeric",
    month: "short",
  }).format(d);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function CampaignsPage() {
  const session = await getSession();
  if (!session?.activeBusinessId) redirect("/dashboard");

  const { accessToken, businessId } = getEffectiveApiContext(session);
  if (!businessId) redirect("/dashboard");

  let campaigns: RepeatCampaign[] = [];
  let activity: ActivityItem[] = [];
  let error: string | null = null;

  let sessionExpired = false;
  try {
    [campaigns, activity] = await Promise.all([
      apiFetch<RepeatCampaign[]>("/campaigns", accessToken, { businessId }),
      apiFetch<ActivityItem[]>("/campaigns/activity", accessToken, { businessId }),
    ]);
  } catch (e) {
    if (isUnauthorizedApiError(e)) sessionExpired = true;
    else error = e instanceof Error ? e.message : "Error al cargar campañas";
  }
  if (sessionExpired) redirect("/session-expired");

  if (error) {
    return (
      <div className="rounded-[12px] border border-red-200 bg-red-50 p-4 text-sm text-[#C0392B]">
        {error}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Campañas"
        subtitle="Automatizá mensajes y mantené el vínculo con tus clientes."
        actions={<NewCampaignButton />}
      />

      <RepeatCampaignsSection initialCampaigns={campaigns} />

      <section className="overflow-hidden rounded-[12px] border border-[#E8EAF0] bg-white">
        <div className="flex items-start justify-between gap-3 px-5 py-5">
          <div>
            <h2 className="text-base font-bold text-[#1A202C]">
              Actividad reciente
            </h2>
            <p className="mt-1 text-sm text-[#8891A4]">
              Últimos mensajes salidos de tus campañas activas.
            </p>
          </div>
        </div>

        {activity.length === 0 ? (
          <div className="px-5 pb-8 pt-2 text-center text-sm text-[#8891A4]">
            Todavía no hay actividad reciente.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="flk-table w-full min-w-[680px] text-left text-sm">
              <thead className="bg-[#F5F6FA] text-[12px] uppercase tracking-[0.08em] text-[#8891A4]">
                <tr>
                  <th className="px-5 py-3 font-semibold">Cliente</th>
                  <th className="px-5 py-3 font-semibold">Campaña</th>
                  <th className="px-5 py-3 font-semibold">Estado</th>
                  <th className="px-5 py-3 text-right font-semibold">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((item) => {
                  const ui = resolveUiStatus(item);
                  return (
                    <tr
                      key={item.id}
                      className="border-t border-[#E8EAF0] hover:bg-[#FAFBFC]"
                    >
                      <td className="px-5 py-4 font-semibold text-[#1A202C]">
                        {item.customer.name}
                      </td>
                      <td className="px-5 py-4 text-[#1A202C]">
                        {item.campaign.name}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ui.className}`}
                        >
                          {ui.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right text-[#8891A4]">
                        {formatActivityDate(item.executedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
