'use client';

import FlikkerLockup from '@/components/brand/flikker-lockup';

type BrandPreviewCardProps = {
  businessName: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  shortBio: string;
  signatureText: string;
};

export default function BrandPreviewCard({
  businessName,
  logoUrl,
  primaryColor,
  secondaryColor,
  shortBio,
  signatureText,
}: BrandPreviewCardProps) {
  const accent = primaryColor.trim() || 'var(--brand-accent)';
  const secondary = secondaryColor.trim() || 'var(--brand-primary)';

  return (
    <div className="rounded-[28px] border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-[var(--shadow-card)]">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-soft)]">
        Vista previa
      </p>

      <div className="mt-5 rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2">
            <FlikkerLockup variant="mark" compact />
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
              Flikker
            </span>
          </div>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={`Logo de ${businessName}`}
              className="h-14 w-14 rounded-2xl border border-[color:var(--border)] object-cover"
            />
          ) : (
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-semibold text-white"
              style={{ backgroundColor: secondary }}
            >
              {businessName.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>

        <div className="mt-6 rounded-[22px] border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: accent }} />
            <p className="text-lg font-semibold text-[color:var(--foreground)]">
              {businessName}
            </p>
          </div>

          <p className="mt-4 text-sm leading-7 text-[color:var(--text-muted)]">
            {shortBio.trim() || 'Vista previa del perfil del negocio.'}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{ backgroundColor: accent, color: '#fff' }}
            >
              Primario
            </span>
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{ backgroundColor: secondary, color: '#fff' }}
            >
              Secundario
            </span>
          </div>

          <div className="mt-6 rounded-[18px] border border-dashed border-[color:var(--border-strong)] bg-[color:var(--surface-muted)] p-4 text-sm text-[color:var(--text-muted)]">
            <p className="font-semibold text-[color:var(--foreground)]">Firma</p>
            <p className="mt-2">{signatureText.trim() || `Equipo de ${businessName}`}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
