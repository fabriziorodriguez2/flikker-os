import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFeedbackData } from "../../feedback-data";
import FeedbackLanding from "../../l/[slug]/feedback-landing";

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

  return (
    <FeedbackLanding
      token={token}
      businessName={data.businessName}
      businessLogo={data.businessLogo}
      googleReviewUrl={data.googleReviewUrl}
    />
  );
}
