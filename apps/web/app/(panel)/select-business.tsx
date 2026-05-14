'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SessionMembership } from '@/lib/auth';
import BrandLogo from '@/components/brand/brand-logo';

interface SelectBusinessProps {
  memberships: SessionMembership[];
  userName: string;
}

export default function SelectBusiness({ memberships, userName }: SelectBusinessProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function handleSelect(businessId: string) {
    setLoading(businessId);
    try {
      await fetch('/api/auth/select-business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId }),
      });
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[color:var(--background)] px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="flikker-card rounded-[28px] px-7 py-8 md:px-8 md:py-9">
          <div className="flex justify-center">
            <BrandLogo width={168} height={143} className="h-auto w-[148px] sm:w-[168px]" />
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-[color:var(--foreground)]">
            Elegí un negocio
          </h1>
          <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
            Hola, {userName}. Selecciona un negocio para continuar.
          </p>

          <div className="mt-6 flex flex-col gap-3">
            {memberships.map((m) => (
              <button
                key={m.businessId}
                onClick={() => handleSelect(m.businessId)}
                disabled={loading !== null}
                className="w-full rounded-[20px] border border-[color:var(--border)] bg-[color:var(--surface)] px-5 py-4 text-left hover:border-[color:var(--brand-accent)] hover:bg-[color:var(--surface-muted)] disabled:opacity-50"
              >
                <p className="text-base font-semibold text-[color:var(--foreground)]">
                  {m.business.name}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                  {m.role} · {m.business.slug}
                </p>
                {loading === m.businessId && (
                  <p className="mt-2 text-xs text-[color:var(--brand-accent)]">Cargando...</p>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
