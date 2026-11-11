"use client";

import { useEffect, useState } from "react";

type Mode = "OFF" | "DRY_RUN" | "PILOT";

const LABELS: Record<Mode, string> = {
  OFF: "Apagado",
  DRY_RUN: "Simulación (no contacta a nadie)",
  PILOT: "Piloto (recluta de verdad vía Autopilot)",
};

/**
 * Rollout del modo autónomo de Intelligence por negocio. PILOT pide una
 * confirmación explícita acá y el backend vuelve a verificar política
 * aceptada, sin pausa y costo por mensaje cargado.
 */
export default function AutonomyModeClient({ businessId }: { businessId: string }) {
  const base = `/api/proxy/platform/businesses/${businessId}/autonomy`;
  const [mode, setMode] = useState<Mode | null>(null);
  const [next, setNext] = useState<Mode>("OFF");
  const [groupSize, setGroupSize] = useState("10");
  const [confirmPilot, setConfirmPilot] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch(base)
      .then((res) => (res.ok ? (res.json() as Promise<{ mode: Mode; pilotGroupSize: number }>) : null))
      .then((data) => {
        if (!data) return;
        setMode(data.mode);
        setNext(data.mode);
        setGroupSize(String(data.pilotGroupSize));
      });
  }, [base]);

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: next,
          pilotGroupSize: Number(groupSize),
          ...(next === "PILOT" ? { confirmPilot } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string; mode?: Mode };
      if (!res.ok) throw new Error(body.message ?? "No se pudo guardar");
      setMode(body.mode ?? next);
      setConfirmPilot(false);
      setStatus("Modo actualizado.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  if (mode === null) return null;
  return (
    <section className="mt-6 rounded-[12px] border border-[#E8EAF0] bg-white p-5">
      <h2 className="text-sm font-semibold text-[#1A202C]">Intelligence — modo autónomo</h2>
      <p className="mt-1 text-xs text-[#8891A4]">
        Actual: {LABELS[mode]}. Rollout: Apagado → Simulación unos días → Piloto acotado. Ver
        docs/intelligence-autonomy-rollout.md.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={next}
          onChange={(e) => setNext(e.target.value as Mode)}
          className="h-9 rounded-[8px] border border-[#E3E5F0] px-2 text-sm"
        >
          {(Object.keys(LABELS) as Mode[]).map((m) => (
            <option key={m} value={m}>
              {LABELS[m]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-[#5F6780]">
          Clientes por día
          <input
            inputMode="numeric"
            value={groupSize}
            onChange={(e) => setGroupSize(e.target.value)}
            className="h-9 w-16 rounded-[8px] border border-[#E3E5F0] px-2 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || (next === "PILOT" && !confirmPilot)}
          className="h-9 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          Guardar
        </button>
      </div>
      {next === "PILOT" ? (
        <label className="mt-3 flex items-start gap-2 text-xs text-[#8A5A00]">
          <input type="checkbox" checked={confirmPilot} onChange={(e) => setConfirmPilot(e.target.checked)} />
          <span>
            Confirmo el piloto con envíos reales: el dueño lo aprobó, la política está aceptada y revisé la última
            simulación.
          </span>
        </label>
      ) : null}
      {status ? <p className="mt-2 text-xs text-[#5F6780]">{status}</p> : null}
    </section>
  );
}
