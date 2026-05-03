import type { Metadata } from "next";
import { notFound } from "next/navigation";
import FeedbackLanding from "./feedback-landing";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

interface FeedbackData {
  businessName: string;
  businessLogo: string | null;
  googleReviewUrl: string;
}

async function getFeedbackData(token: string): Promise<FeedbackData | null> {
  const res = await fetch(`${API_URL}/feedback/${encodeURIComponent(token)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json() as Promise<FeedbackData>;
}

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

  return (
    <FeedbackLanding
      token={slug}
      businessName={data.businessName}
      businessLogo={data.businessLogo}
      googleReviewUrl={data.googleReviewUrl}
    />
  );
}
