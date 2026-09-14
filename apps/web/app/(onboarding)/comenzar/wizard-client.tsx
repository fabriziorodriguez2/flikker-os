"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCircle2,
  Gift,
  ImagePlus,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Stamp,
  Trash2,
} from "lucide-react";
import LoyaltyCard from "@/components/public/loyalty-card";
import WizardShell, { fieldClass, labelClass } from "./wizard-shell";

export const CATEGORIES = [
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
] as const;

export const BENEFIT_TYPES = [
  {
    value: "gift",
    label: "Regalo",
    question: "¿Qué recibe el cliente?",
    placeholder: "1 café gratis",
  },
  {
    value: "discount",
    label: "Descuento",
    question: "¿Qué descuento?",
    placeholder: "10% de descuento",
  },
  {
    value: "promotion",
    label: "2x1",
    question: "¿Cuál es la promoción?",
    placeholder: "2 cafés por el precio de 1",
  },
  {
    value: "upgrade",
    label: "Upgrade",
    question: "¿Qué mejora recibe?",
    placeholder: "Tamaño grande sin costo",
  },
  {
    value: "other",
    label: "Personalizado",
    question: "¿Qué gana el cliente?",
    placeholder: "Escribí el beneficio",
  },
] as const;

const TOTAL_STEPS = 2;
type ProgramMode = "benefits" | "benefits_stamps" | null;

interface OnboardingState {
  businessId: string | null;
  businessName?: string;
  steps: Record<string, boolean>;
  program?: {
    mode: ProgramMode;
    rewardName: string | null;
    stampsRequired: number | null;
    feedbackBonusEnabled: boolean;
  };
}

interface DraftBenefit {
  title: string;
  type: string;
}

