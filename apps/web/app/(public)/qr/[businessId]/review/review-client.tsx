"use client";

import { useState } from "react";
import PoweredByFlikker from "@/components/ui/powered-by-flikker";
import type { QrInfo } from "../page";

type Score = 1 | 2 | 3 | 4 | 5;
const SCORES: Score[] = [1, 2, 3, 4, 5];

export default function QrReviewClient({ info }: { info: QrInfo }) {
  const [score, setScore] = useState<Score | null>(null);
  const [hovered, setHovered] = useState<Score | null>(null);

  return (
    <main className="min-h-dvh bg-[#f8fafc] px-4 py-5 text-[#101828]">
      <section className="mx-auto flex min-h-[calc(100dvh-40px)] max-w-md flex-col justify-center">
        <div className="mb-7 flex flex-col items-center text-center">
          {info.logoUrl ? (
            <img
              src={info.logoUrl}
              alt={info.businessName}
              className="h-16 w-16 rounded-2xl object-contain shadow"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#eef0fb] text-2xl font-bold text-[#5C6BC0]">
              {info.businessName[0]}
            </div>
          )}
          <p className="mt-3 text-sm font-semibold text-[#5C6BC0]">
            {info.businessName}
          </p>
        </div>

        {!score ? (
          <div className="text-center">
            <h1 className="mb-6 text-2xl font-semibold leading-tight">
              ¿Cómo fue tu experiencia con {info.businessName}?
            </h1>
            <div
              className="flex justify-center gap-2"
              aria-label="Calificación"
              onMouseLeave={() => setHovered(null)}
            >
              {SCORES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setScore(v)}
                  onMouseEnter={() => setHovered(v)}
                  className="p-1 transition-transform active:scale-90"
                  aria-label={`${v} de 5`}
                >
                  <StarIcon filled={(hovered ?? 0) >= v} />
                </button>
              ))}
            </div>
          </div>
        ) : score >= 4 ? (
          <div className="text-center">
            <p className="text-2xl font-semibold">¡Gracias! ¿Nos ayudás en Google?</p>
            <a
              href={info.googleBusinessProfileUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-[#111827] px-5 text-base font-semibold text-white"
            >
              <GoogleGIcon />
              Dejar reseña en Google
            </a>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-2xl font-semibold">Gracias por contarnos.</p>
            <p className="mt-3 text-base text-[#475467]">
              Tu opinión nos ayuda a mejorar.
            </p>
          </div>
        )}

        <footer className="mt-8 flex items-center justify-center text-xs text-[#9ca3af]">
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
