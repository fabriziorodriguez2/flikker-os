"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Shell } from "@/app/(public)/check-in/[token]/checkin-client";
import type { CheckinLanding } from "@/app/(public)/check-in/[token]/page";
import type { LoyaltyAppearance } from "./types";

const MAX_LEN = 160;

/**
 * "Página de inscripción" — la landing pública (`/check-in/[token]`) que ve
 * el cliente al escanear el QR, antes de dejar sus datos.
 *
 * La preview reusa `Shell` — el MISMO componente que la landing real monta
 * (fondo con gradiente de marca, logo, pie "Powered by Flikker") — en vez de
 * una maqueta desconectada. No reusa `RegisterScreen` completo a propósito:
 * ese componente hace un POST real de registro al enviarse, y esta pantalla
 * es de un dueño autenticado editando, nunca un cliente real — reusar su
 * lógica de submit acá sería el riesgo real, no el ahorro. El título/
 * subtítulo/botón que se ven abajo son la MISMA derivación que usa
 * `RegisterScreen` (comentario ahí mismo), solo sin el formulario interactivo.
 *
 * Lo único editable es el encabezado (`checkinWelcomeMessage`): auditado
 * antes de construir esto — no hay más copy suelta en esa pantalla, el resto
 * ya se arma solo a partir de Tarjeta digital y del beneficio activo.
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

  const previewLanding: CheckinLanding = {
    source: { name: "Preview", type: "qr" },
    business: {
      businessName: businessName || "Tu negocio",
      logoUrl: appearance.logoUrl,
      primaryColor: appearance.primaryColor,
      googleBusinessProfileUrl: null,
      loyaltyCardColor: appearance.loyaltyCardColor,
      loyaltyStampColor: appearance.loyaltyStampColor,
      loyaltyStampIcon: appearance.loyaltyStampIcon,
    },
    benefit: null,
    benefitText: null,
    welcomeMessage: message.trim() || null,
  };
  const title =
    previewLanding.welcomeMessage ?? `Sumate a ${previewLanding.business.businessName}`;

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
        <div className="overflow-hidden rounded-[24px] shadow-[0_10px_24px_rgba(12,16,30,0.14)]">
          <Shell landing={previewLanding}>
            <h1 className="text-center text-lg font-bold leading-tight text-white">
              {title}
            </h1>
            <p className="mt-3 text-center text-xs text-white/70">
              Dejanos tu nombre y número para registrar tu visita.
            </p>
            <div className="mt-6 w-full max-w-sm rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-center text-xs font-semibold text-white/80">
              Nombre y teléfono (formulario real acá)
            </div>
          </Shell>
        </div>
        <p className="mt-3 text-xs text-[#8891A4]">
          Mismo fondo, logo y pie que ve tu cliente — el formulario real pide
          nombre y teléfono debajo del encabezado.
        </p>
      </aside>
    </div>
  );
}
