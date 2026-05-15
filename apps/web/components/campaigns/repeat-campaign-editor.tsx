"use client";

import { useState } from "react";
import ValidatedInput from "@/components/ui/validated-input";

interface RepeatCampaignEditorProps {
  campaignId: string;
  messageBody: string;
  triggerOffsetDays: number;
  offerText: string;
}

export default function RepeatCampaignEditor({
  campaignId,
  messageBody,
  triggerOffsetDays,
  offerText,
}: RepeatCampaignEditorProps) {
  const [body, setBody] = useState(messageBody);
  const [offset, setOffset] = useState(String(triggerOffsetDays));
  const [offer, setOffer] = useState(offerText);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!isValidOffsetDays(offset)) {
      setError("Ingresá un número entre 0 y 365 días.");
      return;
    }

    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch(`/api/proxy/campaigns/${campaignId}/repeats`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageBody: body,
          triggerOffsetDays: Number(offset),
          offerText: offer,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Error al guardar");
      setMessage("Cambios guardados.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
      <div className="grid gap-4">
        <label className="grid gap-2">
          <span className="text-sm font-semibold text-[color:var(--foreground)]">
            Texto del mensaje
          </span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="min-h-32 rounded-[18px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-3 text-sm outline-none"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-semibold text-[color:var(--foreground)]">
            Dias de offset
          </span>
          <ValidatedInput
            type="number"
            min="0"
            max="365"
            value={offset}
            onChange={setOffset}
            validate={validateOffsetDays}
            className="h-12 rounded-[18px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 text-sm outline-none"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-semibold text-[color:var(--foreground)]">
            Oferta opcional
          </span>
          <input
            value={offer}
            onChange={(event) => setOffer(event.target.value)}
            className="h-12 rounded-[18px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 text-sm outline-none"
            placeholder="Ej: 15% off en tu proxima visita"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-full bg-[color:var(--brand-primary)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>
        {message ? (
          <span className="text-sm text-[color:var(--success-text)]">
            {message}
          </span>
        ) : null}
        {error ? (
          <span className="text-sm text-[color:var(--danger-text)]">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function validateOffsetDays(value: string) {
  return {
    valid: isValidOffsetDays(value),
    message: "Ingresá un número entre 0 y 365 días.",
  };
}

function isValidOffsetDays(value: string) {
  if (!value.trim()) return false;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 365;
}
