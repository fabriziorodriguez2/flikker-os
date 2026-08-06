'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

export default function LogoutButton({
  compact = false,
  sidebar = false,
}: {
  compact?: boolean;
  sidebar?: boolean;
} = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  async function handleLogout() {
    setLoading(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  const modal = open ? (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0D1B2A]/45 px-4 backdrop-blur-[3px]">
      <button
        type="button"
        aria-label="Cerrar confirmación"
        onClick={() => setOpen(false)}
        className="absolute inset-0"
      />
      <div
        className="relative z-10 w-full max-w-[420px] rounded-[12px] border border-[#E8EAF0] bg-white p-6 shadow-[0_24px_70px_rgba(13,27,42,0.22)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-dialog-title"
      >
        <div className="flex items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#F5F6FA] text-[#0D1B2A]">
            <LogOut className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p
              id="logout-dialog-title"
              className="text-base font-bold text-[#1A202C]"
            >
              ¿Seguro que querés salir?
            </p>
            <p className="mt-2 text-sm leading-6 text-[#8891A4]">
              Vas a cerrar la sesión actual.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[#E8EAF0] bg-white px-4 text-sm font-semibold text-[#1A202C] transition-colors hover:bg-[#F5F6FA] disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center rounded-[8px] bg-[#0D1B2A] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#16263A] disabled:opacity-60"
          >
            {loading ? 'Saliendo...' : 'Salir'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Salir"
        title={compact ? "Salir" : undefined}
        className={
          sidebar
            ? `flex h-11 items-center rounded-[13px] text-sm font-semibold text-[#5F5972] transition-all hover:bg-white/62 hover:text-[#D84A4A] ${
                compact ? "justify-center px-2" : "gap-3 px-3"
              }`
            : "inline-flex h-10 items-center gap-2 rounded-[13px] border border-[#5C6BC0]/20 bg-[#5C6BC0] px-3.5 text-sm font-semibold text-white shadow-[0_6px_16px_rgba(92,107,192,0.22),inset_0_1px_0_rgba(255,255,255,0.22)] transition-all hover:-translate-y-px hover:bg-[#5261B4] hover:shadow-[0_9px_20px_rgba(92,107,192,0.27)]"
        }
      >
        <LogOut aria-hidden="true" className="h-4 w-4" />
        {compact ? null : <span>Salir</span>}
      </button>
      {typeof document !== 'undefined' && modal
        ? createPortal(modal, document.body)
        : null}
    </>
  );
}
