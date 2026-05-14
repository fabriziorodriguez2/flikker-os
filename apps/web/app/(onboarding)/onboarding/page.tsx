"use client";

import { FormEvent, ReactNode, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Check,
  ChevronRight,
  Loader2,
  MessageCircle,
  Pencil,
  Star,
} from "lucide-react";
import PhoneInput from "@/components/ui/phone-input";

const VERTICAL_OPTIONS = [
  { value: "dental", label: "Clínica dental" },
  { value: "estetica", label: "Centro de estética" },
  { value: "fisio", label: "Fisioterapia" },
  { value: "medico", label: "Consultorio médico" },
  { value: "nutricion", label: "Nutrición" },
  { value: "gimnasio", label: "Gimnasio/yoga/pilates" },
  { value: "otro", label: "Otro" },
];

const TIMEZONE_OPTIONS = [
  { value: "America/Montevideo", label: "América / Montevideo (UY)" },
  {
    value: "America/Argentina/Buenos_Aires",
    label: "América / Buenos Aires (AR)",
  },
  { value: "America/Santiago", label: "América / Santiago (CL)" },
  { value: "America/Sao_Paulo", label: "América / São Paulo (BR)" },
  { value: "America/Bogota", label: "América / Bogotá (CO)" },
  { value: "America/Lima", label: "América / Lima (PE)" },
  { value: "America/Mexico_City", label: "América / Ciudad de México" },
];

interface CreatedBusiness {
  id: string;
  name: string;
}

interface GoogleVerification {
  placeId: string;
  name: string;
  rating: number | null;
  reviewCount: number;
}

interface WhatsAppVerification {
  phone: string;
  connected: boolean;
}

interface WizardState {
  businessId: string | null;
  businessName: string;
  vertical: string;
  timezone: string;
  phone: string;
  google: GoogleVerification | null;
  whatsapp: WhatsAppVerification | null;
}

const initialWizard: WizardState = {
  businessId: null,
  businessName: "",
  vertical: "",
  timezone: "America/Montevideo",
  phone: "",
  google: null,
  whatsapp: null,
};

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [wizard, setWizard] = useState<WizardState>(initialWizard);

  return (
    <OnboardingLayout currentStep={currentStep}>
      {currentStep === 1 ? (
        <BusinessStep
          initial={{
            name: wizard.businessName,
            vertical: wizard.vertical,
            timezone: wizard.timezone,
            phone: wizard.phone,
          }}
          onCreated={(business, draft) => {
            setWizard((current) => ({
              ...current,
              businessId: business.id,
              businessName: business.name,
              vertical: draft.vertical,
              timezone: draft.timezone,
              phone: draft.phone,
            }));
            setCurrentStep(2);
          }}
        />
      ) : null}

      {currentStep === 2 && wizard.businessId ? (
        <GoogleStep
          businessId={wizard.businessId}
          initial={wizard.google}
          onBack={() => setCurrentStep(1)}
          onVerified={(google) =>
            setWizard((current) => ({ ...current, google }))
          }
          onContinue={() => setCurrentStep(3)}
        />
      ) : null}

      {currentStep === 3 && wizard.businessId ? (
        <WhatsAppStep
          businessId={wizard.businessId}
          initialPhone={wizard.whatsapp?.phone ?? wizard.phone}
          verified={wizard.whatsapp}
          onBack={() => setCurrentStep(2)}
          onVerified={(whatsapp) =>
            setWizard((current) => ({ ...current, whatsapp }))
          }
          onContinue={() => setCurrentStep(4)}
        />
      ) : null}

      {currentStep === 4 ? (
        <SummaryStep
          wizard={wizard}
          onEdit={(step) => setCurrentStep(step)}
          onGoToDashboard={() => router.push("/dashboard")}
        />
      ) : null}
    </OnboardingLayout>
  );
}

function OnboardingLayout({
  currentStep,
  children,
}: {
  currentStep: number;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#F5F6FA] px-5 py-8 font-sans text-[#1A202C]">
      <Link
        href="/dashboard"
        className="fixed left-5 top-5 z-20 inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-[#8891A4] hover:text-[#1A202C] hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        <span>Volver a mis negocios</span>
      </Link>

      <div className="mx-auto flex w-full max-w-[760px] flex-col items-center">
        <p className="flikker-brand-text text-[22px] font-bold leading-none text-[#5C6BC0]">
          flikker.
        </p>
        <ProgressBar currentStep={currentStep} />
        <div className="mt-10 w-full">{children}</div>
      </div>
    </main>
  );
}

