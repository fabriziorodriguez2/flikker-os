"use client";

import { useState } from "react";
import Link from "next/link";
import Switch from "@/components/ui/switch";

interface CampaignEditFormProps {
  campaign: {
    id: string;
    name: string;
    status: string;
    channel: string;
    templateKind: string | null;
    triggerOffsetDays: number | null;
    messageBody: string | null;
    offerText: string | null;
  };
}

function isBirthdayCampaign(kind: string | null) {
  return kind === "birthday";
}

function conditionText(kind: string | null, offset: string) {
  if (kind === "birthday") return "Cumpleaños del cliente";
  if (kind === "reactivation") return "Sin atención registrada en 6 meses";
  return `Después de la atención (${offset || "0"} días de offset)`;
}

export default function CampaignEditForm({ campaign }: CampaignEditFormProps) {
  const [name, setName] = useState(campaign.name);
  const [active, setActive] = useState(campaign.status === "ACTIVE");
  const [messageBody, setMessageBody] = useState(campaign.messageBody ?? "");
  const [offset, setOffset] = useState(String(campaign.triggerOffsetDays ?? 0));
  const [offer, setOffer] = useState(campaign.offerText ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const nextStatus = active
        ? "ACTIVE"
        : campaign.status === "ACTIVE"
          ? "PAUSED"
          : campaign.status;
      const shouldUpdateStatus = nextStatus !== campaign.status;
      const [campaignRes, repeatRes, statusRes] = await Promise.all([
        fetch(`/api/proxy/campaigns/${campaign.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        }),
        campaign.templateKind
          ? fetch(`/api/proxy/campaigns/${campaign.id}/repeats`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messageBody,
                triggerOffsetDays: Number(offset),
                offerText: offer,
              }),
            })
          : Promise.resolve(new Response(null, { status: 200 })),
        shouldUpdateStatus
          ? fetch(`/api/proxy/campaigns/${campaign.id}/status`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: nextStatus }),
            })
          : Promise.resolve(new Response(null, { status: 200 })),
      ]);

      if (!campaignRes.ok || !repeatRes.ok || !statusRes.ok) {
        throw new Error("No pudimos guardar los cambios");
      }
      setMessage("Cambios guardados.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={save}
      className="rounded-[12px] border border-[#E8EAF0] bg-white p-6"
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <label className="grid gap-2 text-sm font-semibold text-[#1A202C]">
            Nombre de campaña
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-10 rounded-[8px] border border-[#E8EAF0] px-3 text-sm outline-none focus:border-[#5C6BC0]"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[8px] border border-[#E8EAF0] bg-[#F5F6FA] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#8891A4]">
                Canal
              </p>
              <p className="mt-2 text-sm font-semibold text-[#1A202C]">
                WhatsApp
              </p>
            </div>
            <div className="rounded-[8px] border border-[#E8EAF0] bg-[#F5F6FA] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#8891A4]">
                Audiencia / condición
              </p>
              <p className="mt-2 text-sm font-semibold text-[#1A202C]">
                {conditionText(campaign.templateKind, offset)}
              </p>
            </div>
          </div>

          <label className="grid gap-2 text-sm font-semibold text-[#1A202C]">
            Horario de envío
            <input
              value={isBirthdayCampaign(campaign.templateKind) ? "09:00 hora local" : "Según regla de campaña"}
              readOnly
              className="h-10 rounded-[8px] border border-[#E8EAF0] bg-[#F5F6FA] px-3 text-sm text-[#8891A4] outline-none"
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-[#1A202C]">
            Mensaje editable
            <textarea
              value={messageBody}
              onChange={(event) => setMessageBody(event.target.value)}
              className="min-h-40 rounded-[8px] border border-[#E8EAF0] px-3 py-3 text-sm leading-6 outline-none focus:border-[#5C6BC0]"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-[#1A202C]">
              Días de offset
              <input
                type="number"
                min="0"
                max="365"
                value={offset}
                onChange={(event) => setOffset(event.target.value)}
                className="h-10 rounded-[8px] border border-[#E8EAF0] px-3 text-sm outline-none focus:border-[#5C6BC0]"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#1A202C]">
              Oferta opcional
              <input
                value={offer}
                onChange={(event) => setOffer(event.target.value)}
                className="h-10 rounded-[8px] border border-[#E8EAF0] px-3 text-sm outline-none focus:border-[#5C6BC0]"
                placeholder="Ej: 15% off en tu próxima visita"
              />
            </label>
          </div>

          {isBirthdayCampaign(campaign.templateKind) ? (
            <div className="rounded-[8px] border border-[#E8EAF0] bg-[#F5F6FA] px-4 py-3 text-sm text-[#8891A4]">
              Solo se enviará a clientes con fecha de nacimiento cargada.
            </div>
          ) : null}
        </div>

        <aside className="space-y-4">
          <div className="rounded-[8px] border border-[#E8EAF0] bg-[#F5F6FA] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#8891A4]">
                  Estado
                </p>
                <p className="mt-1 text-sm font-semibold text-[#1A202C]">
                  {active ? "Activa" : "Inactiva"}
                </p>
              </div>
              <Switch
                checked={active}
                onCheckedChange={() => setActive((value) => !value)}
                label={active ? "Desactivar campaña" : "Activar campaña"}
              />
            </div>
          </div>

          <div className="rounded-[8px] border border-[#E8EAF0] bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#8891A4]">
              Variables disponibles
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                "{{nombre}}",
                "{{negocio}}",
                "{{link_resena}}",
                ...(isBirthdayCampaign(campaign.templateKind)
                  ? ["{{fecha_cumpleanos}}"]
                  : []),
              ].map((variable) => (
                <span
                  key={variable}
                  className="rounded-[8px] bg-[#EEF0FB] px-2.5 py-1 text-xs font-semibold text-[#5C6BC0]"
                >
                  {variable}
                </span>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {error || message ? (
        <p className={`mt-4 text-sm ${error ? "text-[#C0392B]" : "text-[#639922]"}`}>
          {error ?? message}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Link
          href="/dashboard/campaigns"
          className="inline-flex h-10 items-center rounded-[8px] border border-[#E8EAF0] px-4 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA]"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-10 items-center rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
