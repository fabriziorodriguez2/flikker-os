"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Clock3, Edit2, Gift, QrCode, UserRound } from "lucide-react";
import CampaignStatusToggle from "@/components/campaigns/campaign-status-toggle";

export interface RepeatCampaign {
  id: string;
  name: string;
  slug: string;
  status: string;
  templateKind: string | null;
  triggerOffsetDays: number | null;
  reviewRequestDelayHours: number | null;
  description: string | null;
  monthlySent: number;
  respondedTotal: number; // kept for API compat, not displayed
}

function CampaignIcon({ kind }: { kind: string | null }) {
  const cls = "h-5 w-5";
  if (kind === "birthday") return <Gift className={cls} />;
  if (kind === "reactivation") return <UserRound className={cls} />;
  if (kind === "qr_capture") return <QrCode className={cls} />;
  return <Clock3 className={cls} />;
}

function titleFor(c: RepeatCampaign) {
  if (c.templateKind === "post_service") return "Repeat: post-servicio";
  return c.name;
}

function descriptionFor(c: RepeatCampaign) {
  if (c.templateKind === "birthday") {
    return "Se envía el día del cumpleaños del cliente.";
  }
  if (c.templateKind === "reactivation") {
    return "Para clientes que no vinieron en más de 6 meses.";
  }
  if (c.templateKind === "post_service") {
    return "Mensaje automático luego de la atención.";
  }
  if (c.templateKind === "qr_capture") {
    return "Captación de contactos vía QR. Activá para que el landing funcione.";
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
  if (c.templateKind === "qr_capture") {
    return "Sin mensajes automáticos · registra scans al landing";
  }
  return "WhatsApp · clientes con consentimiento";
}

function formatDelay(hours: number | null): string {
  const h = hours ?? 24;
  if (h < 24) return `${h} ${h === 1 ? "hora" : "horas"} después del pedido`;
  const days = Math.round(h / 24);
  return `${days} ${days === 1 ? "día" : "días"} después del pedido`;
}

function DelayEditor({
  campaignId,
  initialHours,
  onSaved,
}: {
  campaignId: string;
  initialHours: number | null;
  onSaved: (hours: number) => void;
}) {
  const h = initialHours ?? 24;
  const startUnit = h % 24 === 0 ? "days" : "hours";
  const startValue = startUnit === "days" ? Math.round(h / 24) : h;

  const [value, setValue] = useState(String(startValue));
  const [unit, setUnit] = useState<"hours" | "days">(startUnit);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const n = Number(value);
    if (!n || n < 1) return;
    const hours = unit === "days" ? n * 24 : n;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/proxy/campaigns/${campaignId}/repeats`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewRequestDelayHours: hours }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      setSaved(true);
      onSaved(hours);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        type="number"
        min={1}
        max={unit === "days" ? 90 : 2160}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-16 rounded-lg border border-[#E8EAF0] px-2 py-1 text-sm text-[#1A202C] focus:border-[#5C6BC0] focus:outline-none"
      />
      <select
        value={unit}
        onChange={(e) => setUnit(e.target.value as "hours" | "days")}
        className="rounded-lg border border-[#E8EAF0] px-2 py-1 text-sm text-[#1A202C] focus:border-[#5C6BC0] focus:outline-none"
      >
        <option value="hours">horas</option>
        <option value="days">días</option>
      </select>
      <button
        type="button"
        disabled={saving || !value || Number(value) < 1}
        onClick={() => void handleSave()}
        className="flex items-center gap-1 rounded-lg bg-[#5C6BC0] px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-[#4a58a8] disabled:opacity-50"
      >
        {saved ? <Check className="h-3.5 w-3.5" /> : saving ? "…" : "Guardar"}
      </button>
      {error && <span className="text-xs text-[#C0392B]">{error}</span>}
    </div>
  );
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
            Las campañas automáticas vienen pre-armadas. Activá o pausá cuando quieras.
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
            className="grid items-center gap-4 rounded-[12px] border border-[#E8EAF0] bg-white p-4 lg:grid-cols-[40px_minmax(0,1fr)_1px_80px_44px_88px]"
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
              {campaign.templateKind === "post_service" ? (
                <DelayEditor
                  campaignId={campaign.id}
                  initialHours={campaign.reviewRequestDelayHours}
                  onSaved={(hours) =>
                    setCampaigns((prev) =>
                      prev.map((c) =>
                        c.id === campaign.id
                          ? { ...c, reviewRequestDelayHours: hours }
                          : c,
                      ),
                    )
                  }
                />
              ) : (
                <p className="mt-1 text-[11px] font-medium text-[#8891A4]">
                  {metadataFor(campaign)}
                </p>
              )}
              {errors[campaign.id] ? (
                <p className="mt-1 text-[11px] font-semibold text-[#C0392B]">
                  {errors[campaign.id]}
                </p>
              ) : null}
            </div>

            <div className="hidden h-12 w-px bg-[#E8EAF0] lg:block" />

            <div className="text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#8891A4]">
                Enviados mes
              </p>
              <p className="mt-1 text-lg font-bold text-[#1A202C]">
                {campaign.monthlySent}
              </p>
            </div>

            <CampaignStatusToggle
              active={campaign.status === "ACTIVE"}
              saving={savingIds.has(campaign.id)}
              onToggle={() => void toggleCampaign(campaign.id)}
            />

            <div className="flex justify-end">
              {campaign.templateKind === "qr_capture" ? (
                <Link
                  href="/dashboard/qr"
                  className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#E8EAF0] px-3 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA]"
                >
                  <QrCode className="h-4 w-4" />
                  Ver QR
                </Link>
              ) : campaign.templateKind !== "post_service" ? (
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
