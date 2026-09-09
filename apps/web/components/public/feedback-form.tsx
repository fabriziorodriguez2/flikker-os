"use client";

import { useState } from "react";
import { Check, Globe, Loader2, Lock, Star } from "lucide-react";
import GoogleLogo from "@/components/icons/google-logo";

/**
 * Lo que el backend contesta al guardar el feedback, normalizado. Los dos
 * wrappers hablan con endpoints distintos (`/api/checkin/session/feedback`
 * desde el check-in, `/api/feedback/{token}` desde el WhatsApp) y traducen su
 * respuesta a esta forma — el formulario no sabe de rutas.
 */
export interface FeedbackOutcome {
  /** El backend ya tenía feedback para esta visita (reintento/reapertura). */
  alreadySubmitted: boolean;
  /** SOLO true si el sello extra realmente se acreditó. */
  bonusGranted: boolean;
  /** Si corresponde ofrecer Google (el negocio lo tiene conectado). */
  offerGoogle: boolean;
  googleUrl: string | null;
}

type Score = 1 | 2 | 3 | 4 | 5;
const SCORES: Score[] = [1, 2, 3, 4, 5];

/**
 * La encuesta de feedback de Check-in V2 — una sola, para las dos entradas.
 *
 * `CheckinFeedbackCard` (dentro del check-in) y `CheckinFeedbackLanding`
 * (el link del WhatsApp) son wrappers de contexto: header del negocio,
 * navegación, nada más. El cuerpo — escala, comentario, envío, confirmación y
 * el bloque de Google — vive acá, así las dos entradas no pueden volver a
 * divergir como venían haciéndolo (una pedía comentario solo con puntaje
 * bajo, la otra siempre; una mandaba sola con 4-5, la otra no).
 *
 * Reglas de producto que el componente sostiene por construcción:
 *
 *  - **La UI no cambia de intención según el puntaje.** Un 1 y un 5 ven
 *    exactamente los mismos campos y el mismo botón. Filtrar por puntaje es
 *    selective solicitation, y además convierte la encuesta en un embudo.
 *  - **Primero se guarda lo privado.** Google recién aparece DESPUÉS de que
 *    el backend confirmó el feedback; nunca antes, y nunca como paso
 *    encadenado del envío.
 *  - **El sello se anuncia solo si existió.** `bonusGranted` viene del
 *    backend, que ya lo persistió; el componente no lo deduce del puntaje.
 *
 * Theming: todo sale de los tokens `--pub-*` de la experiencia pública (con
 * fallback claro para el landing del WhatsApp, que no los define). Sin
 * `bg-white` fijo: sobre un negocio de fondo oscuro la card se veía gris
 * lavada y el texto secundario perdía contraste.
 */
