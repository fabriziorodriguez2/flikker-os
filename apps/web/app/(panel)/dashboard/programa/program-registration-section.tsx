"use client";

import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { RegisterScreenContent } from "@/app/(public)/check-in/[token]/checkin-client";
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
 * La preview monta `RegisterScreenContent`, exactamente la misma pantalla
 * visual que usa el check-in real: fondo, logo, copy, campos, enlace y pie.
 * En el panel se activa su modo `preview`, que vuelve inerte todo el árbol y
 * además no recibe `onSubmit`; conserva el diseño sin permitir escritura,
 * clics ni requests reales.
 *
 * Se editan el encabezado (`checkinWelcomeMessage`) y el fondo propio de esta
 * pantalla (`checkinBackgroundColor`). El resto se arma solo a partir de
 * Tarjeta digital y del beneficio activo.
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
  const [backgroundColor, setBackgroundColor] = useState(
    appearance.checkinBackgroundColor ?? "",
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
      await onSave({
        checkinWelcomeMessage: message.trim(),
        checkinBackgroundColor: backgroundColor || null,
      });
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
      checkinBackgroundColor: backgroundColor || null,
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
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-6">
        <ProgramSectionHeading
          icon={UserPlus}
          title="Página de inscripción"
          description="Lo primero que ve un cliente nuevo al escanear tu QR, antes de dejar sus datos."
        />

        <div className="mt-5 space-y-5">
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

          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
              Color de fondo
            </span>
            <div className="mt-2 flex min-h-12 items-center justify-between gap-3 rounded-[10px] border border-[#E8EAF0] bg-white px-3 py-2">
              <label
                className={`flex min-w-0 items-center gap-3 ${
                  canMutate ? "cursor-pointer" : "cursor-default"
                }`}
              >
                <span
                  className="h-7 w-7 shrink-0 rounded-full border-2 border-white shadow-[0_0_0_1px_#D7DBE7]"
                  style={{
                    backgroundColor:
                      backgroundColor || appearance.primaryColor || "#5C6BC0",
                  }}
                />
                <span
                  className="truncate text-sm font-medium text-[#1A202C]"
                  style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
                >
                  {backgroundColor.toUpperCase() || "Automático"}
                </span>
                <input
                  type="color"
                  value={
                    /^#[0-9A-F]{6}$/i.test(
                      backgroundColor || appearance.primaryColor || "",
                    )
                      ? backgroundColor || appearance.primaryColor || "#5C6BC0"
                      : "#5C6BC0"
                  }
                  disabled={!canMutate}
                  onChange={(event) =>
                    setBackgroundColor(event.target.value.toUpperCase())
                  }
                  aria-label="Elegir color de fondo"
                  className="sr-only"
                />
              </label>
              {backgroundColor ? (
                <button
                  type="button"
                  disabled={!canMutate}
                  onClick={() => setBackgroundColor("")}
                  className="shrink-0 rounded-[8px] px-3 py-1.5 text-xs font-semibold text-[#5C6BC0] transition-colors hover:bg-[#F0F2FF] disabled:opacity-50"
                >
                  Usar automático
                </button>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-[#8891A4]">
              Tocá el círculo para elegir un color. En automático se usa la
              paleta de tu marca.
            </p>
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-[#C0392B]">{error}</p> : null}

        {canMutate ? (
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white shadow-[0_0_16px_rgba(92,107,192,0.2)] transition-colors hover:bg-[#4f5eb0] disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Guardar cambios
            </button>
          </div>
        ) : null}
      </section>

      <aside className="lg:sticky lg:top-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
          Vista previa
        </p>
        <PhoneFrame>
          <RegisterScreenContent
            landing={previewLanding}
            palette={palette}
            fill={false}
            preview
            onRecoverInstead={() => undefined}
          />
        </PhoneFrame>
        <p className="mt-3 text-xs text-[#8891A4]">
          Es el mismo formulario que ve tu cliente — no manda ningún registro
          real desde acá.
        </p>
      </aside>
    </div>
  );
}
