"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

/**
 * Código del local — la prueba de presencia del check-in.
 *
 * Por qué existe: el QR de Flikker es un cartel impreso (o un soporte con
 * NFC), así que su URL es la misma para siempre. Cualquiera que la guarde
 * puede volver a abrirla mañana desde su casa, y el dedup de 8 h / 1 visita
 * por día no lo impide — justamente permite una visita nueva por día. Un QR
 * físico no puede rotar solo; lo que sí puede rotar es este código, que se
 * muestra únicamente acá adentro y cambia cada pocos minutos.
 *
 * Esta tarjeta es lo que el negocio deja a la vista en el mostrador. El
 * código se pide al backend (nunca se deriva en el navegador) y se refresca
 * antes de vencer.
 */

interface PresenceState {
  mode: "off" | "rotating_code";
  enabled: boolean;
  /** false con enabled=true: el servidor no puede firmar códigos ahora. */
  available: boolean;
  challenge: {
    code: string;
    expiresAt: string;
    secondsRemaining: number;
    windowSeconds: number;
  } | null;
}

export default function PresenceCodeCard({
  canManage,
}: {
  canManage: boolean;
}) {
  const [state, setState] = useState<PresenceState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/proxy/checkin-presence");
      if (!res.ok) throw new Error();
      setState((await res.json()) as PresenceState);
      setError(null);
    } catch {
      setError("No pudimos leer el estado del código del local.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Se vuelve a pedir justo después de que vence la ventana vigente. El
  // navegador nunca deriva el código por su cuenta: si el reloj del
  // dispositivo del mostrador está corrido, lo que manda es el servidor.
  const secondsRemaining = state?.challenge?.secondsRemaining ?? null;
  useEffect(() => {
    if (secondsRemaining === null) return;
    const delay = Math.max(5, secondsRemaining + 1) * 1000;
    const timer = window.setTimeout(() => void load(), delay);
    return () => window.clearTimeout(timer);
  }, [secondsRemaining, load]);

  async function setMode(mode: PresenceState["mode"]) {
    setSaving(true);
    try {
      const res = await fetch("/api/proxy/checkin-presence/mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error();
      setState((await res.json()) as PresenceState);
      setError(null);
    } catch {
      setError("No pudimos guardar el cambio. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  if (!state) {
    return (
      <section className="flex h-32 items-center justify-center rounded-[18px] border border-[#E8EAF0] bg-white">
        <Loader2 className="h-5 w-5 animate-spin text-[#5C6BC0]" />
      </section>
    );
  }

  return (
    <section className="rounded-[18px] border border-[#E8EAF0] bg-white p-7 sm:p-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Código del local
          </span>
          <h2 className="mt-2 font-display text-xl font-semibold tracking-[-0.02em] text-[#202333]">
            Que el QR guardado no sirva desde casa
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#5F6780]">
            Tu QR está impreso, así que su link es siempre el mismo: alguien
            puede guardarlo y volver a abrirlo otro día desde afuera. Con esto
            activado, además del QR el cliente tiene que escribir un código que
            solo se muestra en esta pantalla y cambia cada pocos minutos.
          </p>
        </div>

        {canManage ? (
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              void setMode(state.enabled ? "off" : "rotating_code")
            }
            className={`inline-flex h-10 shrink-0 items-center rounded-[10px] px-4 text-sm font-semibold disabled:opacity-50 ${
              state.enabled
                ? "border border-[#E3E5F0] bg-white text-[#202333] hover:border-[#5C6BC0]"
                : "flk-glossy bg-[#5C6BC0] text-white hover:bg-[#4F5EB0]"
            }`}
          >
            {state.enabled ? "Desactivar" : "Activar"}
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 text-sm text-[#C0392B]">{error}</p>
      ) : null}

      {state.enabled && !state.available ? (
        <p className="mt-5 rounded-[12px] border border-[#F3D9A6] bg-[#FFF8EC] px-4 py-3 text-sm text-[#8A6317]">
          Está activado, pero el servidor todavía no puede generar códigos, así
          que el check-in <strong>no</strong> los está pidiendo. Avisanos antes
          de confiar en esta protección.
        </p>
      ) : null}

      {state.enabled && state.challenge ? (
        <div className="mt-6 rounded-[14px] bg-[#F7F8FC] px-6 py-7 text-center">
          <p className="font-mono text-5xl font-bold tracking-[0.28em] text-[#202333]">
            {state.challenge.code}
          </p>
          <p className="mt-3 text-xs text-[#8891A4]">
            Cambia cada{" "}
            {Math.round(state.challenge.windowSeconds / 60)}{" "}
            {state.challenge.windowSeconds >= 120 ? "minutos" : "minuto"} ·
            Dejá esta pantalla a la vista en el mostrador.
          </p>
        </div>
      ) : null}

      {!state.enabled ? (
        <p className="mt-5 text-xs leading-5 text-[#8891A4]">
          Mientras esté desactivado, alcanza con abrir el link del QR para
          registrar una visita — también desde fuera del local.
        </p>
      ) : null}
    </section>
  );
}
