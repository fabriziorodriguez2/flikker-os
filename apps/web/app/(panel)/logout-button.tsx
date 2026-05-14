'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';

export default function LogoutButton() {
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[color:rgba(10,14,35,0.26)] px-4 backdrop-blur-[2px]">
      <button
        type="button"
        aria-label="Cerrar confirmación"
        onClick={() => setOpen(false)}
        className="absolute inset-0"
      />
      <div
        className="flikker-glass-tooltip relative z-10 w-full max-w-sm rounded-[24px] p-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-dialog-title"
      >
        <p
          id="logout-dialog-title"
          className="text-base font-semibold text-[color:var(--foreground)]"
        >
          ¿Seguro que querés salir?
        </p>
        <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
          Vas a cerrar la sesión actual.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-[12px] border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-xs font-semibold text-[color:var(--text-muted)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={loading}
            className="rounded-[12px] bg-[color:var(--danger-text)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
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
        className="inline-flex h-9 items-center rounded-lg border border-[#0D1B2A] bg-[#0D1B2A] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#16263A]"
      >
        Salir
      </button>
      {typeof document !== 'undefined' && modal ? createPortal(modal, document.body) : null}
    </>
  );
}
