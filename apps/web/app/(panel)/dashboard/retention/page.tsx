"use client";

import { useEffect, useState } from "react";
import { Clock, Loader2, Plus, Trash2 } from "lucide-react";
import { useCanMutate } from "../../role-context";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SequenceStep {
  id: string;
  offsetDays: number;
  messageBody: string;
}

interface SequenceView {
  enabled: boolean;
  steps: SequenceStep[];
}

interface StepDraft {
  key: string;
  offsetDays: number;
  messageBody: string;
}

// Suggested starting point (editable). Day 0 is intentionally omitted: the QR
// flow already sends a welcome message at registration.
const TEMPLATE_STEPS: Omit<StepDraft, "key">[] = [
  {
    offsetDays: 20,
    messageBody:
      "Hola {nombre}, hace un tiempo nos visitaste en {negocio}. ¡Te esperamos de nuevo!",
  },
  {
    offsetDays: 45,
    messageBody:
      "Hola {nombre}, tenemos novedades en {negocio} que te pueden interesar. ¿Te contamos?",
  },
  {
    offsetDays: 75,
    messageBody: "Hola {nombre}, ¡te extrañamos en {negocio}! Volvé a visitarnos.",
  },
];

let keyCounter = 0;
function nextKey() {
  keyCounter += 1;
  return `k${keyCounter}`;
}

