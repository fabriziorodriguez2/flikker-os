"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Gift, Loader2, Sparkles, Stamp } from "lucide-react";
import WizardShell, { fieldClass, labelClass } from "./wizard-shell";

/** Uruguay-first: país, moneda y huso se asumen (ver onboarding.defaults.ts). */
const CATEGORIES = [
  { value: "cafeteria", label: "Cafetería" },
  { value: "panaderia", label: "Panadería" },
  { value: "restaurante", label: "Restaurante" },
  { value: "barberia", label: "Barbería" },
  { value: "peluqueria", label: "Peluquería" },
  { value: "estetica", label: "Estética" },
  { value: "heladeria", label: "Heladería" },
  { value: "gimnasio", label: "Gimnasio" },
  { value: "tienda", label: "Tienda" },
  { value: "otro", label: "Otro" },
];

const BENEFIT_TYPES = [
  { value: "gift", label: "Regalo" },
  { value: "discount", label: "Descuento porcentual" },
  { value: "promotion", label: "2x1" },
  { value: "upgrade", label: "Upgrade" },
  { value: "other", label: "Personalizado" },
];

const TOTAL_STEPS = 2;

type ProgramMode = "benefits" | "benefits_stamps" | null;

interface OnboardingState {
  businessId: string | null;
  businessName?: string;
  checkinToken?: string | null;
  steps: Record<string, boolean>;
  program?: {
    mode: ProgramMode;
    rewardName: string | null;
    stampsRequired: number | null;
    feedbackBonusEnabled: boolean;
  };
  benefitCount?: number;
}

interface DraftBenefit {
  title: string;
  type: string;
}

