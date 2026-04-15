import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicShell from '@/components/public/public-shell';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

interface LandingData {
  businessName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  destinationUrl: string;
  campaignName: string;
}

async function getLandingData(slug: string): Promise<LandingData | null> {
  const res = await fetch(`${API_URL}/redirects/${slug}/landing`, {
    cache: 'no-store',
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
  if (!data) return { title: 'Flikker' };

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
  const data = await getLandingData(slug);
  if (!data) notFound();

  const accentColor = data.primaryColor?.trim() || '#9188F5';

  return (
    <PublicShell
      eyebrow="Reseña"
      title={data.businessName}
      subtitle={`Llegaste desde ${data.campaignName}.`}
      footerNote="Flikker"
    >
      <div className="rounded-[28px] bg-[color:var(--surface)] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-soft)]">
              Campaña
            </p>
            <p className="mt-2 text-2xl font-semibold text-[color:var(--foreground)]">
              {data.campaignName}
            </p>
          </div>

          {data.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.logoUrl}
              alt={data.businessName}
              className="h-16 w-16 rounded-2xl border border-[color:var(--border)] object-cover"
            />
          ) : (
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl text-xl font-semibold text-white"
              style={{ backgroundColor: accentColor }}
            >
              {data.businessName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <div className="mt-6 rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-5">
          <p className="text-sm leading-7 text-[color:var(--text-muted)]">
            Tu reseña ayuda a otras personas a conocer la experiencia del negocio.
          </p>
        </div>

        <a
          href={data.destinationUrl}
          rel="noopener noreferrer"
          className="mt-6 inline-flex w-full items-center justify-center rounded-[20px] px-6 py-4 text-base font-semibold text-white shadow-[0_18px_34px_rgba(0,4,65,0.18)] transition-transform hover:-translate-y-0.5"
          style={{ backgroundColor: accentColor }}
        >
          Dejar reseña
        </a>

        <p className="mt-4 text-center text-xs text-[color:var(--text-soft)]">
          Serás redirigido al destino oficial de reseñas del negocio.
        </p>
      </div>
    </PublicShell>
  );
}
