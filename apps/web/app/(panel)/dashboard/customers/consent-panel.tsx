"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { useCanMutate, useIsOwnerOrAdmin } from "../../role-context";

type ConsentStatus = "GRANTED" | "REVOKED" | "SUPPRESSED" | "UNKNOWN";
type ConsentAction = "GRANTED" | "REVOKED" | "SUPPRESSED" | "UNSUPPRESSED";

interface ConsentState {
  whatsapp: ConsentStatus;
  events: { id: string; action: ConsentAction; source: string; createdAt: string }[];
}

export const CONSENT_LABELS: Record<ConsentStatus, { label: string; className: string }> = {
  GRANTED: { label: "Autorizó promociones por WhatsApp", className: "bg-[#EAF7EF] text-[#147A5B]" },
  UNKNOWN: { label: "Sin consentimiento registrado", className: "bg-[#F2F4F8] text-[#5F6780]" },
  REVOKED: { label: "Pidió no recibir promociones", className: "bg-[#FFF4E5] text-[#8A520D]" },
  SUPPRESSED: { label: "Bloqueado (queja)", className: "bg-[#FDECEA] text-[#C0392B]" },
};

const SOURCE_LABELS: Record<string, string> = {
  CHECKIN_FORM: "en el check-in",
  STAFF: "registrado por el local",
  INBOUND_KEYWORD: "respondió BAJA",
  COMPLAINT: "por una queja",
  PLATFORM: "por Flikker",
};

/**
 * Consentimiento de WhatsApp del cliente. El staff registra lo que el
 * cliente dijo; bloquear por queja es de dueño/admin. Sin consentimiento
 * registrado no le llegan promociones de un negocio con la política aceptada.
 */
export default function ConsentPanel({ customerId }: { customerId: string }) {
  const toast = useToast();
  const canRecord = useCanMutate();
  const canSuppress = useIsOwnerOrAdmin();
  const [state, setState] = useState<ConsentState | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/proxy/customers/${customerId}/consent`);
    if (res.ok) setState((await res.json()) as ConsentState);
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function record(action: ConsentAction, complaint = false) {
    setBusy(true);
    try {
      const res = await fetch(`/api/proxy/customers/${customerId}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "WHATSAPP", action, ...(complaint ? { complaint } : {}) }),
      });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          body && typeof body === "object" && "message" in body
            ? String((body as { message: unknown }).message)
            : "No pudimos registrar el cambio.";
        throw new Error(message);
      }
      setState(body as ConsentState);
      toast.success("Consentimiento actualizado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pudimos registrar el cambio.");
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;
  const status = CONSENT_LABELS[state.whatsapp];
  const last = state.events[0];
  const button =
    "inline-flex h-8 items-center rounded-[9px] border border-[#E3E5F0] bg-white px-3 text-xs font-semibold text-[#202333] hover:border-[#5C6BC0] disabled:opacity-50";

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Consentimiento de WhatsApp">
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
      {last ? (
        <span className="text-xs text-[#8891A4]">
          {SOURCE_LABELS[last.source] ?? last.source} · {new Date(last.createdAt).toLocaleDateString("es-UY")}
        </span>
      ) : null}
      {canRecord && state.whatsapp !== "SUPPRESSED" ? (
        state.whatsapp === "GRANTED" ? (
          <button type="button" className={button} disabled={busy} onClick={() => void record("REVOKED")}>
            Registrar baja
          </button>
        ) : (
          <button type="button" className={button} disabled={busy} onClick={() => void record("GRANTED")}>
            Registrar que aceptó
          </button>
        )
      ) : null}
      {canSuppress ? (
        state.whatsapp === "SUPPRESSED" ? (
          <button type="button" className={button} disabled={busy} onClick={() => void record("UNSUPPRESSED")}>
            Levantar bloqueo
          </button>
        ) : (
          <button type="button" className={button} disabled={busy} onClick={() => void record("SUPPRESSED", true)}>
            Bloquear por queja
          </button>
        )
      ) : null}
    </div>
  );
}
