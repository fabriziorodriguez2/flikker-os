"use client";

import { useState } from "react";
import BusinessLogo from "@/components/business/business-logo";
import PoweredByFlikker from "@/components/ui/powered-by-flikker";

type Score = 1 | 2 | 3 | 4 | 5;

export interface FeedbackLandingProps {
  token: string;
  businessName: string;
  businessLogo?: string | null;
  googleReviewUrl: string;
  initialScore?: Score;
}

const scores: Score[] = [1, 2, 3, 4, 5];

export default function FeedbackLanding({
  token,
  businessName,
  businessLogo,
  googleReviewUrl,
  initialScore,
}: FeedbackLandingProps) {
  const [score, setScore] = useState<Score | null>(initialScore ?? null);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitScore = async (nextScore: Score, nextComment?: string) => {
    setError(null);
    const res = await fetch(`/api/feedback/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        score: nextScore,
        comment: nextComment?.trim() || undefined,
      }),
    });

    if (!res.ok && res.status !== 409) {
      throw new Error("No pudimos registrar tu respuesta.");
    }
  };

  const chooseScore = (nextScore: Score) => {
    setScore(nextScore);
    if (nextScore >= 4) {
      void submitScore(nextScore).catch((err: Error) => setError(err.message));
    }
  };

  const submitLowScore = async () => {
    if (!score || score >= 4) return;
    try {
      await submitScore(score, comment);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
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

        {!score ? (
          <div className="text-center">
            <h1 className="mb-6 text-2xl font-semibold leading-tight">
              ¿Cómo fue tu experiencia con {businessName}?
            </h1>
            <div className="grid grid-cols-5 gap-2" aria-label="Calificación">
              {scores.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => chooseScore(value)}
                  className="flex min-h-14 min-w-12 items-center justify-center rounded-xl border border-[#d0d5dd] bg-white text-2xl font-semibold shadow-sm active:scale-95"
                  aria-label={`${value} de 5`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        ) : score >= 4 ? (
          <div className="text-center">
            <p className="text-2xl font-semibold">
              ¡Gracias! ¿Nos ayudás en Google?
            </p>
            <a
              href={googleReviewUrl}
              rel="noopener noreferrer"
              className="mt-8 flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-[#111827] px-5 font-['Manrope',sans-serif] text-base font-semibold text-white"
            >
              <GoogleGIcon />
              <span>Dejar reseña en Google</span>
            </a>
            {error ? (
              <p className="mt-4 text-sm text-red-600">{error}</p>
            ) : null}
          </div>
        ) : sent ? (
          <div className="text-center">
            <p className="text-2xl font-semibold">Gracias por contarnos.</p>
            <p className="mt-3 text-base text-[#475467]">
              Tu respuesta nos ayuda a mejorar.
            </p>
          </div>
        ) : (
          <div>
            <p className="text-center text-2xl font-semibold">
              Lamentamos que no fue ideal. ¿Qué pasó?
            </p>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              className="mt-6 min-h-32 w-full rounded-xl border border-[#d0d5dd] bg-white p-4 text-base outline-none focus:border-[#111827]"
              placeholder="Contanos opcionalmente qué podríamos mejorar"
            />
            <button
              type="button"
              onClick={submitLowScore}
              className="mt-4 flex min-h-14 w-full items-center justify-center rounded-xl bg-[#111827] px-5 text-base font-semibold text-white"
            >
              Enviar
            </button>
            {error ? (
              <p className="mt-4 text-sm text-red-600">{error}</p>
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
