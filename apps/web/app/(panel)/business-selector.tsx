'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SessionMembership } from '@/lib/auth';

interface BusinessSelectorProps {
  memberships: SessionMembership[];
  activeBusinessId: string | null;
  activeBusinessName: string | null;
  collapsed?: boolean;
}

export default function BusinessSelector({
  memberships,
  activeBusinessId,
  activeBusinessName,
  collapsed = false,
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

  const label = activeBusinessName ?? 'Negocio';

  if (memberships.length <= 1) {
    return collapsed ? (
      <div
        aria-hidden="true"
        className="h-9 w-9 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)]"
      />
    ) : (
      <p className="truncate text-sm font-semibold text-[color:var(--foreground)]">
        {label}
      </p>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        title={collapsed ? label : undefined}
        className={`flikker-focus-ring flex items-center justify-between gap-2 rounded-xl text-left font-semibold text-[color:var(--foreground)] disabled:opacity-50 ${
          collapsed
            ? 'h-9 w-9 justify-center border border-[color:var(--border)] bg-[color:var(--surface)] text-sm'
            : 'text-sm hover:opacity-80'
        }`}
      >
        {collapsed ? (
          <span
            aria-hidden="true"
            className="h-5 w-5 rounded-md bg-[color:var(--surface-muted)]"
          />
        ) : (
          <>
            <span className="max-w-[180px] truncate">{label}</span>
            <span className="text-xs text-[color:var(--text-soft)]">▾</span>
          </>
        )}
      </button>

      {open && (
        <div
          className={`absolute top-full z-50 mt-2 overflow-hidden rounded-[18px] border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-soft)] ${
            collapsed ? 'left-full ml-3 w-60' : 'right-0 min-w-[240px]'
          }`}
        >
          {memberships.map((m) => (
            <button
              key={m.businessId}
              onClick={() => selectBusiness(m.businessId)}
              disabled={loading}
              className={`w-full px-4 py-3 text-left text-sm transition-colors ${
                m.businessId === activeBusinessId
                  ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-primary)]'
                  : 'text-[color:var(--text-muted)] hover:bg-[color:var(--surface-muted)]'
              }`}
            >
              <div className="font-medium">{m.business.name}</div>
              <div className="mt-1 text-xs text-[color:var(--text-soft)]">
                {m.role} · {m.business.slug}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