async function post(path: string, body?: unknown) {
  const response = await fetch(`/api/proxy/onboarding/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "message" in data
        ? String((data as { message: unknown }).message)
        : "No pudimos guardar. Probá de nuevo.";
    throw new Error(message);
  }
  return data;
}

export function isBusinessStepValid(name: string, category: string) {
  return (
    name.trim().length >= 2 &&
    CATEGORIES.some((item) => item.value === category)
  );
}

export default function WizardClient() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [booting, setBooting] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("cafeteria");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const [mode, setMode] = useState<ProgramMode>(null);
  const [programSetupOpen, setProgramSetupOpen] = useState(false);
  const [draftBenefits, setDraftBenefits] = useState<DraftBenefit[]>([]);
  const [newBenefitTitle, setNewBenefitTitle] = useState("");
  const [newBenefitType, setNewBenefitType] = useState("gift");
  const [editingBenefitIndex, setEditingBenefitIndex] = useState<number | null>(
    null,
  );
  const [rewardType, setRewardType] = useState("gift");
  const [rewardTitle, setRewardTitle] = useState("");
  const [stamps, setStamps] = useState(5);
  const [feedbackBonus, setFeedbackBonus] = useState(false);

  const boot = useCallback(async () => {
    try {
      const response = await fetch("/api/proxy/onboarding/state");
      const data = (await response.json()) as OnboardingState;
      if (data.businessName) setName(data.businessName);
      if (data.program?.stampsRequired) setStamps(data.program.stampsRequired);
      if (data.program?.rewardName) setRewardTitle(data.program.rewardName);
      if (data.program?.feedbackBonusEnabled) setFeedbackBonus(true);
      if (data.program?.mode) setMode(data.program.mode);
      if (data.businessId)
        void fetch("/api/auth/sync-session", { method: "POST" });

      if (!data.businessId) setStep(1);
      else if (!data.steps?.program) setStep(2);
      else setStep(3);
    } catch {
      setError("No pudimos cargar tu progreso.");
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  useEffect(() => {
    if (step === 3 && !booting) void finishOnboarding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, booting]);

  async function saveBusiness() {
    if (!isBusinessStepValid(name, category)) return;
    setSaving(true);
    setError(null);
    try {
      await post("business", { name, category, logoUrl: logoUrl ?? undefined });
      await fetch("/api/auth/sync-session", { method: "POST" });
      setStep(2);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error inesperado.");
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error inesperado.");
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error inesperado.");
      setSaving(false);
    }
  }

  async function finishOnboarding() {
    await post("complete");
    await fetch("/api/auth/sync-session", { method: "POST" });
    router.push("/dashboard");
    router.refresh();
  }

  function saveDraftBenefit() {
    const title = newBenefitTitle.trim();
    if (title.length < 2) return;
    const next = { title, type: newBenefitType };
    setDraftBenefits((current) =>
      editingBenefitIndex === null
        ? [...current, next]
        : current.map((item, index) =>
            index === editingBenefitIndex ? next : item,
          ),
    );
    setNewBenefitTitle("");
    setEditingBenefitIndex(null);
  }

  function editDraftBenefit(index: number) {
    const benefit = draftBenefits[index];
    if (!benefit) return;
    setNewBenefitTitle(benefit.title);
    setNewBenefitType(benefit.type);
    setEditingBenefitIndex(index);
  }

  function removeDraftBenefit(index: number) {
    setDraftBenefits((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
    if (editingBenefitIndex === index) {
      setEditingBenefitIndex(null);
      setNewBenefitTitle("");
    }
  }

  if (booting || step === 3) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#F7F8FC]">
        <Loader2 className="h-6 w-6 animate-spin text-[#5C6BC0]" />
      </main>
    );
  }

  if (step === 1) {
    return (
      <WizardShell
        step={1}
        totalSteps={TOTAL_STEPS}
        title="Tu negocio"
        subtitle="Empecemos por cómo se presenta tu negocio. Podés cambiarlo después."
        onNext={() => void saveBusiness()}
        nextDisabled={!isBusinessStepValid(name, category)}
        saving={saving}
        error={error}
        aside={
          <BusinessPreview name={name} category={category} logoUrl={logoUrl} />
        }
      >
        <div className="space-y-6 rounded-[18px] border border-[#E3E5F0] bg-white p-5 shadow-[0_8px_30px_rgba(22,28,45,0.04)] sm:p-6">
          <label className="block">
            <span className={labelClass}>Nombre del negocio</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Panadería La Stampa"
              className={fieldClass}
              autoFocus
            />
          </label>

          <div>
            <span className={labelClass}>Categoría</span>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {CATEGORIES.map((item) => {
                const selected = category === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setCategory(item.value)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors ${selected ? "border-[#5C6BC0] bg-[#EEF0FB] text-[#4A56A6] ring-1 ring-[#5C6BC0]/15" : "border-[#E3E5F0] bg-white text-[#6F7689] hover:border-[#AAB1DA]"}`}
                  >
                    {selected ? <Check className="h-3.5 w-3.5" /> : null}
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className={labelClass}>Logo (opcional)</span>
            <div className="mt-2.5 flex flex-col gap-3 rounded-[14px] border border-dashed border-[#CCD1DF] bg-[#FAFAFC] p-4 sm:flex-row sm:items-center">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-[#E3E5F0] bg-white">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl}
                    alt="Vista previa del logo"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <ImagePlus className="h-6 w-6 text-[#A1A8B8]" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#202333]">
                  {logoUrl ? "Tu logo está listo" : "Sumá tu logo"}
                </p>
                <p className="mt-0.5 text-xs text-[#8891A4]">
                  PNG o JPG. Se muestra frente a tus clientes.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <label className="inline-flex h-9 cursor-pointer items-center rounded-[10px] bg-[#5C6BC0] px-3.5 text-xs font-semibold text-white">
                    {logoUrl ? "Cambiar" : "Elegir archivo"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => setLogoUrl(String(reader.result));
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                  {logoUrl ? (
                    <button
                      type="button"
                      onClick={() => setLogoUrl(null)}
                      className="h-9 px-2 text-xs font-semibold text-[#8891A4] hover:text-[#C0392B]"
                    >
                      Eliminar
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </WizardShell>
    );
  }

  if (!programSetupOpen) {
    return (
      <WizardShell
        step={2}
        totalSteps={TOTAL_STEPS}
        title="¿Cómo querés que tus clientes vuelvan?"
        subtitle="Elegí cómo empezar. Las dos opciones incluyen beneficios y se pueden ajustar después."
        onBack={() => setStep(1)}
        onNext={() => setProgramSetupOpen(true)}
        nextDisabled={mode === null}
        saving={saving}
        error={error}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <ProgramChoice
            selected={mode === "benefits"}
            icon={Gift}
            title="Beneficios"
            description="Creá premios y ofertas para usar en promociones, bienvenida o reactivación."
            help="Más simple. Ideal si querés promociones y reactivación sin tarjeta."
            onClick={() => setMode("benefits")}
          >
            <div className="flex flex-wrap gap-2">
              {["10% de descuento", "Café gratis", "2x1"].map((example) => (
                <span
                  key={example}
                  className="rounded-lg border border-[#E3E5F0] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#596174]"
                >
                  {example}
                </span>
              ))}
            </div>
          </ProgramChoice>
          <ProgramChoice
            selected={mode === "benefits_stamps"}
            icon={Stamp}
            title="Beneficios + tarjeta de sellos"
            description="Además de beneficios, tus clientes acumulan sellos en cada visita y desbloquean una recompensa."
            help="Ideal si querés premiar visitas frecuentes."
            onClick={() => setMode("benefits_stamps")}
          >
            <div>
              <div
                className="flex gap-2"
                aria-label="Ejemplo de tarjeta de cinco visitas"
              >
                {[false, false, true, true, true].map((filled, index) => (
                  <span
                    key={index}
                    className={`h-7 w-7 rounded-full border-2 ${filled ? "border-[#5C6BC0] bg-[#5C6BC0]" : "border-[#CDD2E0] bg-white"}`}
                  />
                ))}
              </div>
              <p className="mt-2 text-xs font-semibold text-[#596174]">
                5 visitas → premio
              </p>
            </div>
          </ProgramChoice>
        </div>
      </WizardShell>
    );
  }

  if (mode === "benefits") {
    const benefitMeta =
      BENEFIT_TYPES.find((item) => item.value === newBenefitType) ??
      BENEFIT_TYPES[0];
    return (
      <WizardShell
        step={2}
        totalSteps={TOTAL_STEPS}
        title="Creá tu primer beneficio"
        subtitle="Podés hacerlo ahora o después desde Programa."
        onBack={() => setProgramSetupOpen(false)}
        onNext={() => void finishBenefitsOnly()}
        nextLabel="Terminar configuración"
        saving={saving}
        error={error}
        aside={
          <BenefitPreview
            benefit={
              draftBenefits.at(-1) ??
              (newBenefitTitle.trim()
                ? { title: newBenefitTitle, type: newBenefitType }
                : null)
            }
          />
        }
      >
        <div className="space-y-5">
          <section className="rounded-[18px] border border-[#E3E5F0] bg-white p-5 sm:p-6">
            <span className={labelClass}>Tipo de beneficio</span>
            <TypePicker value={newBenefitType} onChange={setNewBenefitType} />
            <label className="mt-5 block">
              <span className="text-sm font-semibold text-[#202333]">
                {benefitMeta.question}
              </span>
              <input
                value={newBenefitTitle}
                onChange={(event) => setNewBenefitTitle(event.target.value)}
                placeholder={benefitMeta.placeholder}
                className={fieldClass}
              />
            </label>
            <button
              type="button"
              onClick={saveDraftBenefit}
              disabled={newBenefitTitle.trim().length < 2}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#202333] px-4 text-sm font-semibold text-white disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              {editingBenefitIndex === null
                ? "Agregar beneficio"
                : "Guardar cambios"}
            </button>
          </section>

          {draftBenefits.length > 0 ? (
            <div className="space-y-2">
              {draftBenefits.map((benefit, index) => (
                <div
                  key={`${benefit.title}-${index}`}
                  className="flex items-center gap-3 rounded-[14px] border border-[#DDE1EA] bg-white px-4 py-3.5"
                >
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-[#147A5B]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#202333]">
                      {benefit.title}
                    </p>
                    <p className="mt-0.5 text-xs text-[#8891A4]">
                      {BENEFIT_TYPES.find((item) => item.value === benefit.type)
                        ?.label ?? "Beneficio"}{" "}
                      · Creado
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => editDraftBenefit(index)}
                    aria-label={`Editar ${benefit.title}`}
                    className="p-2 text-[#7B8295] hover:text-[#5C6BC0]"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeDraftBenefit(index)}
                    aria-label={`Eliminar ${benefit.title}`}
                    className="p-2 text-[#7B8295] hover:text-[#C0392B]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#8891A4]">
              Si preferís, terminá ahora y crealo más adelante desde Programa.
            </p>
          )}
        </div>
      </WizardShell>
    );
  }

  const rewardMeta =
    BENEFIT_TYPES.find((item) => item.value === rewardType) ?? BENEFIT_TYPES[0];
  return (
    <WizardShell
      step={2}
      totalSteps={TOTAL_STEPS}
      title="Configurá tu tarjeta de sellos"
      subtitle="Definí la recompensa y la cantidad de visitas. Podés cambiarlo después."
      onBack={() => setProgramSetupOpen(false)}
      onNext={() => void finishBenefitsAndStamps()}
      nextDisabled={rewardTitle.trim().length < 2}
      nextLabel="Terminar configuración"
      saving={saving}
      error={error}
      aside={
        <StampCardPreview
          name={name}
          logoUrl={logoUrl}
          rewardTitle={rewardTitle}
          stamps={stamps}
        />
      }
    >
      <div className="space-y-4">
        <SetupSection
          marker="A"
          title="Recompensa"
          question="¿Qué gana el cliente?"
        >
          <TypePicker value={rewardType} onChange={setRewardType} />
          <label className="mt-5 block">
            <span className="text-sm font-semibold text-[#202333]">
              {rewardMeta.question}
            </span>
            <input
              value={rewardTitle}
              onChange={(event) => setRewardTitle(event.target.value)}
              placeholder={rewardMeta.placeholder}
              className={fieldClass}
            />
          </label>
        </SetupSection>

        <SetupSection
          marker="B"
          title="Meta"
          question="¿Cuántas visitas necesita?"
        >
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setStamps((value) => Math.max(1, value - 1))}
              aria-label="Quitar una visita"
              className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#DDE1EA] bg-white text-[#596174]"
            >
              <Minus className="h-4 w-4" />
            </button>
            <div className="flex h-12 min-w-24 items-center justify-center rounded-[12px] border border-[#DDE1EA] bg-white text-xl font-bold text-[#202333]">
              {stamps}
            </div>
            <button
              type="button"
              onClick={() => setStamps((value) => Math.min(12, value + 1))}
              aria-label="Agregar una visita"
              className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#DDE1EA] bg-white text-[#596174]"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-3 text-xs text-[#8891A4]">
            Cada visita válida suma 1 sello.
          </p>
        </SetupSection>

        <SetupSection marker="C" title="Extra opcional">
          <label className="flex cursor-pointer items-start gap-3 rounded-[12px] border border-[#E3E5F0] bg-[#FAFAFC] p-4">
            <input
              type="checkbox"
              checked={feedbackBonus}
              onChange={(event) => setFeedbackBonus(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#5C6BC0]"
            />
            <span>
              <span className="block text-sm font-semibold text-[#202333]">
                +1 sello por dejar feedback privado
              </span>
              <span className="mt-1 block text-xs leading-5 text-[#8891A4]">
                Se acredita una vez por visita y no depende de la puntuación.
              </span>
            </span>
          </label>
        </SetupSection>
      </div>
    </WizardShell>
  );
}

function BusinessPreview({
  name,
  category,
  logoUrl,
}: {
  name: string;
  category: string;
  logoUrl: string | null;
}) {
  const categoryLabel =
    CATEGORIES.find((item) => item.value === category)?.label ?? "Tu categoría";
  return (
    <PreviewShell label="Así va a aparecer">
      <div className="overflow-hidden rounded-[22px] border border-[#E3E5F0] bg-white shadow-[0_18px_50px_rgba(25,31,50,0.10)]">
        <div className="h-24 bg-gradient-to-br from-[#6F7DD5] via-[#5C6BC0] to-[#443B8F]" />
        <div className="px-5 pb-6">
          <div className="-mt-8 flex h-16 w-16 items-center justify-center overflow-hidden rounded-[16px] border-4 border-white bg-[#EEF0FB] text-xl font-bold text-[#5C6BC0] shadow-sm">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt=""
                className="h-full w-full object-contain"
              />
            ) : (
              (name.trim().charAt(0) || "F").toUpperCase()
            )}
          </div>
          <p className="mt-4 text-lg font-bold text-[#202333]">
            {name.trim() || "Tu negocio"}
          </p>
          <p className="mt-1 text-sm text-[#8891A4]">{categoryLabel}</p>
          <div className="mt-5 rounded-[12px] bg-[#F5F6FA] p-3 text-xs leading-5 text-[#6F7689]">
            Tus clientes van a reconocer tu negocio por este nombre y logo.
          </div>
        </div>
      </div>
    </PreviewShell>
  );
}

function BenefitPreview({ benefit }: { benefit: DraftBenefit | null }) {
  return (
    <PreviewShell label="Vista del cliente">
      <div className="rounded-[22px] bg-[#202333] p-4 shadow-[0_18px_50px_rgba(25,31,50,0.18)]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
          Beneficio disponible
        </p>
        <div className="mt-3 rounded-[16px] bg-white p-4">
          <Gift className="h-5 w-5 text-[#5C6BC0]" />
          <p className="mt-3 text-base font-bold text-[#202333]">
            {benefit?.title || "Tu primer beneficio"}
          </p>
          <p className="mt-1 text-xs text-[#8891A4]">
            {BENEFIT_TYPES.find((item) => item.value === benefit?.type)
              ?.label ?? "Se verá acá cuando lo agregues"}
          </p>
        </div>
        <p className="mt-4 text-center text-[11px] font-semibold text-white/60">
          Con tecnología de Flikker
        </p>
      </div>
    </PreviewShell>
  );
}

function StampCardPreview({
  name,
  logoUrl,
  rewardTitle,
  stamps,
}: {
  name: string;
  logoUrl: string | null;
  rewardTitle: string;
  stamps: number;
}) {
  return (
    <PreviewShell label="Tu tarjeta en vivo">
      <LoyaltyCard
        rewardName={rewardTitle.trim() || "Tu recompensa"}
        progress={Math.min(3, stamps)}
        target={stamps}
        appearance={{
          cardColor: "#5C6BC0",
          stampColor: "#FFFFFF",
          stampIcon: "star",
          logoUrl,
          businessName: name.trim() || "Tu negocio",
          showBusinessName: true,
        }}
      />
      <p className="mt-3 text-xs leading-5 text-[#8891A4]">
        La recompensa y los sellos cambian mientras configurás.
      </p>
    </PreviewShell>
  );
}

function PreviewShell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
        {label}
      </p>
      {children}
    </div>
  );
}