export default function FeedbackForm({
  submit,
  alreadySubmitted = false,
  googleUrl = null,
  bonusHint = false,
  onGoogleClick,
}: {
  submit: (score: number, comment?: string) => Promise<FeedbackOutcome>;
  /** El backend ya sabía que este cliente contestó (estado inicial). */
  alreadySubmitted?: boolean;
  /** Link de Google para el estado ya-enviado; `null` = el negocio no tiene. */
  googleUrl?: string | null;
  /** Mencionar el sello extra ANTES de enviar (solo si hay tarjeta activa). */
  bonusHint?: boolean;
  onGoogleClick?: () => void;
}) {
  const [score, setScore] = useState<Score | null>(null);
  const [hovered, setHovered] = useState<Score | null>(null);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<FeedbackOutcome | null>(
    alreadySubmitted
      ? {
          alreadySubmitted: true,
          bonusGranted: false,
          offerGoogle: Boolean(googleUrl),
          googleUrl,
        }
      : null,
  );

  async function send() {
    if (!score || sending) return;
    setSending(true);
    setError(null);
    try {
      setOutcome(await submit(score, comment.trim() || undefined));
    } catch {
      setError("No pudimos registrar tu respuesta. Probá de nuevo.");
    } finally {
      setSending(false);
    }
  }

  if (outcome) {
    return (
      <Surface>
        <div className="flex items-start gap-2.5 text-left">
          <span
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
            style={{
              backgroundColor: "var(--pub-accent, #5C6BC0)",
              color: "var(--pub-on-accent, #FFFFFF)",
            }}
          >
            <Check className="h-3.5 w-3.5 stroke-[3]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p
              className="text-sm font-bold"
              style={{ color: "var(--pub-text, #171A2B)" }}
            >
              {outcome.alreadySubmitted
                ? "Gracias, ya recibimos tu opinión."
                : "Tu opinión quedó enviada al local."}
            </p>
            <p
              className="mt-1 text-xs leading-5"
              style={{ color: "var(--pub-text-muted, #6B7280)" }}
            >
              No se publicó en Google.
            </p>
            {/* Solo si el backend confirmó que el sello se acreditó de verdad. */}
            {outcome.bonusGranted ? (
              <p
                className="mt-2 text-xs font-bold"
                style={{ color: "var(--pub-accent, #5C6BC0)" }}
              >
                Sumaste +1 sello por dejar tu feedback
              </p>
            ) : null}
          </div>
        </div>

        {outcome.offerGoogle && outcome.googleUrl ? (
          <GoogleBlock url={outcome.googleUrl} onClick={onGoogleClick} />
        ) : null}
      </Surface>
    );
  }

  return (
    <Surface>
      <p
        className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em]"
        style={{ color: "var(--pub-text-muted, #6B7280)" }}
      >
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        Privado · solo lo ve el negocio
      </p>

      <div
        className="mt-3 flex justify-center gap-1"
        role="radiogroup"
        aria-label="Puntaje de 1 a 5"
        onMouseLeave={() => setHovered(null)}
      >
        {SCORES.map((value) => {
          const active = (hovered ?? score ?? 0) >= value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={score === value}
              aria-label={`${value} de 5`}
              onClick={() => setScore(value)}
              onMouseEnter={() => setHovered(value)}
              disabled={sending}
              className="rounded-full p-1.5 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current active:scale-90 disabled:opacity-60"
              style={{ color: "var(--pub-text-muted, #6B7280)" }}
            >
              <Star
                className="h-8 w-8"
                strokeWidth={1.5}
                fill={active ? "#FBBF24" : "none"}
                stroke={active ? "#FBBF24" : "currentColor"}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>

      {/*
        Siempre visible, con cualquier puntaje. Antes solo aparecía debajo de
        un 1-3, que le decía al cliente "contanos" únicamente cuando la cosa
        había salido mal.
      */}
      <label className="sr-only" htmlFor="feedback-comment">
        Comentario (opcional)
      </label>
      <textarea
        id="feedback-comment"
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Contanos qué estuvo bien o qué mejorarías (opcional)"
        className="mt-3 min-h-24 w-full rounded-[14px] border p-3 text-left text-sm outline-none focus:border-current"
        style={{
          borderColor: "var(--pub-surface-border, #E3E5F0)",
          backgroundColor: "var(--pub-surface, #FFFFFF)",
          color: "var(--pub-text, #171A2B)",
        }}
      />

      <button
        type="button"
        onClick={() => void send()}
        disabled={!score || sending}
        className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] text-sm font-bold transition-opacity disabled:opacity-50"
        style={{
          backgroundColor: "var(--pub-accent, #5C6BC0)",
          color: "var(--pub-on-accent, #FFFFFF)",
        }}
      >
        {sending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Enviando…
          </>
        ) : (
          "Enviar al local"
        )}
      </button>

      <p
        className="mt-2 text-center text-[11px] leading-5"
        style={{ color: "var(--pub-text-soft, #8A91A3)" }}
      >
        Queda dentro de Flikker y no se publica en ningún lado.
        {bonusHint ? " Además te suma 1 sello extra." : ""}
      </p>

      {error ? (
        <p className="mt-2 text-center text-xs font-semibold text-[#C0392B]">
          {error}
        </p>
      ) : null}
    </Surface>
  );
}

/**
 * Google, siempre DESPUÉS del envío y siempre separado por una línea real:
 * arriba termina lo privado (ya guardado, con su sello si correspondía) y acá
 * empieza algo público y distinto. Sin la separación las dos cosas se leían
 * como un mismo paso encadenado.
 */
function GoogleBlock({
  url,
  onClick,
}: {
  url: string;
  onClick?: () => void;
}) {
  return (
    <div
      className="mt-4 border-t pt-4"
      style={{ borderColor: "var(--pub-surface-border, #E9EAF2)" }}
    >
      <p
        className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em]"
        style={{ color: "var(--pub-text-muted, #6B7280)" }}
      >
        <Globe className="h-3.5 w-3.5" aria-hidden="true" />
        Público · opcional
      </p>
      <p
        className="mt-2 text-sm font-semibold"
        style={{ color: "var(--pub-text, #171A2B)" }}
      >
        También podés compartir tu experiencia en Google
      </p>
      <p
        className="mt-1 text-xs leading-5"
        style={{ color: "var(--pub-text-muted, #6B7280)" }}
      >
        Es público y opcional: no cambia tus sellos ni tus beneficios.
      </p>
      <a
        href={url}
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
    </div>
  );
}

/** La superficie del formulario, con los tokens de la experiencia pública. */
function Surface({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="w-full rounded-[22px] border px-5 py-4 text-left"
      style={{
        backgroundColor: "var(--pub-surface, #FFFFFF)",
        borderColor: "var(--pub-surface-border, #E9EAF2)",
        color: "var(--pub-text, #171A2B)",
      }}
    >
      {children}
    </section>
  );
}
