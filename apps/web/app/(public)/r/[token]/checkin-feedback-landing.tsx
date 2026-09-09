"use client";

import BusinessLogo from "@/components/business/business-logo";
import PoweredByFlikker from "@/components/ui/powered-by-flikker";
import FeedbackForm, {
  type FeedbackOutcome,
} from "@/components/public/feedback-form";

export interface CheckinFeedbackLandingProps {
  token: string;
  businessName: string;
  businessLogo?: string | null;
  /** `null` = el negocio no tiene Google conectado: el paso simplemente no existe. */
  googleReviewUrl: string | null;
  /** El cliente ya había contestado (volvió a tocar el link del WhatsApp). */
  alreadySubmitted?: boolean;
}

/**
 * Landing del recordatorio para negocios Check-in V2 — wrapper de CONTEXTO.
 *
 * Lo único propio de esta entrada es el encabezado (llegó desde el WhatsApp
 * del negocio, sin sesión) y el endpoint por token. La encuesta en sí es
 * `FeedbackForm`, el MISMO componente que usa la card dentro del check-in:
 * misma escala de 5 estrellas, mismo comentario opcional para cualquier
 * puntaje, mismo botón explícito y el mismo bloque de Google después de
 * enviar. Antes eran dos implementaciones que ya habían divergido.
 *
 * Diferencias deliberadas contra el landing LEGACY (`../../l/[slug]`), que
 * queda intacto:
 *
 *  - **Sin gating por puntaje.** Ahí un 4-5 saltaba directo a Google y un 1-3
 *    nunca lo veía. Eso es selective solicitation y Google lo prohíbe.
 *  - **El feedback vale por sí solo.** Es privado, queda en Flikker y puede
 *    dar el sello extra. Google es público, opcional, y no da ni sellos ni
 *    beneficios.
 *  - **El sello se confirma antes de cualquier salida.** El backend lo
 *    persiste al guardar el feedback, así que ya está otorgado cuando aparece
 *    el botón de Google.
 */
export default function CheckinFeedbackLanding({
  token,
  businessName,
  businessLogo,
  googleReviewUrl,
  alreadySubmitted = false,
}: CheckinFeedbackLandingProps) {
  async function submit(
    score: number,
    comment?: string,
  ): Promise<FeedbackOutcome> {
    const res = await fetch(`/api/feedback/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score, comment }),
    });

    // 409 = ya lo había mandado. No es un error para el cliente: su opinión
    // está guardada igual, así que se le muestra el agradecimiento.
    if (res.status === 409) {
      return {
        alreadySubmitted: true,
        bonusGranted: false,
        offerGoogle: Boolean(googleReviewUrl),
        googleUrl: googleReviewUrl,
      };
    }
    if (!res.ok) throw new Error("feedback failed");

    const data = (await res.json().catch(() => null)) as {
      bonusGranted?: boolean;
      offerGoogle?: boolean;
    } | null;
    return {
      alreadySubmitted: false,
      bonusGranted: Boolean(data?.bonusGranted),
      // El backend ya apaga `offerGoogle` cuando el negocio no tiene Google
      // conectado; sin el campo, manda la URL que resolvió el server.
      offerGoogle: (data?.offerGoogle ?? true) && Boolean(googleReviewUrl),
      googleUrl: googleReviewUrl,
    };
  }

  return (
    <main className="flk-customer min-h-dvh bg-[#f8fafc] px-4 py-5 text-[#101828]">
      <section className="mx-auto flex min-h-[calc(100dvh-40px)] max-w-md flex-col justify-center">
        <div className="mb-6 flex flex-col items-center text-center">
          <BusinessLogo
            logoUrl={businessLogo}
            name={businessName}
            size="lg"
            className="bg-white"
          />
          <p className="mt-3 text-sm font-semibold text-[#5C6BC0]">
            {businessName}
          </p>
          <h1 className="mt-3 text-2xl font-bold leading-tight tracking-[-0.03em]">
            ¿Cómo fue tu experiencia?
          </h1>
        </div>

        <FeedbackForm
          submit={submit}
          alreadySubmitted={alreadySubmitted}
          googleUrl={googleReviewUrl}
        />

        <footer className="mt-8 flex items-center justify-center text-xs text-[color:var(--text-soft)]">
          <PoweredByFlikker />
        </footer>
      </section>
    </main>
  );
}
