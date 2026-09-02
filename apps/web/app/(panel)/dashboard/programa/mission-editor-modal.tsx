"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import type { ProgramBenefit } from "./types";
import type {
  CreateMissionPayload,
  MissionPeriodPreset,
  MissionTemplate,
} from "./mission-types";

/**
 * Editor de misión: un solo paso, no un wizard.
 *
 * Los templates son atajos que precargan este mismo formulario — no
 * configuran nada distinto ni abren otro camino. Todo lo que precargan queda
 * editable antes de crear.
 */
export default function MissionEditorModal({
  templates,
  benefits,
  onClose,
  onCreate,
}: {
  templates: MissionTemplate[];
  benefits: ProgramBenefit[];
  onClose: () => void;
  onCreate: (payload: CreateMissionPayload) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [targetVisits, setTargetVisits] = useState(3);
  const [periodPreset, setPeriodPreset] =
    useState<MissionPeriodPreset>("THIS_MONTH");
  const [periodDays, setPeriodDays] = useState(14);
  const [rewardBenefitId, setRewardBenefitId] = useState("");
  const [rewardHidden, setRewardHidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El modal solo se monta cuando está abierto, así que el lock es siempre
  // activo mientras exista.
  useBodyScrollLock(true);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function applyTemplate(template: MissionTemplate) {
    setName(template.defaults.name);
    setTargetVisits(template.defaults.targetVisits);
    setPeriodPreset(template.defaults.periodPreset);
    if (template.defaults.periodDays) {
      setPeriodDays(template.defaults.periodDays);
    }
  }

  async function submit() {
    if (!name.trim()) {
      setError("Poné un nombre para la misión.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onCreate({
        name: name.trim(),
        targetVisits,
        periodPreset,
        ...(periodPreset === "NEXT_N_DAYS" ? { periodDays } : {}),
        ...(rewardBenefitId ? { rewardBenefitId } : {}),
        rewardHiddenUntilComplete: Boolean(rewardBenefitId) && rewardHidden,
      });
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No pudimos crear la misión.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(17,22,59,0.32)] p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Nueva misión"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[20px] bg-white shadow-[0_18px_48px_rgba(17,22,59,0.22)] sm:rounded-[20px]">
        <header className="flex items-center justify-between border-b border-[#EDEFF5] px-6 py-4">
          <h2 className="font-display text-base font-bold text-[#1A202C]">
            Nueva misión
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-[9px] text-[#8891A4] transition-colors hover:bg-[#F5F3FF] hover:text-[#5C6BC0]"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8891A4]">
            Empezá desde una idea
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {templates.map((template) => (
              <button
                key={template.key}
                type="button"
                onClick={() => applyTemplate(template)}
                className="flex flex-col gap-1 rounded-[13px] border border-[#E6E9F2] bg-[#FBFBFE] px-3.5 py-3 text-left transition-colors hover:border-[#C7CEEB] hover:bg-[#F5F3FF]"
              >
                <span className="text-sm font-semibold text-[#1A202C]">
                  <span aria-hidden="true">{template.icon}</span>{" "}
                  {template.label}
                </span>
                <span className="text-xs leading-snug text-[#8891A4]">
                  {template.hint}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-[#3A4256]">
                Nombre
              </span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                placeholder="Vení 3 veces este mes"
                className="min-h-11 rounded-[11px] border border-[#DDE1EC] px-3.5 text-sm outline-none transition-colors focus:border-[#5C6BC0]"
              />
              <span className="text-xs text-[#8891A4]">
                Es el título que ve el cliente.
              </span>
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-[#3A4256]">
                  Objetivo
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={targetVisits}
                    onChange={(event) =>
                      setTargetVisits(Number(event.target.value))
                    }
                    className="min-h-11 w-20 rounded-[11px] border border-[#DDE1EC] px-3.5 text-sm outline-none transition-colors focus:border-[#5C6BC0]"
                  />
                  <span className="text-sm text-[#8891A4]">visitas</span>
                </div>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-[#3A4256]">
                  Período
                </span>
                <select
                  value={periodPreset}
                  onChange={(event) =>
                    setPeriodPreset(event.target.value as MissionPeriodPreset)
                  }
                  className="min-h-11 rounded-[11px] border border-[#DDE1EC] bg-white px-3 text-sm outline-none transition-colors focus:border-[#5C6BC0]"
                >
                  <option value="THIS_WEEK">Esta semana</option>
                  <option value="THIS_MONTH">Este mes</option>
                  <option value="NEXT_N_DAYS">Próximos N días</option>
                </select>
              </label>
            </div>

            {periodPreset === "NEXT_N_DAYS" ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-[#3A4256]">
                  Cuántos días
                </span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={periodDays}
                  onChange={(event) =>
                    setPeriodDays(Number(event.target.value))
                  }
                  className="min-h-11 w-24 rounded-[11px] border border-[#DDE1EC] px-3.5 text-sm outline-none transition-colors focus:border-[#5C6BC0]"
                />
              </label>
            ) : null}

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-[#3A4256]">
                Premio
              </span>
              <select
                value={rewardBenefitId}
                onChange={(event) => setRewardBenefitId(event.target.value)}
                className="min-h-11 rounded-[11px] border border-[#DDE1EC] bg-white px-3 text-sm outline-none transition-colors focus:border-[#5C6BC0]"
              >
                <option value="">Sin premio</option>
                {benefits.map((benefit) => (
                  <option key={benefit.id} value={benefit.id}>
                    {benefit.title}
                  </option>
                ))}
              </select>
              <span className="text-xs text-[#8891A4]">
                Se entrega solo, apenas completa las visitas.
              </span>
            </label>

            {rewardBenefitId ? (
              <label className="flex items-start gap-2.5 rounded-[13px] bg-[#F7F8FC] px-3.5 py-3">
                <input
                  type="checkbox"
                  checked={rewardHidden}
                  onChange={(event) => setRewardHidden(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[#5C6BC0]"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-[#3A4256]">
                    Mantener el premio oculto hasta completarlo
                  </span>
                  <span className="text-xs leading-snug text-[#8891A4]">
                    El cliente ve &quot;Premio secreto&quot; y cuántas visitas le
                    faltan. El premio ya está decidido: no es un sorteo.
                  </span>
                </span>
              </label>
            ) : null}

            <p className="rounded-[13px] bg-[#FFF8EC] px-3.5 py-3 text-xs leading-relaxed text-[#8A6A2F]">
              Una vez que alguien empiece la misión, el objetivo, las fechas y
              el premio quedan fijos. Vas a poder cambiarle el nombre o
              pausarla, pero para cambiar las reglas hay que crear otra.
            </p>

            {error ? (
              <p className="text-sm text-[#C0392B]">{error}</p>
            ) : null}
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-[#EDEFF5] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-[11px] px-4 text-sm font-semibold text-[#7F879C] transition-colors hover:bg-[#F0F1F6]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="min-h-11 rounded-[11px] bg-[#5C6BC0] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#4A56A6] disabled:opacity-60"
          >
            {saving ? "Creando..." : "Crear misión"}
          </button>
        </footer>
      </div>
    </div>
  );
}
