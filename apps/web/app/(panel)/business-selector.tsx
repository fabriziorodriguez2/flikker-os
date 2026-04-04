'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SessionMembership } from '@/lib/auth';

interface BusinessSelectorProps {
  memberships: SessionMembership[];
  activeBusinessId: string | null;
  activeBusinessName: string | null;
}

export default function BusinessSelector({
  memberships,
  activeBusinessId,
  activeBusinessName,
}: BusinessSelectorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function selectBusiness(businessId: string) {
    setLoading(true);
    try {
      await fetch('/api/auth/select-business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId }),
      });
      router.push('/dashboard');
      router.refresh();
    } finally {
      setLoading(false);
      setOpen(false);
    }
  }

  if (memberships.length <= 1) {
    return (
      <p className="text-sm font-medium text-zinc-900 truncate">
        {activeBusinessName ?? 'Sin negocio'}
      </p>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="w-full text-left text-sm font-medium text-zinc-900 truncate hover:text-zinc-600 transition-colors disabled:opacity-50"
      >
        {activeBusinessName ?? 'Seleccionar negocio'}
        <span className="ml-1 text-xs text-zinc-400">▼</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-full bg-white border border-zinc-200 rounded-lg shadow-lg z-50">
          {memberships.map((m) => (
            <button
              key={m.businessId}
              onClick={() => selectBusiness(m.businessId)}
              disabled={loading}
              className={`w-full text-left px-3 py-2 text-sm transition-colors first:rounded-t-lg last:rounded-b-lg ${
                m.businessId === activeBusinessId
                  ? 'bg-zinc-100 text-zinc-900 font-medium'
                  : 'text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              {m.business.name}
              <span className="ml-1 text-xs text-zinc-400">{m.role}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
