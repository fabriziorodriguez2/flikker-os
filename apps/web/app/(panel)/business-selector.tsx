'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SessionMembership } from '@/lib/auth';

interface BusinessSelectorProps {
  memberships: SessionMembership[];
  activeBusinessId: string | null;
  activeBusinessName: string | null;
  collapsed?: boolean;
  placement?: 'top' | 'bottom';
}

export default function BusinessSelector({
  memberships,
  activeBusinessId,
  activeBusinessName,
  collapsed = false,
  placement = 'bottom',
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
        className={`flikker-focus-ring flex items-center justify-between gap-2 rounded-xl text-left font-semibold text-[#29243D] disabled:opacity-50 ${
          collapsed
            ? 'h-9 w-9 justify-center border border-[color:var(--border)] bg-[color:var(--surface)] text-sm'
            : 'text-sm hover:text-[#5C6BC0]'
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
            <span className={`text-xs text-[#8A849B] transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
          </>
        )}
      </button>

      {open && (
        <div
          className={`absolute z-50 overflow-hidden rounded-[16px] border border-[#E4E5EB] bg-white p-1.5 shadow-[0_16px_36px_rgba(42,40,67,0.14)] ${
            placement === 'top' ? 'bottom-full mb-3' : 'top-full mt-3'
          } ${
            collapsed ? 'left-full ml-3 w-60' : 'right-0 min-w-[240px]'
          }`}
        >
          {memberships.map((m) => (
            <button
              key={m.businessId}
              onClick={() => selectBusiness(m.businessId)}
              disabled={loading}
              className={`w-full rounded-[13px] px-4 py-3 text-left text-sm transition-colors ${
                m.businessId === activeBusinessId
                  ? 'bg-[#EEF0FB] text-[#5C6BC0]'
                  : 'text-[#777187] hover:bg-[#F1F1F5] hover:text-[#302A48]'
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
