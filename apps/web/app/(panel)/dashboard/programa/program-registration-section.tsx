"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  DEFAULT_CARD_COLOR,
  buildLoyaltyCardTheme,
} from "@/lib/loyalty-card-theme";
import type { LoyaltyAppearance } from "./types";

const MAX_LEN = 160;

/**
 * "Página de inscripción" — la landing pública (`/check-in/[token]`) que ve
 * el cliente al escanear el QR, antes de dejar sus datos.
 *
 * Lo único editable acá es el encabezado (`checkinWelcomeMessage`): el resto
 * de esa pantalla (logo, colores, botón, beneficio) ya se arma solo a partir
 * de Tarjeta digital y del beneficio activo — auditado antes de construir
 * esto, no hay copy suelta editable más allá de eso. Dejarlo en null vuelve
 * al comportamiento de siempre (el título del beneficio activo).
 */
export default function ProgramRegistrationSection({
  appearance,
  businessName,
  canMutate,
  onSave,
}: {
  appearance: LoyaltyAppearance;
  businessName: string;
  canMutate: boolean;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [message, setMessage] = useState(appearance.checkinWelcomeMessage ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const theme = buildLoyaltyCardTheme(
    appearance.loyaltyCardColor ?? appearance.primaryColor ?? DEFAULT_CARD_COLOR,
  );

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave({ checkinWelcomeMessage: message.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-5">
        <h2 className="font-display text-base font-bold text-[#1A202C]">
          Página de inscripción
        </h2>
        <p className="mt-1 text-sm text-[#8891A4]">
          Lo primero que ve un cliente nuevo al escanear tu QR, antes de dejar
          sus datos.
        </p>

        <div className="mt-5">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
              Encabezado
            </span>
            <textarea
              value={message}
              disabled={!canMutate}
              maxLength={MAX_LEN}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Sumate a ${businessName || "tu negocio"}`}
              rows={2}
              className="mt-1 w-full resize-none rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2 text-sm text-[#1A202C] outline-none placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]"
            />
            <p className="mt-1 text-xs text-[#8891A4]">
              {message.length}/{MAX_LEN} · Dejalo vacío para usar el título de
              tu recompensa o beneficio activo.
            </p>
          </label>
        </div>

        {error ? <p className="mt-4 text-sm text-[#C0392B]">{error}</p> : null}

        {canMutate ? (
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Guardar encabezado
            </button>
          </div>
        ) : null}
      </section>

      <aside className="lg:sticky lg:top-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
          Vista previa
        </p>
        <div
          className="overflow-hidden rounded-[24px] p-6 shadow-[0_10px_24px_rgba(12,16,30,0.14)]"
          style={{ backgroundColor: theme.card }}
        >
          {appearance.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={appearance.logoUrl}
              alt=""
              className="h-10 w-10 rounded-[10px] object-contain"
            />
          ) : null}
          <p
            className="mt-4 text-lg font-bold leading-tight"
            style={{ color: theme.text }}
          >
            {message.trim() || `Sumate a ${businessName || "tu negocio"}`}
          </p>
          <p className="mt-2 text-xs" style={{ color: theme.textMuted }}>
            Dejanos tu nombre y número para registrar tu visita.
          </p>
          <div
            className="mt-5 rounded-[10px] px-4 py-2.5 text-center text-xs font-semibold"
            style={{ backgroundColor: theme.accent, color: theme.onAccent }}
          >
            Registrar mi visita
          </div>
        </div>
        <p className="mt-3 text-xs text-[#8891A4]">
          Aproximado — el logo y los colores son los mismos que en Tarjeta
          digital.
        </p>
      </aside>
    </div>
  );
}
