"use client";

import Link from "next/link";
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
 * Acá se edita SOLO el encabezado (`checkinWelcomeMessage`). El resto se arma
 * solo a partir de Tarjeta digital y del beneficio activo.
 *
 * ## Por qué ya no hay selector de color
 *
 * Había un control de `checkinBackgroundColor` que pintaba el fondo de toda
 * la experiencia del cliente. Con el criterio de identidad nuevo — Flikker es
 * el marco, el negocio es el contenido — ese fondo pasó a ser constante, así
 * que el control quedó configurando algo que no se ve en ninguna pantalla.
 * Un control inerte es peor que ninguno: el dueño elige un color, guarda, y
 * nada cambia.
 *
 * La columna `Business.checkinBackgroundColor` NO se borra ni se migra: sigue
 * existiendo con los valores que cada negocio ya había elegido. Lo único que
 * cambia es que este formulario dejó de escribirla.
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
      // Sin `checkinBackgroundColor`: se dejó de escribir junto con el
      // control. El valor viejo de cada negocio queda como estaba.
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
      // Ya no pinta nada en la experiencia real; la preview tampoco lo usa.
      checkinBackgroundColor: null,
      googleBusinessProfileUrl: null,
      loyaltyCardColor: appearance.loyaltyCardColor,
      loyaltyCardTextColor: appearance.loyaltyCardTextColor,
      loyaltyCardBackgroundImage: appearance.loyaltyCardBackgroundImage,
      loyaltyStampAreaColor: appearance.loyaltyStampAreaColor,
      loyaltyStampColor: appearance.loyaltyStampColor,
      loyaltyStampIcon: appearance.loyaltyStampIcon,
      loyaltyShowBusinessName: appearance.loyaltyShowBusinessName,
      loyaltyStampBackgroundPattern: appearance.loyaltyStampBackgroundPattern,
      loyaltyStampBackgroundOpacity: appearance.loyaltyStampBackgroundOpacity,
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
          description="Lo primero que ve un cliente nuevo al escanear tu QR. Personalizás tu logo, tu color de marca, tu tarjeta y tus sellos; el marco de la pantalla es siempre el de Flikker."
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

          {/*
            Read-only a propósito: el color de marca se edita en un solo lugar
            (Configuración → Marca), no en cada pantalla que lo usa. Acá se
            muestra para que el dueño sepa cuál es el color que efectivamente
            aparece en su experiencia, sin abrir una segunda forma de editarlo.
          */}
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
              Color de marca
            </span>
            <div className="mt-2 flex min-h-12 items-center justify-between gap-3 rounded-[10px] border border-[#E8EAF0] bg-[#FAFBFD] px-3 py-2">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="h-7 w-7 shrink-0 rounded-full border-2 border-white shadow-[0_0_0_1px_#D7DBE7]"
                  style={{
                    backgroundColor: appearance.primaryColor || "#5C6BC0",
                  }}
                />
                <span
                  className="truncate text-sm font-medium text-[#1A202C]"
                  style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
                >
                  {(appearance.primaryColor || "#5C6BC0").toUpperCase()}
                </span>
              </div>
              <Link
                href="/dashboard/settings"
                className="shrink-0 rounded-[8px] px-3 py-1.5 text-xs font-semibold text-[#5C6BC0] transition-colors hover:bg-[#F0F2FF]"
              >
                Cambiar
              </Link>
            </div>
            <p className="mt-1 text-xs text-[#8891A4]">
              Tu color de marca se usa como detalle: el aro de tu logo y los
              acentos de tus premios. El fondo, los botones y la tipografía son
              siempre los de Flikker, así que tu pantalla se ve consistente y
              legible en cualquier celular.
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
