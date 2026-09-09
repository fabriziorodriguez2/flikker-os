"use client";

import FeedbackForm, { type FeedbackOutcome } from "./feedback-form";

interface CheckinFeedbackResponse {
  alreadySubmitted: boolean;
  bonusGranted: boolean;
  offerGoogle: boolean;
  googleUrl: string | null;
}

/**
 * "¿Cómo fue tu experiencia?" dentro del check-in — wrapper de CONTEXTO.
 *
 * Todo el cuerpo de la encuesta (escala, comentario, envío, confirmación y el
 * bloque de Google) vive en `FeedbackForm`, compartido con el landing del
 * WhatsApp (`/r/{token}`): las dos entradas tienen que preguntar lo mismo, de
 * la misma forma. Acá solo queda lo propio de esta entrada — el endpoint de
 * sesión y el evento de tracking del link de Google.
 *
 * El sello extra lo otorga el backend al guardar el feedback, antes de que
 * este componente sepa si Google llega a abrirse: nada de lo que pase después
 * puede quitarlo.
 */
export default function CheckinFeedbackCard({
  hasActiveGoal,
  onReviewLinkClicked,
}: {
  /** Solo con tarjeta activa se menciona el sello: nunca se promete de más. */
  hasActiveGoal: boolean;
  onReviewLinkClicked?: () => void;
}) {
  async function submit(
    score: number,
    comment?: string,
  ): Promise<FeedbackOutcome> {
    const res = await fetch("/api/checkin/session/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score, comment }),
    });
    const data = (await res
      .json()
      .catch(() => null)) as CheckinFeedbackResponse | null;
    if (!res.ok || !data) throw new Error("feedback failed");
    return {
      alreadySubmitted: data.alreadySubmitted,
      bonusGranted: data.bonusGranted,
      offerGoogle: data.offerGoogle,
      googleUrl: data.googleUrl,
    };
  }

  return (
    <FeedbackForm
      submit={submit}
      bonusHint={hasActiveGoal}
      onGoogleClick={onReviewLinkClicked}
    />
  );
}
