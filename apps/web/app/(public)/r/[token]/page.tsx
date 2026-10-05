import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getFeedbackData } from "../../feedback-data";
import FeedbackLanding from "../../l/[slug]/feedback-landing";
import CheckinFeedbackLanding from "./checkin-feedback-landing";
import NoReviewFlowConfigured from "./no-review-flow-configured";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const data = await getFeedbackData(token);
  if (!data) return { title: "Flikker" };

  return {
    title: `${data.businessName} | Flikker`,
    description: `Dejanos tu opinión sobre ${data.businessName}`,
  };
}

export default async function ReviewRequestLandingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getFeedbackData(token);
  if (!data) notFound();

  // Esta ruta la comparten las dos experiencias, así que el ÚNICO ruteo que
  // hay acá es elegir el landing. Check-in V2 usa el suyo (sin gating por
  // puntaje, tolera que el negocio no tenga Google, y reconoce a quien ya
  // contestó); LEGACY sigue exactamente como estaba.
  if (data.experienceVersion === "CHECKIN_V2") {
    // Parte 6 — DIRECT_GOOGLE: sin formulario de Flikker, sin pantalla
    // intermedia artificial. Redirect real de servidor, directo a Google.
    if (data.reviewFlowMode === "DIRECT_GOOGLE") {
      if (data.googleReviewUrl) redirect(data.googleReviewUrl);
      // El negocio eligió este modo pero todavía no conectó Google — nunca
      // se manda a una URL vacía ni se revierte a mostrar el formulario
      // privado que el negocio explícitamente desactivó.
      return <NoReviewFlowConfigured businessName={data.businessName} />;
    }

    return (
      <CheckinFeedbackLanding
        token={token}
        businessName={data.businessName}
        businessLogo={data.businessLogo}
        googleReviewUrl={data.googleReviewUrl}
        alreadySubmitted={data.alreadySubmitted}
      />
    );
  }

  // LEGACY nunca llega hasta acá sin URL de Google (el backend ya devuelve
  // 404 en ese caso); el guard existe solo para no renderizar un link vacío.
  if (!data.googleReviewUrl) notFound();

  return (
    <FeedbackLanding
      token={token}
      businessName={data.businessName}
      businessLogo={data.businessLogo}
      googleReviewUrl={data.googleReviewUrl}
    />
  );
}
