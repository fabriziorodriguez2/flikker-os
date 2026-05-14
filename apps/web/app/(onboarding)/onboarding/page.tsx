"use client";

import {
  FormEvent,
  ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  { value: "dental", label: "ClÃ­nica dental" },
  { value: "estetica", label: "Centro de estÃ©tica" },
  { value: "fisio", label: "Fisioterapia" },
  { value: "medico", label: "Consultorio mÃ©dico" },
  { value: "nutricion", label: "NutriciÃ³n" },
  { value: "gimnasio", label: "Gimnasio/yoga/pilates" },
  { value: "otro", label: "Otro" },
];

const TIMEZONE_OPTIONS = [
  { value: "America/Montevideo", label: "AmÃ©rica / Montevideo (UY)" },
  {
    value: "America/Argentina/Buenos_Aires",
    label: "AmÃ©rica / Buenos Aires (AR)",
  },
  { value: "America/Santiago", label: "AmÃ©rica / Santiago (CL)" },
  { value: "America/Sao_Paulo", label: "AmÃ©rica / SÃ£o Paulo (BR)" },
  { value: "America/Bogota", label: "AmÃ©rica / BogotÃ¡ (CO)" },
  { value: "America/Lima", label: "AmÃ©rica / Lima (PE)" },
  { value: "America/Mexico_City", label: "AmÃ©rica / Ciudad de MÃ©xico" },
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
  existingBusiness: boolean;
}

const initialWizard: WizardState = {
  businessId: null,
  businessName: "",
  vertical: "",
  timezone: "America/Montevideo",
  phone: "",
  google: null,
  whatsapp: null,
  existingBusiness: false,
};

interface PlatformOnboardingData {
  business: {
    id: string;
    name: string;
    vertical: string | null;
    timezone: string;
    phone: string | null;
    googlePlaceId: string | null;
    googleReviewsLastSyncAt: string | null;
  };
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <OnboardingLayout currentStep={1}>
          <WizardCard badge="Onboarding" title="Cargando datos">
            <p className="mt-3 flex items-center gap-2 text-sm text-[#8891A4]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Estamos preparando el onboarding.
            </p>
          </WizardCard>
        </OnboardingLayout>
      }
    >
      <OnboardingPageContent />
    </Suspense>
  );
}

function OnboardingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const existingBusinessId = searchParams.get("businessId");
  const [currentStep, setCurrentStep] = useState(1);
  const [wizard, setWizard] = useState<WizardState>(initialWizard);
  const [loadingExisting, setLoadingExisting] = useState(Boolean(existingBusinessId));
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!existingBusinessId) return;

    async function loadExistingBusiness() {
      setLoadingExisting(true);
      setLoadError(null);
      try {
        const response = await fetch(
          `/api/proxy/platform/businesses/${existingBusinessId}/onboarding`,
        );
        const data = (await response.json().catch(() => ({}))) as
          | PlatformOnboardingData
          | { message?: string };
        if (!response.ok || !("business" in data)) {
          throw new Error(
            "message" in data
              ? data.message
              : "No pudimos cargar el onboarding.",
          );
        }
        setWizard({
          businessId: data.business.id,
          businessName: data.business.name,
          vertical: data.business.vertical ?? "",
          timezone: data.business.timezone || "America/Montevideo",
          phone: data.business.phone ?? "",
          google: data.business.googlePlaceId
            ? {
                placeId: data.business.googlePlaceId,
                name: data.business.name,
                rating: null,
                reviewCount: 0,
              }
            : null,
          whatsapp: data.business.phone
            ? { phone: data.business.phone, connected: true }
            : null,
          existingBusiness: true,
        });
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "No pudimos cargar el onboarding.",
        );
      } finally {
        setLoadingExisting(false);
      }
    }

    void loadExistingBusiness();
  }, [existingBusinessId]);

  if (loadingExisting) {
    return (
      <OnboardingLayout currentStep={1}>
        <WizardCard badge="Onboarding" title="Cargando datos">
          <p className="mt-3 flex items-center gap-2 text-sm text-[#8891A4]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Estamos preparando el onboarding del negocio.
          </p>
        </WizardCard>
      </OnboardingLayout>
    );
  }

  if (loadError) {
    return (
      <OnboardingLayout currentStep={1}>
        <WizardCard badge="Onboarding" title="No pudimos cargar el negocio">
          <FormError message={loadError} />
        </WizardCard>
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout currentStep={currentStep}>
      {currentStep === 1 ? (
        <BusinessStep
          existingBusinessId={wizard.existingBusiness ? wizard.businessId : null}
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
              existingBusiness: current.existingBusiness,
            }));
            setCurrentStep(2);
          }}
        />
      ) : null}

      {currentStep === 2 && wizard.businessId ? (
        <GoogleStep
          businessId={wizard.businessId}
          platformMode={wizard.existingBusiness}
          businessName={wizard.businessName}
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
          platformMode={wizard.existingBusiness}
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
          onGoToDashboard={async () => {
            if (wizard.existingBusiness && wizard.businessId) {
              await fetch(
                `/api/proxy/platform/businesses/${wizard.businessId}/onboarding/complete`,
                { method: "POST" },
              ).catch(() => undefined);
            }
            router.push("/dashboard");
          }}
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
  existingBusinessId,
  initial,
  onCreated,
}: {
  existingBusinessId: string | null;
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
      const response = await fetch(
        existingBusinessId
          ? `/api/proxy/platform/businesses/${existingBusinessId}/onboarding/business`
          : "/api/proxy/businesses",
        {
          method: existingBusinessId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            existingBusinessId
              ? {
                  name: name.trim(),
                  vertical,
                  timezone,
                  whatsappPhone: phone,
                }
              : {
                  name: name.trim(),
                  vertical,
                  timezone,
                  phone,
                },
          ),
        },
      );
      const data = (await response.json().catch(() => ({}))) as
        | (CreatedBusiness & { id: string; name: string })
        | { message?: string };

      if (!response.ok || !("id" in data)) {
        throw new Error(
          "message" in data
            ? data.message
            : "No pudimos guardar el negocio. ProbÃ¡ de nuevo.",
        );
      }

      onCreated({ id: data.id, name: data.name }, { vertical, timezone, phone });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No pudimos guardar el negocio. ProbÃ¡ de nuevo.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <WizardCard badge="Paso 1 de 4" title="Contanos sobre tu negocio">
      <p className="mt-3 text-sm text-[#8891A4]">
        Lo bÃ¡sico para empezar a generar reseÃ±as.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Field label="Nombre del negocio">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            className={inputClassName}
            placeholder="ClÃ­nica Sonrisa Pocitos"
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
                SeleccionÃ¡ un rubro
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
          label="TelÃ©fono de contacto"
          value={phone}
          onChange={setPhone}
        />
        <p className="-mt-2 text-xs text-[#8891A4]">
          Usamos este nÃºmero solo para soporte. No se muestra a tus pacientes.
        </p>

        <FormError message={error} />

        <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[#8891A4]">Se guarda automÃ¡ticamente</p>
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
  platformMode,
  businessName,
  initial,
  onBack,
  onVerified,
  onContinue,
}: {
  businessId: string;
  platformMode: boolean;
  businessName: string;
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
        platformMode
          ? `/api/proxy/platform/businesses/${businessId}/onboarding/google`
          : `/api/proxy/businesses/${businessId}/verify-google-place?placeId=${encodeURIComponent(
              placeId.trim(),
            )}`,
        platformMode
          ? {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ googlePlaceId: placeId.trim() }),
            }
          : undefined,
      );
      const data = (await response.json().catch(() => ({}))) as
        | Omit<GoogleVerification, "placeId">
        | { message?: string };
      if (!response.ok) {
        throw new Error("No encontramos ese negocio");
      }
      const next = {
        name: "name" in data ? data.name : businessName,
        rating: "rating" in data ? data.rating : null,
        reviewCount: "reviewCount" in data ? data.reviewCount : 0,
        placeId: placeId.trim(),
      };
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
    <WizardCard badge="Paso 2 de 4" title="ConectÃ¡ tu ficha de Google">
      <p className="mt-3 text-sm text-[#8891A4]">
        PegÃ¡ tu Google Place ID. Vamos a importar tus reseÃ±as existentes y
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
          Â¿CÃ³mo encuentro mi Place ID? Buscar â†’
        </a>
      </div>

      {verification ? (
        <>
          <SuccessPanel
            className="mt-6"
            title={verification.name}
            meta={`â˜… ${formatRating(verification.rating)} Â· ${verification.reviewCount} reseÃ±as en Google`}
            status="Verificado"
          />
          <div className="mt-3 inline-flex w-full items-center gap-2 rounded-lg bg-[#5C6BC0]/10 px-4 py-3 text-sm font-medium text-[#5C6BC0]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>
              Importando tus reseÃ±as en segundo plano... podÃ©s continuar.
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
  platformMode,
  initialPhone,
  verified,
  onBack,
  onVerified,
  onContinue,
}: {
  businessId: string;
  platformMode: boolean;
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
        platformMode
          ? `/api/proxy/platform/businesses/${businessId}/onboarding/test-message`
          : `/api/proxy/businesses/${businessId}/verify-whatsapp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            platformMode ? { phone, name: "Prueba Flikker" } : { phone },
          ),
        },
      );
      const data = (await response.json().catch(() => ({}))) as
        | { connected?: boolean }
        | { message?: string };
      if (!response.ok || (!platformMode && (!("connected" in data) || !data.connected))) {
        throw new Error(
          "message" in data
            ? data.message
            : "No pudimos verificar la conexiÃ³n.",
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
          : "No pudimos verificar la conexiÃ³n.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <WizardCard badge="Paso 3 de 4" title="ConectÃ¡ tu WhatsApp">
      <p className="mt-3 text-sm text-[#8891A4]">
        El nÃºmero desde el que vas a enviar pedidos de reseÃ±a a tus pacientes.
      </p>

      <div className="mt-6">
        <PhoneInput
          label="NÃºmero de WhatsApp"
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
          VerificÃ¡ la conexiÃ³n para recibir un mensaje de prueba de Flikker.
        </div>
      ) : null}

      {state === "ok" ? (
        <SuccessPanel
          className="mt-4"
          title="ConexiÃ³n verificada"
          meta={`Mensaje de prueba entregado a +598 ${phone}`}
          status="activo"
        />
      ) : null}

      {state === "error" ? (
        <div className="mt-4 rounded-lg border border-[#C0392B]/20 bg-[#C0392B]/10 px-4 py-3 text-sm text-[#C0392B]">
          {error ?? "No pudimos verificar la conexiÃ³n."}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void verify()}
        disabled={!phone.trim() || loading}
        className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#E8EAF0] bg-white px-4 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA] disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {state === "ok" ? "Verificar conexiÃ³n nuevamente" : "Verificar conexiÃ³n"}
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
  onGoToDashboard: () => void | Promise<void>;
}) {
  const verticalLabel =
    VERTICAL_OPTIONS.find((option) => option.value === wizard.vertical)?.label ??
    wizard.vertical;
  const timezoneLabel =
    TIMEZONE_OPTIONS.find((option) => option.value === wizard.timezone)?.label ??
    wizard.timezone;

  return (
    <WizardCard badge="Paso 4 de 4" title="Casi listo, revisÃ¡ los datos">
      <p className="mt-3 text-sm text-[#8891A4]">
        Si algo no es correcto podÃ©s editarlo. DespuÃ©s podÃ©s cambiar todo desde
        tu panel.
      </p>

      <div className="mt-6 space-y-3">
        <SummaryCard
          icon={<Building2 className="h-5 w-5" />}
          title="Negocio"
          text={`${wizard.businessName} Â· ${verticalLabel} Â· ${timezoneLabel}`}
          onEdit={() => onEdit(1)}
        />
        <SummaryCard
          icon={<Star className="h-5 w-5" />}
          title="Google"
          text={
            wizard.google
              ? `${wizard.google.name} Â· ${formatRating(
                  wizard.google.rating,
                )} Â· ${wizard.google.reviewCount} reseÃ±as Â· Verificado`
              : "Sin verificar"
          }
          onEdit={() => onEdit(2)}
        />
        <SummaryCard
          icon={<MessageCircle className="h-5 w-5" />}
          title="WhatsApp"
          text={
            wizard.whatsapp?.connected
              ? `+598 ${wizard.whatsapp.phone} Â· ConexiÃ³n activa`
              : "Sin verificar"
          }
          onEdit={() => onEdit(3)}
        />
      </div>

      <button
        type="button"
        onClick={() => void onGoToDashboard()}
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
