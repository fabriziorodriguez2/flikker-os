"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut, User } from "lucide-react";

/**
 * El círculo de cuenta arriba a la derecha de Mi Flikker.
 *
 * Antes "Cerrar sesión" era un botón de texto debajo de los tabs — la
 * segunda cosa que se leía en toda la pantalla, para una acción que casi
 * nadie usa. Ahora es un ítem chico dentro de un menú que hay que abrir a
 * propósito: el avatar es la única superficie visible, y "Mi cuenta" +
 * "Cerrar sesión" viven adentro.
 *
 * El teléfono se pide LAZY, recién al abrir el menú por primera vez — igual
 * que los desafíos en `ChallengesTab`: no vale la pena pagar esa consulta en
 * cada carga de la pantalla si el cliente nunca toca el avatar.
 */
export default function AccountMenu({
  onLogout,
  loggingOut,
}: {
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [phoneStatus, setPhoneStatus] = useState<"idle" | "loading" | "error">(
    "idle",
  );

  useEffect(() => {
    function close(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (phoneStatus !== "idle") return;
    setPhoneStatus("loading");
    try {
      const res = await fetch("/api/mi-flikker/account");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { phone: string };
      setPhone(formatPhone(data.phone));
      setPhoneStatus("idle");
    } catch {
      setPhoneStatus("error");
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Mi cuenta"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E7E8F1] bg-white text-[#5B5BD6] transition-colors hover:bg-[#F4F5FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B5BD6] focus-visible:ring-offset-2"
      >
        <User className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Mi cuenta"
          className="absolute right-0 top-[calc(100%+8px)] z-[80] w-56 overflow-hidden rounded-[14px] border border-[#E7E8F1] bg-white p-1.5 shadow-[0_18px_48px_rgba(27,31,59,0.16)]"
        >
          <div className="px-3 py-2.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#8A90A6]">
              Mi cuenta
            </p>
            <p className="mt-1 truncate text-[14px] font-bold text-[#14151F]">
              {phoneStatus === "loading"
                ? "Cargando…"
                : phoneStatus === "error"
                  ? "No pudimos cargar tu número"
                  : phone}
            </p>
          </div>
          <div className="my-1 h-px bg-[#EFF0F6]" />
          <button
            type="button"
            role="menuitem"
            onClick={onLogout}
            disabled={loggingOut}
            className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[14px] font-semibold text-[#C0392B] transition-colors hover:bg-[#FBEBEA] disabled:opacity-60"
          >
            <LogOut className="h-[17px] w-[17px]" aria-hidden="true" />
            {loggingOut ? "Cerrando…" : "Cerrar sesión"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * `+59891624988` → `+598 91 624 988`. Best-effort: si el E.164 no tiene la
 * forma esperada (8 dígitos nacionales), se muestra tal cual llegó en vez de
 * forzar un formato que no le corresponde.
 */
function formatPhone(e164: string): string {
  const match = /^(\+\d{1,3})(\d{8})$/.exec(e164);
  if (!match) return e164;
  const [, cc, national] = match;
  return `${cc} ${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`;
}