async function post(path: string, body?: unknown) {
  const res = await fetch(`/api/proxy/onboarding/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "message" in data
        ? String((data as { message: unknown }).message)
        : "No pudimos guardar. Probá de nuevo.";
    throw new Error(message);
  }
  return data;
}

/**
 * Onboarding self-service — 2 pasos.
 *
 * Paso 1 "Tu negocio": nombre, categoría, logo opcional.
 * Paso 2 "¿Cómo querés que tus clientes vuelvan?": Beneficios, o Beneficios +
 * sellos. Son conceptos DISTINTOS a propósito — un beneficio no es una
 * tarjeta ni una tarjeta es un beneficio — así que la UI nunca los mezcla:
 * elegir "Beneficios" no crea ninguna tarjeta, y "Beneficios + sellos"
 * necesita una recompensa real para la tarjeta.
 *
 * Al terminar el paso 2 se guarda todo y se cierra el onboarding directo:
 * sin regalo de bienvenida, sin diseño, sin Google, sin QR/NFC, sin
 * automatizaciones y sin pantalla de resumen — todo eso se configura después
 * dentro del producto. `/onboarding/complete` deja los defaults del negocio
 * (QR, reactivación, recordatorio de progreso) listos en silencio.
 */
export default function WizardClient() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [booting, setBooting] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Paso 1
  const [name, setName] = useState("");
  const [category, setCategory] = useState("cafeteria");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Paso 2 — elección de camino
  const [mode, setMode] = useState<ProgramMode>(null);
  // Camino "Beneficios"
  const [draftBenefits, setDraftBenefits] = useState<DraftBenefit[]>([]);
  const [newBenefitTitle, setNewBenefitTitle] = useState("");
  const [newBenefitType, setNewBenefitType] = useState("gift");
  // Camino "Beneficios + sellos"
  const [rewardType, setRewardType] = useState("gift");
  const [rewardTitle, setRewardTitle] = useState("");
  const [stamps, setStamps] = useState(5);
  const [feedbackBonus, setFeedbackBonus] = useState(false);

  /** Reanudación: el estado vive en el backend, no en el browser. */
  const boot = useCallback(async () => {
    try {
      const res = await fetch("/api/proxy/onboarding/state");
      const data = (await res.json()) as OnboardingState;
      if (data.businessName) setName(data.businessName);
      if (data.program?.stampsRequired) setStamps(data.program.stampsRequired);
      if (data.program?.rewardName) setRewardTitle(data.program.rewardName);
      if (data.program?.feedbackBonusEnabled) setFeedbackBonus(true);
      if (data.program?.mode) setMode(data.program.mode);

      if (data.businessId) {
        // El negocio ya existe (paso 1 hecho antes): sincroniza la sesión
        // para que el sidebar y el guard del panel lo conozcan si el dueño
        // navega directo a /dashboard.
        void fetch("/api/auth/sync-session", { method: "POST" });
      }

      if (!data.businessId) setStep(1);
      else if (!data.steps?.program) setStep(2);
      else setStep(3); // cerrando
    } catch {
      setError("No pudimos cargar tu progreso.");
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  // Reanudación con el paso 2 ya decidido: no hay una pantalla de resumen
  // que mostrar (pedido explícito) — cierra y manda directo al panel. Este
  // efecto vive acá, antes de cualquier `return` condicional, porque los
  // hooks no pueden depender de en qué `step` está el render.
  useEffect(() => {
    if (step === 3 && !booting) void finishOnboarding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, booting]);

  async function saveBusiness() {
    setSaving(true);
    setError(null);
    try {
      await post("business", {
        name,
        category,
        logoUrl: logoUrl ?? undefined,
      });
      await fetch("/api/auth/sync-session", { method: "POST" });
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }

  async function finishBenefitsOnly() {
    setSaving(true);
    setError(null);
    try {
      await post("benefits-only", { benefits: draftBenefits });
      await finishOnboarding();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      setSaving(false);
    }
  }

  async function finishBenefitsAndStamps() {
    setSaving(true);
    setError(null);
    try {
      await post("program", {
        rewardTitle,
        rewardType,
        stampsRequired: stamps,
        feedbackBonusEnabled: feedbackBonus,
      });
      await finishOnboarding();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      setSaving(false);
    }
  }

  /** Cierra el onboarding y va directo a /dashboard — sin resumen. */
  async function finishOnboarding() {
    await post("complete");
    await fetch("/api/auth/sync-session", { method: "POST" });
    router.push("/dashboard");
    router.refresh();
  }

  function addDraftBenefit() {
    const title = newBenefitTitle.trim();
    if (!title) return;
    setDraftBenefits((prev) => [...prev, { title, type: newBenefitType }]);
    setNewBenefitTitle("");
  }

  function removeDraftBenefit(index: number) {
    setDraftBenefits((prev) => prev.filter((_, i) => i !== index));
  }

  if (booting) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#F7F8FC]">
        <Loader2 className="h-6 w-6 animate-spin text-[#5C6BC0]" />
      </main>
    );
  }

  // ── Paso 1 — Tu negocio ──────────────────────────────────────────────
  if (step === 1) {
    return (
      <WizardShell
        step={1}
        totalSteps={TOTAL_STEPS}
        title="Tu negocio"
        subtitle="Empecemos con lo básico. Podés cambiarlo cuando quieras."
        onNext={() => void saveBusiness()}
        nextDisabled={name.trim().length < 2}
        saving={saving}
        error={error}
      >
        <div className="space-y-5">
          <label className="block">
            <span className={labelClass}>Nombre del negocio</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Panadería La Stampa"
              className={fieldClass}
              autoFocus
            />
          </label>

          <div>
            <span className={labelClass}>Categoría</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                    category === c.value
                      ? "border-[#5C6BC0] bg-[#EEF0FB] text-[#5C6BC0]"
                      : "border-[#E3E5F0] bg-white text-[#7B8295] hover:border-[#5C6BC0]"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className={labelClass}>Logo (opcional)</span>
            <div className="mt-2 flex items-center gap-3">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt=""
                  className="h-14 w-14 rounded-[12px] border border-[#E3E5F0] object-contain"
                />
              ) : null}
              <label className="inline-flex h-11 cursor-pointer items-center rounded-[12px] border border-[#E3E5F0] bg-white px-4 text-sm font-semibold text-[#5C6BC0] hover:border-[#5C6BC0]">
                {logoUrl ? "Cambiar logo" : "Subir logo"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => setLogoUrl(String(reader.result));
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      </WizardShell>
    );
  }

  // ── Paso 2 — ¿Cómo querés que tus clientes vuelvan? ─────────────────
  if (step === 2) {
    if (mode === null) {
      return (
        <WizardShell
          step={2}
          totalSteps={TOTAL_STEPS}
          title="¿Cómo querés que tus clientes vuelvan?"
          onBack={() => setStep(1)}
          onNext={() => {}}
          nextDisabled
          saving={saving}
          error={error}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode("benefits")}
              className="rounded-[18px] border-2 border-[#E3E5F0] bg-white p-6 text-left transition-colors hover:border-[#5C6BC0]"
            >
              <Gift className="h-6 w-6 text-[#5C6BC0]" />
              <p className="mt-3 font-bold text-[#171A2B]">Beneficios</p>
              <p className="mt-2 text-sm leading-6 text-[#7B8295]">
                Creá ofertas que Flikker puede usar en promociones y para
                traer clientes de vuelta.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setMode("benefits_stamps")}
              className="rounded-[18px] border-2 border-[#E3E5F0] bg-white p-6 text-left transition-colors hover:border-[#5C6BC0]"
            >
              <Stamp className="h-6 w-6 text-[#5C6BC0]" />
              <p className="mt-3 font-bold text-[#171A2B]">
                Beneficios + sellos
              </p>
              <p className="mt-2 text-sm leading-6 text-[#7B8295]">
                Además de beneficios, tus clientes juntan sellos cada vez que
                vuelven.
              </p>
            </button>
          </div>
        </WizardShell>
      );
    }

    if (mode === "benefits") {
      return (
        <WizardShell
          step={2}
          totalSteps={TOTAL_STEPS}
          title="Beneficios"
          subtitle="Podés crear tus beneficios ahora o hacerlo después desde Programa."
          onBack={() => setMode(null)}
          onNext={() => void finishBenefitsOnly()}
          nextLabel="Terminar"
          saving={saving}
          error={error}
        >
          <div className="space-y-5">
            <div className="rounded-[16px] border border-[#E3E5F0] bg-white p-5">
              <span className={labelClass}>Crear beneficio (opcional)</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {BENEFIT_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setNewBenefitType(t.value)}
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                      newBenefitType === t.value
                        ? "border-[#5C6BC0] bg-[#EEF0FB] text-[#5C6BC0]"
                        : "border-[#E3E5F0] bg-white text-[#7B8295] hover:border-[#5C6BC0]"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={newBenefitTitle}
                  onChange={(e) => setNewBenefitTitle(e.target.value)}
                  placeholder="10% de descuento"
                  className={fieldClass}
                />
                <button
                  type="button"
                  onClick={addDraftBenefit}
                  disabled={newBenefitTitle.trim().length < 2}
                  className="shrink-0 rounded-[12px] bg-[#171A2B] px-5 text-sm font-bold text-white hover:bg-[#2A2F45] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Crear beneficio
                </button>
              </div>
            </div>

            {draftBenefits.length > 0 ? (
              <ul className="space-y-2">
                {draftBenefits.map((b, i) => (
                  <li
                    key={`${b.title}-${i}`}
                    className="flex items-center justify-between rounded-[12px] border border-[#E3E5F0] bg-white px-4 py-3"
                  >
                    <span className="text-sm font-semibold text-[#171A2B]">
                      {b.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeDraftBenefit(i)}
                      className="text-xs font-semibold text-[#8891A4] hover:text-[#C0392B]"
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#8891A4]">
                Todavía no creaste ningún beneficio. No hace falta para
                terminar — podés hacerlo después desde Programa.
              </p>
            )}
          </div>
        </WizardShell>
      );
    }

    // mode === "benefits_stamps"
    return (
      <WizardShell
        step={2}
        totalSteps={TOTAL_STEPS}
        title="Beneficios + sellos"
        subtitle="Configurá la tarjeta: cuántos sellos hacen falta y qué se llevan al completarla."
        onBack={() => setMode(null)}
        onNext={() => void finishBenefitsAndStamps()}
        nextDisabled={rewardTitle.trim().length < 2}
        nextLabel="Terminar"
        saving={saving}
        error={error}
      >
        <div className="space-y-5">
          <div>
            <span className={labelClass}>Tipo de recompensa</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {BENEFIT_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setRewardType(t.value)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                    rewardType === t.value
                      ? "border-[#5C6BC0] bg-[#EEF0FB] text-[#5C6BC0]"
                      : "border-[#E3E5F0] bg-white text-[#7B8295] hover:border-[#5C6BC0]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className={labelClass}>¿Qué se llevan?</span>
            <input
              value={rewardTitle}
              onChange={(e) => setRewardTitle(e.target.value)}
              placeholder="3 medialunas gratis"
              className={fieldClass}
            />
          </label>

          <label className="block max-w-[200px]">
            <span className={labelClass}>Sellos necesarios</span>
            <input
              type="number"
              min={1}
              max={12}
              value={stamps}
              onChange={(e) =>
                setStamps(Math.min(12, Math.max(1, Number(e.target.value) || 1)))
              }
              className={fieldClass}
            />
          </label>

          <div className="rounded-[16px] border border-[#E3E5F0] bg-white p-5">
            <p className="text-sm font-bold text-[#171A2B]">
              {stamps} sellos → {rewardTitle || "tu recompensa"}
            </p>
            <p className="mt-1 flex items-center gap-2 text-xs text-[#8891A4]">
              <Check className="h-3.5 w-3.5 text-[#147A5B]" /> Cada visita
              suma 1 sello
            </p>
          </div>

          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={feedbackBonus}
              onChange={(e) => setFeedbackBonus(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#5C6BC0]"
            />
            <span className="text-[#171A2B]">
              Dar +1 sello por completar feedback
              <span className="mt-0.5 block text-xs text-[#8891A4]">
                Se otorga por dar la opinión, sin importar el puntaje.
              </span>
            </span>
          </label>

          <p className="flex items-start gap-2 rounded-[12px] bg-[#F5F6FB] px-4 py-3 text-xs leading-5 text-[#7B8295]">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#5C6BC0]" />
            Beneficios y sellos son cosas distintas: esta recompensa es lo que
            desbloquea la tarjeta, no un beneficio suelto del catálogo.
          </p>
        </div>
      </WizardShell>
    );
  }

  // step === 3: ya está todo guardado (reanudación con el paso 2 ya
  // decidido). El `useEffect` de arriba dispara el cierre — acá solo se
  // muestra el loader mientras eso termina.
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#F7F8FC]">
      <Loader2 className="h-6 w-6 animate-spin text-[#5C6BC0]" />
    </main>
  );
}