function ProgressBar({ currentStep }: { currentStep: number }) {
  const steps = [
    "Tu negocio",
    "Conectar Google",
    "Conectar WhatsApp",
    "Resumen",
  ];

  return (
    <div className="mt-10 w-full max-w-[560px]">
      <div className="grid grid-cols-4 items-start">
        {steps.map((label, index) => {
          const step = index + 1;
          const completed = step < currentStep;
          const active = step === currentStep;

          return (
            <div key={label} className="relative flex flex-col items-center">
              {index > 0 ? (
                <span
                  className={`absolute right-1/2 top-[15px] h-px w-full ${
                    completed || active ? "bg-[#639922]" : "bg-[#E8EAF0]"
                  }`}
                  aria-hidden="true"
                />
              ) : null}
              <span
                className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold ${
                  completed
                    ? "border-[#639922] bg-[#639922] text-white"
                    : active
                      ? "border-[#5C6BC0] bg-[#5C6BC0] text-white"
                      : "border-[#E8EAF0] bg-white text-[#8891A4]"
                }`}
              >
                {completed ? <Check className="h-4 w-4" /> : step}
              </span>
              <span
                className={`mt-3 text-center text-xs font-semibold ${
                  active ? "text-[#5C6BC0]" : "text-[#8891A4]"
                }`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BusinessStep({
  initial,
  onCreated,
}: {
  initial: {
    name: string;
    vertical: string;
    timezone: string;
    phone: string;
  };
  onCreated: (
    business: CreatedBusiness,
    draft: { vertical: string; timezone: string; phone: string },
  ) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [vertical, setVertical] = useState(initial.vertical);
  const [timezone, setTimezone] = useState(
    initial.timezone || "America/Montevideo",
  );
  const [phone, setPhone] = useState(initial.phone);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canContinue = useMemo(
    () => Boolean(name.trim() && vertical.trim()),
    [name, vertical],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canContinue || loading) return;

    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/proxy/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          vertical,
          timezone,
          phone,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as
        | CreatedBusiness
        | { message?: string };

      if (!response.ok || !("id" in data)) {
        throw new Error(
          "message" in data
            ? data.message
            : "No pudimos crear el negocio. Probá de nuevo.",
        );
      }

      onCreated(data, { vertical, timezone, phone });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No pudimos crear el negocio. Probá de nuevo.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <WizardCard badge="Paso 1 de 4" title="Contanos sobre tu negocio">
      <p className="mt-3 text-sm text-[#8891A4]">
        Lo básico para empezar a generar reseñas.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Field label="Nombre del negocio">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            className={inputClassName}
            placeholder="Clínica Sonrisa Pocitos"
          />
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Rubro">
            <select
              value={vertical}
              onChange={(event) => setVertical(event.target.value)}
              required
              className={inputClassName}
            >
              <option value="" disabled>
                Seleccioná un rubro
              </option>
              {VERTICAL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Zona horaria">
            <select
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className={inputClassName}
            >
              {TIMEZONE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <PhoneInput
          label="Teléfono de contacto"
          value={phone}
          onChange={setPhone}
        />
        <p className="-mt-2 text-xs text-[#8891A4]">
          Usamos este número solo para soporte. No se muestra a tus pacientes.
        </p>

        <FormError message={error} />

        <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[#8891A4]">Se guarda automáticamente</p>
          <PrimaryButton disabled={!canContinue || loading} loading={loading}>
            Continuar
          </PrimaryButton>
        </div>
      </form>
    </WizardCard>
  );
}

function GoogleStep({
  businessId,
  initial,
  onBack,
  onVerified,
  onContinue,
}: {
  businessId: string;
  initial: GoogleVerification | null;
  onBack: () => void;
  onVerified: (google: GoogleVerification) => void;
  onContinue: () => void;
}) {
  const [placeId, setPlaceId] = useState(initial?.placeId ?? "");
  const [verification, setVerification] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    if (!placeId.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/proxy/businesses/${businessId}/verify-google-place?placeId=${encodeURIComponent(
          placeId.trim(),
        )}`,
      );
      const data = (await response.json().catch(() => ({}))) as
        | Omit<GoogleVerification, "placeId">
        | { message?: string };
      if (!response.ok || !("name" in data)) {
        throw new Error("No encontramos ese negocio");
      }
      const next = { ...data, placeId: placeId.trim() };
      setVerification(next);
      onVerified(next);
    } catch {
      setVerification(null);
      setError("No encontramos ese negocio");
    } finally {
      setLoading(false);
    }
  }

  return (
    <WizardCard badge="Paso 2 de 4" title="Conectá tu ficha de Google">
      <p className="mt-3 text-sm text-[#8891A4]">
        Pegá tu Google Place ID. Vamos a importar tus reseñas existentes y
        empezar a sumar nuevas.
      </p>

      <div className="mt-6">
        <Field label="Google Place ID">
          <div className="flex gap-2">
            <input
              value={placeId}
              onChange={(event) => {
                setPlaceId(event.target.value);
                setVerification(null);
                setError(null);
              }}
              className={inputClassName}
              placeholder="ChIJN1t_tDeuEmsRUsoyG83frY4"
            />
            <button
              type="button"
              onClick={() => void verify()}
              disabled={!placeId.trim() || loading}
              className="inline-flex h-12 min-w-24 items-center justify-center rounded-lg border border-[#E8EAF0] bg-white px-4 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA] disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Verificar"
              )}
            </button>
          </div>
        </Field>

        <a
          href="https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex text-xs font-semibold text-[#5C6BC0] hover:underline"
        >
          ¿Cómo encuentro mi Place ID? Buscar →
        </a>
      </div>

      {verification ? (
        <>
          <SuccessPanel
            className="mt-6"
            title={verification.name}
            meta={`★ ${formatRating(verification.rating)} · ${verification.reviewCount} reseñas en Google`}
            status="Verificado"
          />
          <div className="mt-3 inline-flex w-full items-center gap-2 rounded-lg bg-[#5C6BC0]/10 px-4 py-3 text-sm font-medium text-[#5C6BC0]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>
              Importando tus reseñas en segundo plano... podés continuar.
            </span>
          </div>
        </>
      ) : null}
      <FormError message={error} />

      <StepActions
        onBack={onBack}
        onContinue={onContinue}
        continueDisabled={!verification}
      />
    </WizardCard>
  );
}

