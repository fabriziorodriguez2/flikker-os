"use client";

import { useEffect, useState } from "react";
import { Loader2, LogOut, Phone, User } from "lucide-react";

interface AccountProfile {
  phone: string;
  name: string | null;
}

/**
 * Mi Flikker → Cuenta.
 *
 * Reemplaza al popover que colgaba del avatar: ahora que la navegación es
 * una barra de 4 pestañas, "Cuenta" es una pantalla más y no un menú
 * escondido. Lo que muestra es deliberadamente lo que YA existe — el
 * teléfono probado por OTP y, si el cliente alguna vez lo dio al
 * registrarse, su nombre. Nada de editar, nada de settings: no hay backend
 * para eso y no se inventa.
 */
export default function AccountTab({
  onLogout,
  loggingOut,
}: {
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/mi-flikker/account");
        if (!res.ok) throw new Error();
        const data = (await res.json()) as AccountProfile;
        if (!cancelled) {
          setProfile(data);
          setStatus("ok");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mt-6 w-full pb-4">
      <div className="rounded-[18px] border border-[#E7E8F1] bg-white p-4">
        <div className="flex items-center gap-3.5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#EFEDFD] text-[#4A3FD1]">
            <User className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            {status === "loading" ? (
              <p className="flex items-center gap-2 text-[14px] text-[#8A90A6]">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Cargando…
              </p>
            ) : status === "error" ? (
              <p className="text-[14px] font-medium text-[#8A90A6]">
                No pudimos cargar tus datos
              </p>
            ) : (
              <>
                {profile?.name ? (
                  <p className="truncate text-[16px] font-bold text-[#1A1A24]">
                    {profile.name}
                  </p>
                ) : null}
                <p
                  className={`flex items-center gap-1.5 text-[14px] font-medium text-[#5A5A6E] ${
                    profile?.name ? "mt-0.5" : ""
                  }`}
                >
                  <Phone className="h-[14px] w-[14px] shrink-0" aria-hidden="true" />
                  {profile ? formatPhone(profile.phone) : ""}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onLogout}
        disabled={loggingOut}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-[18px] border border-[#F0DCDA] bg-white py-3.5 text-[14px] font-bold text-[#C0392B] transition-colors hover:bg-[#FBEBEA] disabled:opacity-60"
      >
        <LogOut className="h-[17px] w-[17px]" aria-hidden="true" />
        {loggingOut ? "Cerrando…" : "Cerrar sesión"}
      </button>
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
