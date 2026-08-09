"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import type { RetentionSettingsView } from "./types";

/**
 * Fase F §39 — deliberately the simplest possible surface: two switches, no
 * "IA que maneja tu negocio" language. Turning either off never changes what
 * Retention V2 decides — only whether its copy/explanations may be
 * AI-written instead of the existing deterministic template.
 */
export default function AiSettingsSection({
  settings,
  canMutate,
  onSaveSettings,
}: {
  settings: RetentionSettingsView;
  canMutate: boolean;
  onSaveSettings: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [saving, setSaving] = useState<"copy" | "insights" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(field: "aiCopyEnabled" | "aiInsightsEnabled", value: boolean) {
    setSaving(field === "aiCopyEnabled" ? "copy" : "insights");
    setError(null);
    try {
      await onSaveSettings({ [field]: value });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="rounded-[14px] border border-[#E8EAF0] bg-white p-5">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#5C6BC0]" />
        <div>
          <h2 className="text-base font-bold text-[#1A202C]">
            Inteligencia artificial
          </h2>
          <p className="mt-1 text-sm text-[#8891A4]">
            Flikker puede adaptar automáticamente el tono de los mensajes y
            explicar los resultados en lenguaje simple. Las reglas, los
            beneficios y las decisiones siguen controladas por el motor de
            retención — la IA nunca decide nada de eso.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <label className="flex items-center justify-between gap-3 rounded-[10px] border border-[#E8EAF0] px-3.5 py-3">
          <div>
            <p className="text-sm font-semibold text-[#1A202C]">IA para textos</p>
            <p className="mt-0.5 text-xs text-[#8891A4]">
              Redacta los mensajes de retención con un tono más natural. Si
              falla o está apagada, se usa la plantilla de siempre.
            </p>
          </div>
          <input
            type="checkbox"
            checked={settings.aiCopyEnabled}
            disabled={!canMutate || saving === "copy"}
            onChange={(e) => toggle("aiCopyEnabled", e.target.checked)}
            className="h-4 w-4 shrink-0 accent-[#5C6BC0]"
          />
        </label>

        <label className="flex items-center justify-between gap-3 rounded-[10px] border border-[#E8EAF0] px-3.5 py-3">
          <div>
            <p className="text-sm font-semibold text-[#1A202C]">
              IA para explicaciones
            </p>
            <p className="mt-0.5 text-xs text-[#8891A4]">
              Explica en palabras simples por qué el motor recomienda una
              variante. Los números y la recomendación nunca cambian.
            </p>
          </div>
          <input
            type="checkbox"
            checked={settings.aiInsightsEnabled}
            disabled={!canMutate || saving === "insights"}
            onChange={(e) => toggle("aiInsightsEnabled", e.target.checked)}
            className="h-4 w-4 shrink-0 accent-[#5C6BC0]"
          />
        </label>
      </div>

      {saving && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-[#8891A4]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…
        </p>
      )}
      {error ? <p className="mt-3 text-sm text-[#C0392B]">{error}</p> : null}
    </section>
  );
}