function ProgramChoice({
  selected,
  icon: Icon,
  title,
  description,
  help,
  onClick,
  children,
}: {
  selected: boolean;
  icon: typeof Gift;
  title: string;
  description: string;
  help: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`relative flex min-h-[310px] flex-col rounded-[20px] border-2 p-6 text-left transition-all ${selected ? "border-[#5C6BC0] bg-[#F5F5FF] shadow-[0_12px_32px_rgba(92,107,192,0.12)]" : "border-[#E3E5F0] bg-white hover:-translate-y-0.5 hover:border-[#AAB1DA]"}`}
    >
      {selected ? (
        <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-[#5C6BC0] px-2.5 py-1 text-[10px] font-semibold text-white">
          <Check className="h-3 w-3" /> Seleccionado
        </span>
      ) : null}
      <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[#EEF0FB] text-[#5C6BC0]">
        <Icon className="h-5 w-5" />
      </span>
      <h2 className="mt-4 pr-20 text-base font-bold text-[#202333]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#6F7689]">{description}</p>
      <div className="mt-5">{children}</div>
      <p className="mt-auto border-t border-[#E3E5F0] pt-4 text-xs leading-5 text-[#7B8295]">
        {help}
      </p>
    </button>
  );
}

function TypePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-2">
      {BENEFIT_TYPES.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(item.value)}
            className={`rounded-[10px] border px-3.5 py-2 text-xs font-semibold transition-colors ${selected ? "border-[#5C6BC0] bg-[#EEF0FB] text-[#4A56A6]" : "border-[#E3E5F0] bg-white text-[#6F7689] hover:border-[#AAB1DA]"}`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function SetupSection({
  marker,
  title,
  question,
  children,
}: {
  marker: string;
  title: string;
  question?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[18px] border border-[#E3E5F0] bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EEF0FB] text-xs font-bold text-[#5C6BC0]">
          {marker}
        </span>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
            {title}
          </p>
          {question ? (
            <h2 className="mt-1 text-base font-bold text-[#202333]">
              {question}
            </h2>
          ) : null}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