function WhatsAppStep({
  businessId,
  initialPhone,
  verified,
  onBack,
  onVerified,
  onContinue,
}: {
  businessId: string;
  initialPhone: string;
  verified: WhatsAppVerification | null;
  onBack: () => void;
  onVerified: (whatsapp: WhatsAppVerification) => void;
  onContinue: () => void;
}) {
  const [phone, setPhone] = useState(verified?.phone ?? initialPhone);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<"idle" | "ok" | "error">(
    verified?.connected ? "ok" : "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    if (!phone.trim() || loading) return;
    setLoading(true);
    setError(null);
    setState("idle");
    try {
      const response = await fetch(
        `/api/proxy/businesses/${businessId}/verify-whatsapp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        },
      );
      const data = (await response.json().catch(() => ({}))) as
        | { connected?: boolean }
        | { message?: string };
      if (!response.ok || !("connected" in data) || !data.connected) {
        throw new Error(
          "message" in data
            ? data.message
            : "No pudimos verificar la conexión.",
        );
      }
      const next = { phone, connected: true };
      setState("ok");
      onVerified(next);
    } catch (err) {
      setState("error");
      setError(
        err instanceof Error
          ? err.message
          : "No pudimos verificar la conexión.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <WizardCard badge="Paso 3 de 4" title="Conectá tu WhatsApp">
      <p className="mt-3 text-sm text-[#8891A4]">
        El número desde el que vas a enviar pedidos de reseña a tus pacientes.
      </p>

      <div className="mt-6">
        <PhoneInput
          label="Número de WhatsApp"
          value={phone}
          onChange={(value) => {
            setPhone(value);
            setState("idle");
          }}
          placeholder="99 555 222"
        />
      </div>

      {state === "idle" ? (
        <div className="mt-4 rounded-lg border border-[#E8EAF0] bg-[#F5F6FA] px-4 py-3 text-sm text-[#8891A4]">
          Verificá la conexión para recibir un mensaje de prueba de Flikker.
        </div>
      ) : null}

      {state === "ok" ? (
        <SuccessPanel
          className="mt-4"
          title="Conexión verificada"
          meta={`Mensaje de prueba entregado a +598 ${phone}`}
          status="activo"
        />
      ) : null}

      {state === "error" ? (
        <div className="mt-4 rounded-lg border border-[#C0392B]/20 bg-[#C0392B]/10 px-4 py-3 text-sm text-[#C0392B]">
          {error ?? "No pudimos verificar la conexión."}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void verify()}
        disabled={!phone.trim() || loading}
        className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#E8EAF0] bg-white px-4 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA] disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {state === "ok" ? "Verificar conexión nuevamente" : "Verificar conexión"}
      </button>

      <StepActions
        onBack={onBack}
        onContinue={onContinue}
        continueDisabled={state !== "ok"}
      />
    </WizardCard>
  );
}

function SummaryStep({
  wizard,
  onEdit,
  onGoToDashboard,
}: {
  wizard: WizardState;
  onEdit: (step: number) => void;
  onGoToDashboard: () => void;
}) {
  const verticalLabel =
    VERTICAL_OPTIONS.find((option) => option.value === wizard.vertical)?.label ??
    wizard.vertical;
  const timezoneLabel =
    TIMEZONE_OPTIONS.find((option) => option.value === wizard.timezone)?.label ??
    wizard.timezone;

  return (
    <WizardCard badge="Paso 4 de 4" title="Casi listo, revisá los datos">
      <p className="mt-3 text-sm text-[#8891A4]">
        Si algo no es correcto podés editarlo. Después podés cambiar todo desde
        tu panel.
      </p>

      <div className="mt-6 space-y-3">
        <SummaryCard
          icon={<Building2 className="h-5 w-5" />}
          title="Negocio"
          text={`${wizard.businessName} · ${verticalLabel} · ${timezoneLabel}`}
          onEdit={() => onEdit(1)}
        />
        <SummaryCard
          icon={<Star className="h-5 w-5" />}
          title="Google"
          text={
            wizard.google
              ? `${wizard.google.name} · ${formatRating(
                  wizard.google.rating,
                )} · ${wizard.google.reviewCount} reseñas · Verificado`
              : "Sin verificar"
          }
          onEdit={() => onEdit(2)}
        />
        <SummaryCard
          icon={<MessageCircle className="h-5 w-5" />}
          title="WhatsApp"
          text={
            wizard.whatsapp?.connected
              ? `+598 ${wizard.whatsapp.phone} · Conexión activa`
              : "Sin verificar"
          }
          onEdit={() => onEdit(3)}
        />
      </div>

      <button
        type="button"
        onClick={onGoToDashboard}
        className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#5C6BC0] px-6 text-sm font-semibold text-white hover:bg-[#4e5db0]"
      >
        Ir a mi panel
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </WizardCard>
  );
}

function WizardCard({
  badge,
  title,
  children,
}: {
  badge: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#E8EAF0] bg-white p-8">
      <p className="inline-flex rounded-full bg-[#5C6BC0]/10 px-3 py-1 text-xs font-semibold text-[#5C6BC0]">
        {badge}
      </p>
      <h1 className="mt-5 font-display text-[28px] font-bold leading-tight text-[#1A202C]">
        {title}
      </h1>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-[#1A202C]">
        {label}
      </span>
      {children}
    </label>
  );
}

function StepActions({
  onBack,
  onContinue,
  continueDisabled,
}: {
  onBack: () => void;
  onContinue: () => void;
  continueDisabled: boolean;
}) {
  return (
    <div className="mt-8 flex items-center justify-between">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#E8EAF0] bg-white px-4 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA]"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver
      </button>
      <button
        type="button"
        onClick={onContinue}
        disabled={continueDisabled}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#5C6BC0] px-6 text-sm font-semibold text-white hover:bg-[#4e5db0] disabled:cursor-not-allowed disabled:opacity-50"
      >
        Continuar
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function PrimaryButton({
  disabled,
  loading,
  children,
}: {
  disabled: boolean;
  loading: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#5C6BC0] px-6 text-sm font-semibold text-white hover:bg-[#4e5db0] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      <span>{loading ? "Guardando..." : children}</span>
      {!loading ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : null}
    </button>
  );
}

function SuccessPanel({
  title,
  meta,
  status,
  className = "",
}: {
  title: string;
  meta: string;
  status: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-4 rounded-lg border border-[#639922]/20 bg-[#639922]/10 px-4 py-4 ${className}`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-[#639922]">
        <Check className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[#1A202C]">{title}</p>
        <p className="mt-1 text-xs text-[#8891A4]">{meta}</p>
      </div>
      <span className="text-xs font-semibold text-[#639922]">{status}</span>
    </div>
  );
}

function SummaryCard({
  icon,
  title,
  text,
  onEdit,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-[#E8EAF0] bg-white px-4 py-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#5C6BC0]/10 text-[#5C6BC0]">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[#1A202C]">{title}</p>
        <p className="mt-1 truncate text-xs text-[#8891A4]">{text}</p>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex items-center gap-1 text-sm font-semibold text-[#5C6BC0] hover:underline"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        Editar
      </button>
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mt-4 rounded-lg border border-[#C0392B]/20 bg-[#C0392B]/10 px-4 py-3 text-sm text-[#C0392B]">
      {message}
    </div>
  );
}

const inputClassName =
  "h-12 w-full rounded-lg border border-[#E8EAF0] bg-white px-4 text-sm text-[#1A202C] outline-none placeholder:text-[#8891A4] focus:border-[#5C6BC0]";

function formatRating(value: number | null) {
  return value === null ? "sin datos" : value.toFixed(1);
}
