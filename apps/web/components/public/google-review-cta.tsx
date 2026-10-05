"use client";

import { Globe } from "lucide-react";
import GoogleLogo from "@/components/icons/google-logo";

/**
 * DIRECT_GOOGLE (Parte 6) — reemplaza a `CheckinFeedbackCard` cuando el
 * negocio eligió no usar feedback privado. Sin estrellas, sin comentario,
 * sin submit a Flikker: un solo link real a Google. Nunca se renderiza sin
 * `googleUrl` — si el negocio no tiene Google conectado, no hay nada que
 * mostrar acá (ver el caller).
 */
export default function GoogleReviewCta({
  googleUrl,
  onClick,
}: {
  googleUrl: string;
  onClick?: () => void;
}) {
  return (
    <section
      className="w-full rounded-[22px] border px-5 py-4 text-left"
      style={{
        backgroundColor: "var(--pub-surface, #FFFFFF)",
        borderColor: "var(--pub-surface-border, #E9EAF2)",
        color: "var(--pub-text, #171A2B)",
      }}
    >
      <p
        className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em]"
        style={{ color: "var(--pub-text-muted, #6B7280)" }}
      >
        <Globe className="h-3.5 w-3.5" aria-hidden="true" />
        Público
      </p>
      <p className="mt-2 text-sm font-semibold">
        Dejanos tu reseña en Google
      </p>
      <a
        href={googleUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onClick?.()}
        className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border text-sm font-bold"
        style={{
          borderColor: "var(--pub-surface-border, #E3E5F0)",
          color: "var(--pub-text, #171A2B)",
        }}
      >
        <GoogleLogo className="h-4 w-4 shrink-0" />
        Dejar una reseña en Google
      </a>
    </section>
  );
}
