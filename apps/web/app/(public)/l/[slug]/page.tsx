import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFeedbackData } from "../../feedback-data";
import FeedbackLanding from "./feedback-landing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getFeedbackData(slug);
  if (!data) return { title: "Flikker" };

  return {
    title: `${data.businessName} | Flikker`,
    description: `Dejanos tu opinión sobre ${data.businessName}`,
  };
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getFeedbackData(slug);
  if (!data) notFound();
  // Ruta LEGACY: su landing existe para redirigir a Google, así que sin esa
  // URL no hay nada que mostrar. El backend ya devuelve 404 en ese caso — el
  // guard solo refleja eso en el tipo, ahora que el campo puede ser `null`
  // para Check-in V2 (que usa `/r/[token]`, no esta ruta).
  if (!data.googleReviewUrl) notFound();

  return (
    <FeedbackLanding
      token={slug}
      businessName={data.businessName}
      businessLogo={data.businessLogo}
      googleReviewUrl={data.googleReviewUrl}
    />
  );
}
