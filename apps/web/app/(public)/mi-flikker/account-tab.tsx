"use client";

import { Loader2, LogOut, Phone } from "lucide-react";
import MiFlikkerHeader, {
  MiFlikkerMark,
} from "@/components/public/mi-flikker-header";

export interface AccountProfile {
  phone: string;
  name: string | null;
}
export interface AccountMetrics {
  places: number;
  rewards: number;
  challenges: number;
}

export default function AccountTab({
  profile,
  error = false,
  metrics,
  onLogout,
  loggingOut,
}: {
  profile: AccountProfile | null;
  error?: boolean;
  metrics: AccountMetrics | null;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <MiFlikkerHeader tab="cuenta" chip={profile?.name?.split(" ")[0]} />
      <section
        aria-label="Tu identidad"
        className="rounded-[20px] bg-[#1C1B23] p-5 text-white"
      >
        <div className="flex items-center justify-between gap-3">
          <MiFlikkerMark light />
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold"
            aria-hidden="true"
          >
            {profile?.name?.trim().slice(0, 1).toUpperCase() ?? "F"}
          </span>
        </div>
        <div className="mt-12">
          {error ? (
            <p role="alert" className="text-sm text-white/70">
              No pudimos cargar tus datos
            </p>
          ) : !profile ? (
            <p
              role="status"
              className="flex items-center gap-2 text-sm text-white/70"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando…
            </p>
          ) : (
            <>
              <h2 className="break-words text-[26px] font-bold leading-tight tracking-[-0.04em]">
                {profile.name || "Tu cuenta"}
              </h2>
              <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
                <Phone className="h-4 w-4 shrink-0" />
                <span className="break-all">{formatPhone(profile.phone)}</span>
              </p>
            </>
          )}
        </div>
      </section>
      <p className="my-3 text-[11px] leading-relaxed text-[#777780]">
        Con este número te identificamos en todos tus lugares.
      </p>
      {metrics ? (
        <div className="grid grid-cols-3 gap-2" aria-label="Tu resumen">
          {[
            [metrics.places, metrics.places === 1 ? "lugar" : "lugares"],
            [metrics.rewards, metrics.rewards === 1 ? "premio" : "premios"],
            [
              metrics.challenges,
              metrics.challenges === 1 ? "desafío" : "desafíos",
            ],
          ].map(([count, label]) => (
            <div key={label} className="rounded-[13px] bg-white px-3 py-3">
              <p className="text-xl font-bold">{count}</p>
              <p className="mt-1 text-[10px] text-[#777780]">{label}</p>
            </div>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={onLogout}
        disabled={loggingOut}
        className="mt-auto flex min-h-11 w-full items-center justify-center gap-2 rounded-[14px] border border-[#EBD4D2] bg-white px-3 py-3 text-xs font-semibold text-[#BC3934] disabled:opacity-60"
      >
        <LogOut className="h-4 w-4" />
        {loggingOut ? "Cerrando…" : "Cerrar sesión"}
      </button>
    </div>
  );
}

export function formatPhone(e164: string): string {
  const match = /^(\+\d{1,3})(\d{8})$/.exec(e164);
  if (!match) return e164;
  const [, cc, national] = match;
  return (
    cc +
    " " +
    national.slice(0, 2) +
    " " +
    national.slice(2, 5) +
    " " +
    national.slice(5)
  );
}
