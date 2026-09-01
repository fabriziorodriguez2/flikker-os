"use client";

import { useState } from "react";
import BusinessLogo from "@/components/business/business-logo";
import PoweredByFlikker from "@/components/ui/powered-by-flikker";

type Score = 1 | 2 | 3 | 4 | 5;

export interface CheckinFeedbackLandingProps {
  token: string;
  businessName: string;
  businessLogo?: string | null;
  /** `null` = el negocio no tiene Google conectado: el paso simplemente no existe. */
  googleReviewUrl: string | null;
  /** El cliente ya había contestado (volvió a tocar el link del WhatsApp). */
  alreadySubmitted?: boolean;
}

const scores: Score[] = [1, 2, 3, 4, 5];

/**
 * Landing del recordatorio para negocios Check-in V2.
 *
 * Diferencias deliberadas contra el landing LEGACY (`../../l/[slug]`), que
 * queda intacto:
 *
 *  - **Sin gating por puntaje.** Ahí un 4-5 saltaba directo a Google y un 1-3
 *    nunca lo veía. Eso es selective solicitation y Google lo prohíbe. Acá
 *    todos los puntajes siguen el mismo camino: se guarda el feedback y
 *    después se ofrece Google igual.
 *  - **El feedback vale por sí solo.** Es privado, queda en Flikker y puede
 *    dar el sello extra. Google es público, opcional, y no da ni sellos ni
 *    beneficios.
 *  - **El sello se confirma antes de cualquier salida.** El backend lo
 *    persiste al guardar el feedback, así que ya está otorgado cuando se
 *    muestra el botón de Google: si el cliente lo ignora, o abre Google y
 *    cierra sin publicar, el sello igual quedó.
 *
 * Sobre el auto-redirect a Google: es técnicamente viable (basta un
 * `location.assign` después del await), pero se descartó. Mandar a alguien
 * afuera sin mostrarle que su opinión se guardó ni que ganó el sello pierde
 * justo la parte que le sirve al cliente, y para un puntaje bajo es
 * directamente hostil. Queda un CTA explícito, visible con cualquier puntaje.
 */
export default function CheckinFeedbackLanding({
  token,
  businessName,
  businessLogo,
  googleReviewUrl,
  alreadySubmitted = false,
}: CheckinFeedbackLandingProps) {
  const [score, setScore] = useState<Score | null>(null);
  const [hovered, setHovered] = useState<Score | null>(null);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(alreadySubmitted);
  const [bonusGranted, setBonusGranted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!score || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/feedback/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          score,
          comment: comment.trim() || undefined,
        }),
      });

      // 409 = ya lo había mandado. No es un error para el cliente: su
      // opinión está guardada igual, así que se le muestra el agradecimiento.
      if (!res.ok && res.status !== 409) {
        throw new Error("No pudimos registrar tu respuesta.");
      }
      if (res.ok) {
        const data = (await res.json()) as { bonusGranted?: boolean };
        setBonusGranted(Boolean(data.bonusGranted));
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="min-h-dvh bg-[#f8fafc] px-4 py-5 text-[#101828]">
      <section className="mx-auto flex min-h-[calc(100dvh-40px)] max-w-md flex-col justify-center">
        <div className="mb-7 flex flex-col items-center text-center">
          <BusinessLogo
            logoUrl={businessLogo}
            name={businessName}
            size="lg"
            className="bg-white"
          />
          <p className="mt-3 text-sm font-semibold text-[#5C6BC0]">
            {businessName}
          </p>
        </div>

        {sent ? (
          <div className="text-center">
            <p className="text-2xl font-semibold">Gracias por contarnos.</p>
            <p className="mt-3 text-base text-[#475467]">
              Tu opinión es privada y va directo a {businessName}.
            </p>
            {bonusGranted ? (
              <p className="mt-4 rounded-xl bg-[#eef2ff] px-4 py-3 text-sm font-semibold text-[#4338ca]">
                ¡Sumaste un sello extra por dejar tu opinión!
              </p>
            ) : null}

            {googleReviewUrl ? (
              <div className="mt-8">
                <p className="text-sm text-[#475467]">
                  Si querés, también podés compartirlo en Google. Es público y
                  opcional: no cambia tus sellos ni tus beneficios.
                </p>
                <a
                  href={googleReviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-[#111827] px-5 font-['Manrope',sans-serif] text-base font-semibold text-white"
                >
                  <GoogleGIcon />
                  <span>Compartir también en Google</span>
                </a>
              </div>
            ) : null}
          </div>
        ) : (
          <div>
            <h1 className="mb-6 text-center text-2xl font-semibold leading-tight">
              ¿Cómo fue tu experiencia con {businessName}?
            </h1>
            <div
              className="flex justify-center gap-2"
              aria-label="Calificación"
              onMouseLeave={() => setHovered(null)}
            >
              {scores.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setScore(value)}
                  onMouseEnter={() => setHovered(value)}
                  className="p-1 transition-transform active:scale-90"
                  aria-label={`${value} de 5`}
                >
                  <StarIcon filled={(hovered ?? score ?? 0) >= value} />
                </button>
              ))}
            </div>

            {score ? (
              <>
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  className="mt-6 min-h-32 w-full rounded-xl border border-[#d0d5dd] bg-white p-4 text-base outline-none focus:border-[#111827]"
                  placeholder="Contanos opcionalmente qué podríamos mejorar"
                />
                <button
                  type="button"
                  onClick={submit}
                  disabled={sending}
                  className="mt-4 flex min-h-14 w-full items-center justify-center rounded-xl bg-[#111827] px-5 text-base font-semibold text-white disabled:opacity-60"
                >
                  {sending ? "Enviando..." : "Enviar"}
                </button>
              </>
            ) : null}
            {error ? (
              <p className="mt-4 text-center text-sm text-red-600">{error}</p>
            ) : null}
          </div>
        )}

        <footer className="mt-8 flex items-center justify-center text-xs text-[color:var(--text-soft)]">
          <PoweredByFlikker />
        </footer>
      </section>
    </main>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className="h-12 w-12 transition-colors duration-100"
      fill={filled ? "#FBBF24" : "none"}
      stroke={filled ? "#FBBF24" : "#D1D5DB"}
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z"
      />
    </svg>
  );
}

function GoogleGIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.29h6.47c-.28 1.5-1.13 2.77-2.41 3.62v3h3.9c2.28-2.1 3.53-5.19 3.53-8.64z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.9-3c-1.08.72-2.46 1.15-4.05 1.15-3.12 0-5.77-2.11-6.72-4.95H1.26v3.09A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.29A7.22 7.22 0 0 1 4.91 12c0-.79.13-1.56.37-2.29V6.62H1.26A12 12 0 0 0 0 12c0 1.94.46 3.78 1.26 5.38l4.02-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.76c1.76 0 3.34.61 4.59 1.8l3.45-3.45C17.95 1.16 15.24 0 12 0A12 12 0 0 0 1.26 6.62l4.02 3.09C6.23 6.87 8.88 4.76 12 4.76z"
      />
    </svg>
  );
}
