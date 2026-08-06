"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

export type ExperienceVersion = "LEGACY" | "CHECKIN_V2";

export interface ExperienceTarget {
  id: string;
  name: string;
  experienceVersion: ExperienceVersion;
  retentionEngineV2Enabled: boolean;
}

/**
 * Platform-admin control for the per-business rollout.
 *
 * Switching is reversible and never destructive: turning Check-in V2 off keeps
 * every Visit, VisitSource, session and metric, so turning it back on resumes
 * exactly where the business left off.
 */
export default function ExperienceModal({
  business,
  onClose,
  onSaved,
}: {
  business: ExperienceTarget;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [version, setVersion] = useState<ExperienceVersion>(
    business.experienceVersion,
  );
  const [retentionV2, setRetentionV2] = useState(
    business.retentionEngineV2Enabled,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changingExperience = version !== business.experienceVersion;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/proxy/platform/businesses/${business.id}/experience`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            experienceVersion: version,
            retentionEngineV2Enabled: retentionV2,
          }),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(data.message ?? "No se pudo actualizar.");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al actualizar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-[#E8EAF0] bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#1A202C]">
              Experiencia de Flikker
            </h2>
            <p className="mt-1 text-sm text-[#8891A4]">{business.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-[#8891A4] hover:text-[#1A202C]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <fieldset className="mt-5">
          <legend className="text-sm font-semibold text-[#1A202C]">
            Experiencia Flikker
          </legend>
          <div className="mt-2 space-y-2">
            {(
              [
                ["LEGACY", "Legacy", "QR de captación actual (/qr)."],
                [
                  "CHECKIN_V2",
                  "Check-in V2",
                  "Check-in digital con sesión persistente (/check-in).",
                ],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                  version === value
                    ? "border-[#5C6BC0] bg-[#EEF0FB]"
                    : "border-[#E8EAF0] bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="experienceVersion"
                  value={value}
                  checked={version === value}
                  onChange={() => setVersion(value)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-semibold text-[#1A202C]">
                    {label}
                  </span>
                  <span className="block text-xs text-[#8891A4]">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {changingExperience ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-[#FCEEDB] bg-[#FFFBF5] px-3 py-2 text-xs text-[#8A5A1B]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#D9822B]" />
            Check-in V2 cambia la experiencia pública del QR/NFC de este
            negocio. No se borra ningún dato al cambiar entre versiones.
          </p>
        ) : null}

        <div className="mt-5 rounded-lg border border-[#E8EAF0] p-3">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={retentionV2}
              onChange={(e) => setRetentionV2(e.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-semibold text-[#1A202C]">
                Motor inteligente de retención
              </span>
              <span className="block text-xs text-[#8891A4]">
                Preparado para una versión futura. Actualmente no modifica las
                campañas.
              </span>
            </span>
          </label>
        </div>

        {error ? (
          <p className="mt-3 rounded-lg border border-[#C0392B]/20 bg-[#C0392B]/10 px-3 py-2 text-sm text-[#C0392B]">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-10 items-center rounded-lg border border-[#E8EAF0] px-4 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA] disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4e5db0] disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
