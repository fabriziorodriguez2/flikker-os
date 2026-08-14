"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { ProgramBenefit } from "./types";

const inputClass =
  "mt-1 w-full rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2 text-sm text-[#1A202C] outline-none placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]";

/**
 * "Regalo de bienvenida" — sección propia dentro de Configuración. Es el
 * mismo mecanismo que el checkbox "Regalo de bienvenida" en Beneficios
 * (`Business.welcomeBenefitId`) presentado como su propia decisión, no
 * obligatoria: elegís UN beneficio del catálogo, o ninguno.
 */
export default function ProgramWelcomeGiftSection({
  benefits,
  welcomeGift,
  canMutate,
  onSetUse,
  onReload,
}: {
  benefits: ProgramBenefit[];
  welcomeGift: { name: string; benefitId: string } | null;
  canMutate: boolean;
  onSetUse: (
    benefitId: string,
    use: "rewardCard" | "welcomeGift" | "reactivation",
    value: boolean,
  ) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = benefits.filter((b) => b.id !== welcomeGift?.benefitId);

  async function run(action: () => Promise<void>) {
    setSaving(true);
    setError(null);
    try {
      await action();
      await onReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-5">
      <h2 className="text-base font-bold text-[#1A202C]">
        Regalo de bienvenida
      </h2>
      <p className="mt-1 text-sm text-[#8891A4]">
        Se entrega una sola vez, en la primera visita.
      </p>

      {welcomeGift ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-[#F5F6FB] px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
              Activo
            </p>
            <p className="text-sm font-semibold text-[#1A202C]">
              {welcomeGift.name}
            </p>
          </div>
          {canMutate ? (
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                void run(() =>
                  onSetUse(welcomeGift.benefitId, "welcomeGift", false),
                )
              }
              className="text-sm font-semibold text-[#8891A4] hover:text-[#C0392B] disabled:opacity-50"
            >
              Desactivar
            </button>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-[#8891A4]">
          Todavía no elegiste un regalo de bienvenida. No es obligatorio.
        </p>
      )}

      {canMutate && available.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
              {welcomeGift ? "Cambiar por" : "Elegir beneficio"}
            </span>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className={inputClass}
            >
              <option value="">Seleccionar…</option>
              {available.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!selected || saving}
            onClick={() =>
              void run(async () => {
                await onSetUse(selected, "welcomeGift", true);
                setSelected("");
              })
            }
            className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {welcomeGift ? "Cambiar" : "Activar"}
          </button>
        </div>
      ) : null}

      {canMutate && benefits.length === 0 ? (
        <p className="mt-4 text-sm text-[#8891A4]">
          Todavía no creaste ningún beneficio para poder elegirlo como regalo
          de bienvenida.
        </p>
      ) : null}

      {error ? <p className="mt-3 text-sm text-[#C0392B]">{error}</p> : null}
    </section>
  );
}
