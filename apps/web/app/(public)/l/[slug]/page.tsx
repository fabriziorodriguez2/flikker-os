import { notFound } from "next/navigation";
import type { Metadata } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

interface LandingData {
  businessName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  destinationUrl: string;
  campaignName: string;
}

async function getLandingData(slug: string): Promise<LandingData | null> {
  const res = await fetch(`${API_URL}/redirects/${slug}/landing`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json() as Promise<LandingData>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getLandingData(slug);
  if (!data) return { title: "Flikker" };
  return {
    title: `${data.businessName} — Flikker`,
    description: `Dejanos tu opinión sobre ${data.businessName}`,
  };
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getLandingData(slug);
  if (!data) notFound();

  const accentColor = data.primaryColor ?? "#2563eb";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm space-y-8 text-center">
        {/* Logo */}
        {data.logoUrl ? (
          <img
            src={data.logoUrl}
            alt={data.businessName}
            className="mx-auto h-20 w-20 rounded-full object-cover"
          />
        ) : (
          <div
            className="mx-auto flex h-20 w-20 items-center justify-center rounded-full text-3xl font-bold text-white"
            style={{ backgroundColor: accentColor }}
          >
            {data.businessName.charAt(0).toUpperCase()}
          </div>
        )}

        {/* Business name */}
        <h1 className="text-2xl font-semibold text-gray-900">
          {data.businessName}
        </h1>

        {/* Prompt */}
        <p className="text-gray-600">
          Tu opinión nos ayuda a mejorar. Dejanos una reseña.
        </p>

        {/* CTA */}
        <a
          href={data.destinationUrl}
          rel="noopener noreferrer"
          className="inline-block w-full rounded-lg px-6 py-3 text-lg font-medium text-white shadow-sm transition-opacity hover:opacity-90"
          style={{ backgroundColor: accentColor }}
        >
          Dejar reseña
        </a>

        {/* Branding footer */}
        <p className="pt-4 text-xs text-gray-400">Powered by Flikker</p>
      </div>
    </div>
  );
}
