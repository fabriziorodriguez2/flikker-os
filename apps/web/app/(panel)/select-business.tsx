'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SessionMembership } from '@/lib/auth';

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
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="bg-white border border-zinc-200 rounded-xl px-8 py-10 shadow-sm">
          <h1 className="text-xl font-semibold text-zinc-900">Flikker OS</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Hola, {userName}. Seleccioná un negocio para continuar.
          </p>

          <div className="mt-6 flex flex-col gap-2">
            {memberships.map((m) => (
              <button
                key={m.businessId}
                onClick={() => handleSelect(m.businessId)}
                disabled={loading !== null}
                className="w-full text-left px-4 py-3 rounded-lg border border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50 transition-colors disabled:opacity-50"
              >
                <p className="text-sm font-medium text-zinc-900">
                  {m.business.name}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {m.role} · {m.business.slug}
                </p>
                {loading === m.businessId && (
                  <p className="text-xs text-zinc-400 mt-1">Cargando...</p>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
