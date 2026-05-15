"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock3, Edit2, Gift, UserRound } from "lucide-react";
import CampaignStatusToggle from "@/components/campaigns/campaign-status-toggle";

export interface RepeatCampaign {
  id: string;
  name: string;
  slug: string;
  status: string;
  templateKind: string | null;
  triggerOffsetDays: number | null;
  description: string | null;
  monthlySent: number;
  respondedTotal: number;
}

function CampaignIcon({ kind }: { kind: string | null }) {
  const cls = "h-5 w-5";
  if (kind === "birthday") return <Gift className={cls} />;
  if (kind === "reactivation") return <UserRound className={cls} />;
  return <Clock3 className={cls} />;
}

function titleFor(c: RepeatCampaign) {
  if (c.templateKind === "post_service") return "Repeat: post-servicio";
  return c.name;
}

function descriptionFor(c: RepeatCampaign) {
  if (c.templateKind === "birthday") {
    return "Se envía el día del cumpleaños del paciente.";
  }
  if (c.templateKind === "reactivation") {
    return "Para pacientes que no vinieron en más de 6 meses.";
  }
  if (c.templateKind === "post_service") {
    return "Mensaje automático luego de la atención.";
  }
  return c.description ?? "Campaña automática.";
}

function metadataFor(c: RepeatCampaign) {
  if (c.templateKind === "birthday") {
    return "WhatsApp · 09:00 hora local · texto editable";
  }
  if (c.templateKind === "reactivation") {
    return "WhatsApp · primer martes de cada mes · 10:00";
  }
  return "WhatsApp · 30 minutos después de atendido · pacientes con consentimiento";
}

function statusBadgeClass(status: string) {
  return status === "ACTIVE"
    ? "bg-[#EEF7E8] text-[#639922]"
    : "bg-[#F1F4F9] text-[#8891A4]";
}

export default function RepeatCampaignsSection({
  initialCampaigns,
}: {
  initialCampaigns: RepeatCampaign[];
}) {
  const [campaigns, setCampaigns] = useState<RepeatCampaign[]>(initialCampaigns);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const activeCount = campaigns.filter((c) => c.status === "ACTIVE").length;

  async function toggleCampaign(id: string) {
    const campaign = campaigns.find((c) => c.id === id);
    if (!campaign) return;

    const nextStatus = campaign.status === "ACTIVE" ? "PAUSED" : "ACTIVE";

    setCampaigns((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: nextStatus } : c)),
    );
    setSavingIds((prev) => new Set([...prev, id]));
    setErrors((prev) => ({ ...prev, [id]: "" }));

    try {
      const res = await fetch(`/api/proxy/campaigns/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!res.ok) {
        setCampaigns((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: campaign.status } : c)),
        );
        setErrors((prev) => ({
          ...prev,
          [id]: "No se pudo guardar el cambio.",
        }));
      }
    } catch {
      setCampaigns((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: campaign.status } : c)),
      );
      setErrors((prev) => ({ ...prev, [id]: "Error de red. Intentá de nuevo." }));
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
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
          {activeCount} {activeCount === 1 ? "activa" : "activas"}
        </span>
      </div>

      <div className="mt-5 space-y-3">
        {campaigns.map((campaign) => (
          <article
            key={campaign.id}
            className="grid items-center gap-4 rounded-[12px] border border-[#E8EAF0] bg-white p-4 lg:grid-cols-[40px_minmax(0,1fr)_1px_156px_44px_88px]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[#EEF0FB] text-[#5C6BC0]">
              <CampaignIcon kind={campaign.templateKind} />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-[#1A202C]">
                  {titleFor(campaign)}
                </h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(campaign.status)}`}
                >
                  {campaign.status === "ACTIVE" ? "activa" : "inactiva"}
                </span>
              </div>
              <p className="mt-1 text-sm text-[#8891A4]">
                {descriptionFor(campaign)}
              </p>
              <p className="mt-1 text-[11px] font-medium text-[#8891A4]">
                {metadataFor(campaign)}
              </p>
              {errors[campaign.id] ? (
                <p className="mt-1 text-[11px] font-semibold text-[#C0392B]">
                  {errors[campaign.id]}
                </p>
              ) : null}
            </div>

            <div className="hidden h-12 w-px bg-[#E8EAF0] lg:block" />

            <div className="grid grid-cols-2 gap-5 text-center">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#8891A4]">
                  Enviados mes
                </p>
                <p className="mt-1 text-lg font-bold text-[#1A202C]">
                  {campaign.monthlySent}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#8891A4]">
                  Reseñas
                </p>
                <p className="mt-1 text-lg font-bold text-[#639922]">
                  {campaign.respondedTotal}
                </p>
              </div>
            </div>

            <CampaignStatusToggle
              active={campaign.status === "ACTIVE"}
              saving={savingIds.has(campaign.id)}
              onToggle={() => void toggleCampaign(campaign.id)}
            />

            <div className="flex justify-end">
              {campaign.templateKind !== "post_service" ? (
                <Link
                  href={`/dashboard/campaigns/${campaign.id}`}
                  className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#E8EAF0] px-3 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA]"
                >
                  <Edit2 className="h-4 w-4" />
                  Editar
                </Link>
              ) : (
                <span className="h-9 w-[88px]" aria-hidden="true" />
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
