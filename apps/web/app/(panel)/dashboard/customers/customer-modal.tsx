"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import CustomerDetailContent from "./customer-detail-content";

/**
 * Modal grande en desktop, drawer de abajo hacia arriba en mobile — mismo
 * componente, la clase responsive hace la diferencia. Es la forma normal de
 * ver un cliente desde la lista: no navega a otra página (eso queda para el
 * deep link `/dashboard/customers/[id]`, que sigue existiendo).
 */
export default function CustomerModal({
  customerId,
  onClose,
}: {
  customerId: string;
  onClose: () => void;
}) {
  // Esc cierra, igual que cualquier modal del panel.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // La página de atrás queda quieta mientras el modal está abierto, y
  // recupera su posición exacta al cerrar (ver `useBodyScrollLock`).
  useBodyScrollLock(true);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#0D1B2A]/40 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cliente"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full flex-col rounded-t-[20px] border border-[#E8EAF0] bg-white shadow-xl sm:max-w-2xl sm:rounded-[16px]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#E8EAF0] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Cliente
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#8891A4] hover:bg-[#F5F6FA]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* `overscroll-contain`: al llegar al tope de ESTE scroller, el gesto
            muere acá — no sigue empujando la página de atrás. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
          <CustomerDetailContent customerId={customerId} />
        </div>
      </div>
    </div>
  );
}