const inputClass =
  "mt-1 w-full rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2 text-sm text-[#1A202C] outline-none placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RetentionPage() {
  const canMutate = useCanMutate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [steps, setSteps] = useState<StepDraft[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/proxy/retention/sequence");
      if (!res.ok) throw new Error("No pudimos cargar la secuencia.");
      const data = (await res.json()) as SequenceView;
      setEnabled(data.enabled);
      setSteps(
        data.steps.map((s) => ({
          key: s.id,
          offsetDays: s.offsetDays,
          messageBody: s.messageBody,
        })),
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Error al cargar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function updateStep(key: string, patch: Partial<StepDraft>) {
    setSteps((prev) =>
      prev.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    );
    setSaved(false);
  }

  function addStep() {
    const maxOffset = steps.reduce((m, s) => Math.max(m, s.offsetDays), 0);
    setSteps((prev) => [
      ...prev,
      { key: nextKey(), offsetDays: maxOffset + 15, messageBody: "" },
    ]);
    setSaved(false);
  }

  function removeStep(key: string) {
    setSteps((prev) => prev.filter((s) => s.key !== key));
    setSaved(false);
  }

  function useTemplate() {
    setSteps(TEMPLATE_STEPS.map((s) => ({ ...s, key: nextKey() })));
    setSaved(false);
  }

  function validate(): string | null {
    const offsets = steps.map((s) => s.offsetDays);
    if (offsets.some((o) => !Number.isInteger(o) || o < 0)) {
      return "Los días deben ser números enteros mayores o iguales a 0.";
    }
    if (new Set(offsets).size !== offsets.length) {
      return "No puede haber dos pasos con la misma cantidad de días.";
    }
    if (steps.some((s) => s.messageBody.trim().length === 0)) {
      return "Cada paso necesita un mensaje.";
    }
    return null;
  }

  async function handleSave() {
    const validationError = validate();
    if (validationError) {
      setSaveError(validationError);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/proxy/retention/sequence", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          steps: steps.map((s) => ({
            offsetDays: s.offsetDays,
            messageBody: s.messageBody.trim(),
          })),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(data.message ?? "No pudimos guardar la secuencia.");
      }
      await load();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Error al guardar.");
    } finally {
      setSaving(false);
    }
  }

  const sortedSteps = [...steps].sort((a, b) => a.offsetDays - b.offsetDays);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#1A202C]">
          Retención
        </h1>
        <p className="mt-1 text-sm text-[#8891A4]">
          Enviá mensajes automáticos por WhatsApp con el paso del tiempo. Los
          días se cuentan desde que el cliente se registró. Usá{" "}
          <code className="rounded bg-[#F5F6FA] px-1 text-[#5C6BC0]">
            {"{nombre}"}
          </code>{" "}
          y{" "}
          <code className="rounded bg-[#F5F6FA] px-1 text-[#5C6BC0]">
            {"{negocio}"}
          </code>{" "}
          para personalizar.
        </p>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center text-sm text-[#8891A4]">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Cargando…
        </div>
      ) : loadError ? (
        <div className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
          {loadError}
        </div>
      ) : (
        <>
          {/* Enabled toggle */}
          <div className="flex items-center justify-between rounded-[12px] border border-[#E8EAF0] bg-white p-5">
            <div>
              <p className="text-sm font-semibold text-[#1A202C]">
                Secuencia activa
              </p>
              <p className="mt-0.5 text-xs text-[#8891A4]">
                Cuando está activa, enviamos los mensajes en los días indicados.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              disabled={!canMutate}
              onClick={() => {
                setEnabled((v) => !v);
                setSaved(false);
              }}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                enabled ? "bg-[#5C6BC0]" : "bg-[#D0D5DD]"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  enabled ? "translate-x-[22px]" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {/* Steps */}
          {sortedSteps.length === 0 ? (
            <div className="rounded-[12px] border border-dashed border-[#E8EAF0] bg-white px-6 py-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF0FB] text-[#5C6BC0]">
                <Clock className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-[#1A202C]">
                Todavía no hay pasos
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-[#8891A4]">
                Definí en qué días después del registro se envía cada mensaje.
              </p>
              {canMutate ? (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={useTemplate}
                    className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0]"
                  >
                    Usar plantilla sugerida
                  </button>
                  <button
                    type="button"
                    onClick={addStep}
                    className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#E8EAF0] bg-white px-4 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA]"
                  >
                    <Plus className="h-4 w-4" />
                    Agregar paso
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              {sortedSteps.map((step) => (
                <div
                  key={step.key}
                  className="rounded-[12px] border border-[#E8EAF0] bg-white p-4"
                >
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
                        Día
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={3650}
                        value={step.offsetDays}
                        disabled={!canMutate}
                        onChange={(e) =>
                          updateStep(step.key, {
                            offsetDays: Math.max(
                              0,
                              parseInt(e.target.value || "0", 10),
                            ),
                          })
                        }
                        className={`${inputClass} w-24`}
                      />
                    </label>
                    <p className="pb-2 text-xs text-[#8891A4]">
                      días después del registro
                    </p>
                    {canMutate ? (
                      <button
                        type="button"
                        onClick={() => removeStep(step.key)}
                        aria-label="Eliminar paso"
                        className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#E8EAF0] text-[#8891A4] hover:text-[#C0392B]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <label className="mt-3 block">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
                      Mensaje
                    </span>
                    <textarea
                      value={step.messageBody}
                      disabled={!canMutate}
                      onChange={(e) =>
                        updateStep(step.key, {
                          messageBody: e.target.value.slice(0, 1000),
                        })
                      }
                      rows={2}
                      placeholder="Hola {nombre}, te esperamos de nuevo en {negocio}."
                      className={`${inputClass} resize-none`}
                    />
                  </label>
                </div>
              ))}

              {canMutate ? (
                <button
                  type="button"
                  onClick={addStep}
                  className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-dashed border-[#E8EAF0] bg-white px-4 text-sm font-semibold text-[#5C6BC0] hover:bg-[#F5F6FA]"
                >
                  <Plus className="h-4 w-4" />
                  Agregar paso
                </button>
              ) : null}
            </div>
          )}

          {saveError ? (
            <p className="rounded-[8px] border border-[#C0392B]/20 bg-[#C0392B]/10 px-3 py-2 text-sm text-[#C0392B]">
              {saveError}
            </p>
          ) : null}

          {canMutate ? (
            <div className="flex items-center justify-end gap-3">
              {saved ? (
                <span className="text-sm font-medium text-[#639922]">
                  ✓ Guardado
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-5 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Guardar cambios
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
