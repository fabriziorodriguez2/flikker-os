"use client";

import { useState } from "react";

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
        <div className="mb-8 flex items-center justify-center">
          {businessLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={businessLogo}
              alt={businessName}
              className="h-14 w-14 rounded-xl object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#111827] text-xl font-semibold text-white">
              {businessName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {!score ? (
          <div className="text-center">
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
              className="mt-8 flex min-h-14 w-full items-center justify-center rounded-xl bg-[#111827] px-5 text-base font-semibold text-white"
            >
              Dejar reseña
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
      </section>
    </main>
  );
}
