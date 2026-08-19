"use client";

import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import {
  RegisterFormFields,
  Shell,
} from "@/app/(public)/check-in/[token]/checkin-client";
import type { CheckinLanding } from "@/app/(public)/check-in/[token]/page";
import { useImagePalette } from "@/lib/use-logo-palette";
import PhoneFrame from "@/components/ui/phone-frame";
import ProgramSectionHeading from "./program-section-heading";
import type { LoyaltyAppearance } from "./types";

const MAX_LEN = 160;

/**
 * "Página de inscripción" — la landing pública (`/check-in/[token]`) que ve
 * el cliente al escanear el QR, antes de dejar sus datos.
 *
 * La preview reusa `Shell` y `RegisterFormFields` — los MISMOS componentes
 * que monta la landing real (fondo con gradiente de marca, logo, pie
 * "Powered by Flikker", inputs de nombre/teléfono/fecha) — en vez de una
 * maqueta desconectada. No reusa `RegisterScreen` completo: ese componente
 * decide A DÓNDE mandar el registro (el `token` real); `RegisterFormFields`
 * es solo la parte visual, y sin pasarle `onSubmit` el formulario no tiene
 * ningún request a donde ir — cero riesgo de POST real desde un dueño
 * autenticado editando. El título/subtítulo/botón acá son la MISMA
 * derivación que usa `RegisterScreen` (comentario ahí mismo).
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
  const [message, setMessage] = useState(
    appearance.checkinWelcomeMessage ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Misma extracción de paleta que usa la landing real (`RegisterScreen`),
  // solo que acá se le pasa el logo directo en vez del proxy `/logo` por
  // token — no hay un token real en esta preview.
  const palette = useImagePalette(
    `programa-preview:${appearance.logoUrl ?? ""}`,
    appearance.logoUrl ?? "",
    appearance.logoUrl,
    appearance.primaryColor,
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

  const previewLanding: CheckinLanding = {
    source: { name: "Preview", type: "qr" },
    business: {
      businessName: businessName || "Tu negocio",
      logoUrl: appearance.logoUrl,
      primaryColor: appearance.primaryColor,
      googleBusinessProfileUrl: null,
      loyaltyCardColor: appearance.loyaltyCardColor,
      loyaltyCardTextColor: appearance.loyaltyCardTextColor,
      loyaltyCardBackgroundImage: appearance.loyaltyCardBackgroundImage,
      loyaltyStampAreaColor: appearance.loyaltyStampAreaColor,
      loyaltyStampColor: appearance.loyaltyStampColor,
      loyaltyStampIcon: appearance.loyaltyStampIcon,
      loyaltyShowBusinessName: appearance.loyaltyShowBusinessName,
    },
    benefit: null,
    benefitText: null,
    welcomeMessage: message.trim() || null,
  };
  const title =
    previewLanding.welcomeMessage ??
    `Sumate a ${previewLanding.business.businessName}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-6">
        <ProgramSectionHeading
          icon={UserPlus}
          title="Página de inscripción"
          description="Lo primero que ve un cliente nuevo al escanear tu QR, antes de dejar sus datos."
        />

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
              className="flk-glossy inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
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
        <PhoneFrame>
          <Shell landing={previewLanding} brandOverride={palette} fill={false}>
            <h1 className="text-center text-2xl font-bold leading-tight text-white">
              {title}
            </h1>
            <p className="mt-3 text-center text-sm text-white/70">
              Dejanos tu nombre y número para registrar tu visita.
            </p>
            <RegisterFormFields
              benefit={previewLanding.benefit}
              palette={palette}
              submitLabel="Registrar mi visita"
            />
          </Shell>
        </PhoneFrame>
        <p className="mt-3 text-xs text-[#8891A4]">
          Es el mismo formulario que ve tu cliente — no manda ningún registro
          real desde acá.
        </p>
      </aside>
    </div>
  );
}
