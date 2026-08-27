"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import GoogleLogo from "@/components/icons/google-logo";

interface FeedbackRewardGoal {
  goal: {
    incentiveName: string;
    progressVisits: number;
    targetAdditionalVisits: number;
  } | null;
  unlockedNow: boolean;
  benefit: { name: string } | null;
}

interface FeedbackResponse {
  alreadySubmitted: boolean;
  bonusGranted: boolean;
  offerGoogle: boolean;
  googleUrl: string | null;
  rewardGoal: FeedbackRewardGoal;
}

type Score = 1 | 2 | 3 | 4 | 5;
const SCORES: Score[] = [1, 2, 3, 4, 5];

/**
 * "¿Cómo fue tu experiencia?" (§9 pilot ask) — right after check-in, inside
 * the same success screen. Deliberately NOT the legacy `/l/[slug]` landing
 * (that one is message/token-anchored, lives on its own page, and gates the
 * Google ask at score>=4 the same way this does — reused here as the one
 * established convention for "don't push unhappy customers to post
 * publicly", not duplicated logic).
 *
 * The bonus stamp is granted server-side the moment the score is submitted —
 * before this component ever knows whether Google gets opened. Nothing here
 * conditions it on score or on the Google step; it is already done by the
 * time either of those render.
 */
export default function CheckinFeedbackCard({
  hasActiveGoal,
  brand,
  accentBg,
  accentText,
  onReviewLinkClicked,
}: {
  hasActiveGoal: boolean;
  brand: string;
  accentBg: string;
  accentText: string;
  onReviewLinkClicked?: () => void;
}) {
  const [score, setScore] = useState<Score | null>(null);
  const [hovered, setHovered] = useState<Score | null>(null);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<FeedbackResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(nextScore: Score, nextComment?: string) {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/checkin/session/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          score: nextScore,
          comment: nextComment?.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | FeedbackResponse
        | null;
      if (!res.ok || !data) throw new Error();
      setResult(data);
    } catch {
      setError("No pudimos registrar tu respuesta. Probá de nuevo.");
    } finally {
      setSending(false);
    }
  }

  function chooseScore(value: Score) {
    setScore(value);
    if (value >= 4) void submit(value);
  }

  const cardClass =
    "checkin-enter checkin-hover-lift relative overflow-hidden rounded-[22px] border border-white/80 bg-white/72 px-5 py-4 text-center shadow-[0_14px_36px_rgba(31,35,58,0.09)] backdrop-blur-md";

  // ── Resultado ya conocido — gracias + (si corresponde) oferta de Google ──
  if (result) {
    const goal = result.rewardGoal.goal;
    return (
      <div className={cardClass}>
        <p className="text-sm font-bold text-[#24283A]">
          {result.alreadySubmitted
            ? "Ya nos contaste cómo fue tu experiencia."
            : "¡Gracias por contarnos!"}
        </p>
        {result.bonusGranted && (
          <p className="mt-1 text-xs font-semibold" style={{ color: brand }}>
            +1 sello extra
            {goal
              ? ` · ahora tenés ${goal.progressVisits} de ${goal.targetAdditionalVisits} sellos`
              : ""}
          </p>
        )}
        {result.offerGoogle && result.googleUrl && (
          <div className="mt-4">
            <p className="text-sm font-semibold text-[#24283A]">
              ¿Querés compartir también tu experiencia en Google?
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <a
                href={result.googleUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onReviewLinkClicked?.()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] px-4 text-sm font-bold"
                style={{ backgroundColor: accentBg, color: accentText }}
              >
                <GoogleLogo className="h-4 w-4 shrink-0" />
                Dejar reseña en Google
              </a>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Comentario opcional para puntaje bajo — sigue siendo el mismo bonus ──
  if (score !== null && score < 4) {
    return (
      <div className={cardClass}>
        <p className="text-sm font-bold text-[#24283A]">
          Lamentamos que no fue ideal. ¿Qué pasó?
        </p>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Contanos opcionalmente qué podríamos mejorar"
          className="mt-3 min-h-24 w-full rounded-[14px] border border-[#E3E5F0] bg-white p-3 text-left text-sm text-[#24283A] outline-none focus:border-current"
        />
        <button
          type="button"
          onClick={() => void submit(score, comment)}
          disabled={sending}
          className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-[14px] text-sm font-bold disabled:opacity-60"
          style={{ backgroundColor: accentBg, color: accentText }}
        >
          {sending ? "Enviando…" : "Enviar"}
        </button>
        {error && <p className="mt-2 text-xs text-[#C0392B]">{error}</p>}
      </div>
    );
  }

  // ── Estado inicial — pedir la calificación ────────────────────────────────
  return (
    <div className={cardClass}>
      <p className="text-sm font-bold text-[#24283A]">
        ¿Cómo fue tu experiencia?
      </p>
      <p className="mt-1 text-xs text-[#8A91A3]">
        {hasActiveGoal
          ? "Contanos y ganá 1 sello extra"
          : "Tu opinión nos ayuda a mejorar"}
      </p>
      <div
        className="mt-3 flex justify-center gap-1.5"
        aria-label="Calificación"
        onMouseLeave={() => setHovered(null)}
      >
        {SCORES.map((value) => {
          const active = (hovered ?? score ?? 0) >= value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => chooseScore(value)}
              onMouseEnter={() => setHovered(value)}
              disabled={sending}
              className="p-1 transition-transform active:scale-90 disabled:opacity-60"
              aria-label={`${value} de 5`}
            >
              <Star
                className="h-7 w-7"
                fill={active ? "#FBBF24" : "none"}
                stroke={active ? "#FBBF24" : "#6B7280"}
                strokeWidth={1.5}
              />
            </button>
          );
        })}
      </div>
      {error && <p className="mt-2 text-xs text-[#C0392B]">{error}</p>}
    </div>
  );
}
