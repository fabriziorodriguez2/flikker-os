import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFeedbackData } from "../../feedback-data";
import FeedbackLanding from "../../l/[slug]/feedback-landing";
import CheckinFeedbackLanding from "./checkin-feedback-landing";

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
