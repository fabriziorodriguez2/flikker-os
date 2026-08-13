"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Gift, Loader2, QrCode, Sparkles } from "lucide-react";
import QRCode from "qrcode";
import LoyaltyCard from "@/components/public/loyalty-card";
import {
  STAMP_ICONS,
  buildLoyaltyCardTheme,
  contrastRatio,
} from "@/lib/loyalty-card-theme";
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

const REWARD_TYPES = [
  { value: "gift", label: "Regalo" },
  { value: "discount", label: "Descuento porcentual" },
  { value: "promotion", label: "2x1" },
  { value: "upgrade", label: "Upgrade" },
  { value: "other", label: "Personalizado" },
];

const CARD_PRESETS = ["#1A1040", "#5C6BC0", "#0F766E", "#B4530A", "#8A1C3B", "#F5F6FB"];

const FLIKKER_WHATSAPP = "https://wa.me/59891624988";
const TOTAL_STEPS = 7;

interface OnboardingState {
  businessId: string | null;
  businessName?: string;
  checkinToken?: string | null;
  steps: Record<string, boolean>;
  program?: {
    rewardName: string | null;
    stampsRequired: number | null;
    feedbackBonusEnabled: boolean;
    welcomeBenefitId: string | null;
    /** true incluso cuando el dueño dijo que NO quiere regalo. */
    welcomeGiftDecided: boolean;
  };
  automations?: {
    remindNearReward: boolean;
    reactivateInactive: boolean;
  };
  benefitCount?: number;
}

interface BenefitRow {
  id: string;
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
 * Devuelve un aviso si el link pegado seguro no sirve, o `null` si puede ser
 * bueno. Deliberadamente laxo: Google reparte fichas como `g.page/x`,
 * `maps.app.goo.gl/x`, `google.com/maps/place/...` y `google.com.uy/...`, y
 * todas son legítimas. Ser estricto acá bloquearía el link que el dueño
 * realmente tiene a mano.
 */
function googleUrlHint(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return "Eso no parece un link. Copialo desde Google Maps con el botón Compartir.";
  }

  if (url.protocol !== "https:") return "El link tiene que empezar con https://";

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const isGoogle =
    /(^|\.)google\.[a-z.]{2,8}$/.test(host) ||
    /(^|\.)(goo\.gl|g\.page|google\.page\.link)$/.test(host);

  return isGoogle
    ? null
    : "Ese link no es de Google. Buscá tu negocio en Google Maps, tocá Compartir y pegá ese link.";
}

export default function WizardClient() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [state, setState] = useState<OnboardingState | null>(null);
  const [benefits, setBenefits] = useState<BenefitRow[]>([]);
  const [booting, setBooting] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Paso 1
  const [name, setName] = useState("");
  const [category, setCategory] = useState("cafeteria");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [whatsapp, setWhatsapp] = useState("");
  // Paso 2
  const [rewardType, setRewardType] = useState("gift");
  const [rewardTitle, setRewardTitle] = useState("");
  const [stamps, setStamps] = useState(5);
  const [feedbackBonus, setFeedbackBonus] = useState(false);
  // Paso 3
  const [wantsWelcome, setWantsWelcome] = useState<boolean | null>(null);
  const [welcomeTitle, setWelcomeTitle] = useState("");
  const [welcomeBenefitId, setWelcomeBenefitId] = useState("");
  // Paso 4
  const [cardColor, setCardColor] = useState("#1A1040");
  const [stampColor, setStampColor] = useState("");
  const [stampIcon, setStampIcon] = useState("gift");
  // Paso 5
  const [googleUrl, setGoogleUrl] = useState("");
  // Paso 6
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  // Paso 7
  const [remindNear, setRemindNear] = useState(true);
  const [reactivate, setReactivate] = useState(false);
  const [allowedBenefits, setAllowedBenefits] = useState<string[]>([]);

  /** Reanudación: el estado vive en el backend, no en el browser. */
  const boot = useCallback(async () => {
    try {
      const [stateRes, benefitsRes] = await Promise.all([
        fetch("/api/proxy/onboarding/state"),
        fetch("/api/proxy/benefits").catch(() => null),
      ]);
      const data = (await stateRes.json()) as OnboardingState;
      setState(data);
      if (data.businessName) setName(data.businessName);
      if (data.program?.stampsRequired) setStamps(data.program.stampsRequired);
      if (data.program?.rewardName) setRewardTitle(data.program.rewardName);
      if (data.program?.feedbackBonusEnabled) setFeedbackBonus(true);
      // La bienvenida se restaura desde la DECISIÓN, no desde el beneficio:
      // `welcomeGiftDecided` con `welcomeBenefitId` nulo significa "dijo que
      // no", y hay que dejar esa opción marcada. Mirar solo el beneficio haría
      // que el paso volviera a arrancar en blanco y se preguntara de nuevo.
      if (data.program?.welcomeGiftDecided) {
        setWantsWelcome(Boolean(data.program.welcomeBenefitId));
        if (data.program.welcomeBenefitId) {
          setWelcomeBenefitId(data.program.welcomeBenefitId);
        }
      }
      if (data.automations) {
        setRemindNear(data.automations.remindNearReward);
        setReactivate(data.automations.reactivateInactive);
      }
      if (benefitsRes?.ok) {
        setBenefits((await benefitsRes.json()) as BenefitRow[]);
      }
      // Volver al primer paso incompleto.
      const s = data.steps ?? {};
      if (!data.businessId) setStep(1);
      else if (!s.program) setStep(2);
      else if (!s.welcomeGift) setStep(3);
      else if (!s.design) setStep(4);
      else if (!s.google) setStep(5);
      // El paso 6 (QR) no persiste nada: se muestra siempre camino al 7.
      else if (!s.notifications) setStep(6);
      // Automatizaciones ya decididas (aunque haya sido "las dos apagadas"):
      // solo queda cerrar. Volver al 6 sería preguntar de nuevo algo ya
      // respondido.
      else setStep(8);
    } catch {
      setError("No pudimos cargar tu progreso.");
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  // QR del paso 6 — el mismo token que abre /check-in/{token}.
  useEffect(() => {
    if (step !== 6 || !state?.checkinToken) return;
    const url = `${window.location.origin}/check-in/${state.checkinToken}`;
    void QRCode.toDataURL(url, { width: 460, margin: 2 }).then(setQrDataUrl);
  }, [step, state?.checkinToken]);

  async function save(path: string, body: unknown, nextStep: number) {
    setSaving(true);
    setError(null);
    try {
      const updated = (await post(path, body)) as OnboardingState;
      setState(updated);
      const refreshed = await fetch("/api/proxy/benefits");
      if (refreshed.ok) setBenefits((await refreshed.json()) as BenefitRow[]);
      setStep(nextStep);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }

  function pickLogo(file: File) {
    const reader = new FileReader();
    reader.onload = () => setLogoUrl(String(reader.result));
    reader.readAsDataURL(file);
  }

  if (booting) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#F7F8FC]">
        <Loader2 className="h-6 w-6 animate-spin text-[#5C6BC0]" />
      </main>
    );
  }

  const theme = buildLoyaltyCardTheme(cardColor, stampColor || null);
  // Mismo criterio que la pestaña Diseño del panel: si el acento elegido no
  // llega a 3:1 contra la tarjeta, `buildLoyaltyCardTheme` lo descarta. Se
  // avisa acá en vez de guardar en silencio un color distinto del pedido.
  // Aviso en vivo del link de Google, con el mismo criterio permisivo que la
  // API (`google-url.ts`): la validación real la hace el backend, esto solo
  // evita que el dueño mande algo que ya sabemos que va a rebotar.
  const googleHint = googleUrlHint(googleUrl);

  const accentIgnored =
    Boolean(stampColor) &&
    /^#[0-9A-Fa-f]{6}$/.test(stampColor) &&
    contrastRatio(stampColor, theme.card) < 3;

  const previewCard = (
    <LoyaltyCard
      rewardName={rewardTitle || "Tu recompensa"}
      progress={Math.min(2, stamps)}
      target={stamps}
      appearance={{
        cardColor,
        stampColor: stampColor || null,
        stampIcon,
        logoUrl,
        businessName: name || "Tu negocio",
      }}
    />
  );

  // ── Paso 1 ────────────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <WizardShell
        step={1}
        totalSteps={TOTAL_STEPS}
        title="Tu negocio"
        subtitle="Empecemos con lo básico. Podés cambiarlo cuando quieras."
        onNext={() =>
          void save(
            "business",
            { name, category, logoUrl: logoUrl ?? undefined, whatsapp: whatsapp || undefined },
            2,
          )
        }
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
                    if (file) pickLogo(file);
                  }}
                />
              </label>
            </div>
          </div>

          <label className="block">
            <span className={labelClass}>WhatsApp (opcional)</span>
            <input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="+598 99 123 456"
              className={fieldClass}
            />
          </label>
        </div>
      </WizardShell>
    );
  }

  // ── Paso 2 ────────────────────────────────────────────────────────────
  if (step === 2) {
    return (
      <WizardShell
        step={2}
        totalSteps={TOTAL_STEPS}
        title="Dales una razón para volver"
        subtitle="Tus clientes juntan sellos cada vez que visitan tu negocio."
        onBack={() => setStep(1)}
        onNext={() =>
          void save(
            "program",
            {
              rewardTitle,
              rewardType,
              stampsRequired: stamps,
              feedbackBonusEnabled: feedbackBonus,
            },
            3,
          )
        }
        nextDisabled={rewardTitle.trim().length < 2}
        saving={saving}
        error={error}
      >
        <div className="space-y-5">
          <div>
            <span className={labelClass}>Tipo de recompensa</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {REWARD_TYPES.map((t) => (
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
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: stamps }, (_, i) => (
                <span
                  key={i}
                  className="h-9 w-9 rounded-full border-2"
                  style={{
                    borderColor: i < 2 ? theme.accent : "#E3E5F0",
                    backgroundColor: i < 2 ? theme.accent : "transparent",
                  }}
                />
              ))}
            </div>
            <p className="mt-3 text-sm font-bold text-[#171A2B]">
              {stamps} sellos → {rewardTitle || "tu recompensa"}
            </p>
          </div>

          <div className="space-y-2.5 border-t border-[#EFF1F7] pt-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-[#147A5B]">
              <Check className="h-4 w-4" /> Cada visita suma 1 sello
            </p>
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={feedbackBonus}
                onChange={(e) => setFeedbackBonus(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#5C6BC0]"
              />
              <span className="text-[#171A2B]">
                Dar 1 sello extra por completar el feedback
                <span className="mt-0.5 block text-xs text-[#8891A4]">
                  Se otorga por dar la opinión, sin importar el puntaje.
                </span>
              </span>
            </label>
          </div>
        </div>
      </WizardShell>
    );
  }

  // ── Paso 3 ────────────────────────────────────────────────────────────
  if (step === 3) {
    const canContinue =
      wantsWelcome === false ||
      (wantsWelcome === true &&
        (welcomeBenefitId || welcomeTitle.trim().length > 1));

    return (
      <WizardShell
        step={3}
        totalSteps={TOTAL_STEPS}
        title="¿Querés regalar algo en la primera visita?"
        subtitle="Se entrega una sola vez, cuando el cliente se registra por primera vez. Es distinto de la recompensa de la tarjeta."
        onBack={() => setStep(2)}
        onNext={() =>
          void save(
            "welcome-gift",
            // "No, gracias" también se guarda. Es una decisión del dueño, no
            // un campo vacío: así al reanudar no se vuelve a preguntar.
            wantsWelcome
              ? {
                  wantsGift: true,
                  ...(welcomeBenefitId
                    ? { benefitId: welcomeBenefitId }
                    : { title: welcomeTitle }),
                }
              : { wantsGift: false },
            4,
          )
        }
        nextDisabled={!canContinue}
        saving={saving}
        error={error}
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setWantsWelcome(false)}
              className={`rounded-[16px] border-2 p-5 text-left transition-colors ${
                wantsWelcome === false
                  ? "border-[#5C6BC0] bg-[#EEF0FB]"
                  : "border-[#E3E5F0] bg-white hover:border-[#5C6BC0]"
              }`}
            >
              <p className="font-bold text-[#171A2B]">No, gracias</p>
              <p className="mt-1 text-sm text-[#7B8295]">
                Empiezan juntando sellos directamente.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setWantsWelcome(true)}
              className={`rounded-[16px] border-2 p-5 text-left transition-colors ${
                wantsWelcome === true
                  ? "border-[#5C6BC0] bg-[#EEF0FB]"
                  : "border-[#E3E5F0] bg-white hover:border-[#5C6BC0]"
              }`}
            >
              <p className="flex items-center gap-2 font-bold text-[#171A2B]">
                <Gift className="h-4 w-4 text-[#5C6BC0]" /> Sí, elegir beneficio
              </p>
              <p className="mt-1 text-sm text-[#7B8295]">
                Un regalo de bienvenida en su primer check-in.
              </p>
            </button>
          </div>

          {wantsWelcome ? (
            <div className="rounded-[16px] border border-[#E3E5F0] bg-white p-5">
              {benefits.length > 0 ? (
                <label className="block">
                  <span className={labelClass}>Usar uno que ya tenés</span>
                  <select
                    value={welcomeBenefitId}
                    onChange={(e) => {
                      setWelcomeBenefitId(e.target.value);
                      if (e.target.value) setWelcomeTitle("");
                    }}
                    className={fieldClass}
                  >
                    <option value="">Crear uno nuevo…</option>
                    {benefits.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {!welcomeBenefitId ? (
                <label className="mt-4 block">
                  <span className={labelClass}>Nuevo regalo de bienvenida</span>
                  <input
                    value={welcomeTitle}
                    onChange={(e) => setWelcomeTitle(e.target.value)}
                    placeholder="Café de bienvenida"
                    className={fieldClass}
                  />
                </label>
              ) : null}
            </div>
          ) : null}
        </div>
      </WizardShell>
    );
  }

  // ── Paso 4 — Diseño ───────────────────────────────────────────────────
  if (step === 4) {
    return (
      <WizardShell
        step={4}
        totalSteps={TOTAL_STEPS}
        title="Diseñá tu tarjeta"
        subtitle="Así la va a ver tu cliente. Los sellos se ajustan solos para que siempre se lean."
        aside={previewCard}
        onBack={() => setStep(3)}
        onNext={() =>
          void save(
            "design",
            {
              loyaltyCardColor: cardColor,
              ...(stampColor ? { loyaltyStampColor: stampColor } : {}),
              loyaltyStampIcon: stampIcon,
              ...(logoUrl ? { logoUrl } : {}),
            },
            5,
          )
        }
        saving={saving}
        error={error}
      >
        <div className="space-y-5">
          <div>
            <span className={labelClass}>Color de la tarjeta</span>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {CARD_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setCardColor(preset)}
                  aria-label={`Color ${preset}`}
                  className={`h-10 w-10 rounded-full border-2 transition-transform hover:scale-105 ${
                    cardColor.toUpperCase() === preset
                      ? "border-[#171A2B]"
                      : "border-[#E3E5F0]"
                  }`}
                  style={{ backgroundColor: preset }}
                />
              ))}
              <input
                type="color"
                value={cardColor}
                onChange={(e) => setCardColor(e.target.value.toUpperCase())}
                aria-label="Color personalizado"
                className="h-10 w-14 cursor-pointer rounded-[10px] border border-[#E3E5F0] bg-white"
              />
            </div>
          </div>

          <div>
            <span className={labelClass}>Acento de los sellos</span>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <input
                type="color"
                value={stampColor || theme.accent}
                onChange={(e) => setStampColor(e.target.value.toUpperCase())}
                aria-label="Acento de los sellos"
                className="h-10 w-14 cursor-pointer rounded-[10px] border border-[#E3E5F0] bg-white"
              />
              {stampColor ? (
                <button
                  type="button"
                  onClick={() => setStampColor("")}
                  className="text-xs font-semibold text-[#5C6BC0] hover:underline"
                >
                  Usar automático
                </button>
              ) : (
                <span className="text-xs text-[#8891A4]">
                  Automático según el color de la tarjeta
                </span>
              )}
            </div>
            {accentIgnored ? (
              <p className="mt-2 rounded-[10px] bg-[#FFF7EE] px-3 py-2 text-xs leading-5 text-[#8A520D]">
                Ese acento no contrasta lo suficiente con tu tarjeta, así que
                usamos uno legible. Probá un color más claro u oscuro.
              </p>
            ) : null}
          </div>

          <div>
            <span className={labelClass}>Sello</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {STAMP_ICONS.map((icon) => (
                <button
                  key={icon.key}
                  type="button"
                  onClick={() => setStampIcon(icon.key)}
                  className={`rounded-[10px] border px-4 py-2 text-sm font-semibold transition-colors ${
                    stampIcon === icon.key
                      ? "border-[#5C6BC0] bg-[#EEF0FB] text-[#5C6BC0]"
                      : "border-[#E3E5F0] bg-white text-[#7B8295] hover:border-[#5C6BC0]"
                  }`}
                >
                  {icon.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </WizardShell>
    );
  }

  // ── Paso 5 — Google ───────────────────────────────────────────────────
  if (step === 5) {
    return (
      <WizardShell
        step={5}
        totalSteps={TOTAL_STEPS}
        title="Conectá tus reseñas de Google"
        subtitle="Flikker puede mostrar tus reseñas y ofrecerle a tus clientes compartir su experiencia en Google."
        onBack={() => setStep(4)}
        onNext={() =>
          void save("google", { googleBusinessProfileUrl: googleUrl }, 6)
        }
        nextDisabled={!googleUrl.trim() || Boolean(googleHint)}
        nextLabel="Conectar"
        secondary={{ label: "Configurar más tarde", onClick: () => setStep(6) }}
        saving={saving}
        error={error}
      >
        <div className="space-y-4">
          <label className="block">
            <span className={labelClass}>Link de tu ficha en Google</span>
            <input
              value={googleUrl}
              onChange={(e) => setGoogleUrl(e.target.value)}
              placeholder="https://g.page/tu-negocio"
              className={fieldClass}
            />
          </label>
          {googleHint ? (
            <p className="rounded-[12px] bg-[#FFF7EE] px-4 py-3 text-sm leading-6 text-[#8A520D]">
              {googleHint}
            </p>
          ) : null}
          <p className="rounded-[12px] bg-[#F5F6FB] px-4 py-3 text-sm leading-6 text-[#7B8295]">
            Buscá tu negocio en Google Maps, tocá <strong>Compartir</strong> y
            pegá el link acá. Si preferís, podés hacerlo después: tu programa de
            sellos y el feedback funcionan igual sin esto.
          </p>
        </div>
      </WizardShell>
    );
  }

  // ── Paso 6 — QR y NFC ─────────────────────────────────────────────────
  if (step === 6) {
    return (
      <WizardShell
        step={6}
        totalSteps={TOTAL_STEPS}
        title="Tu QR está listo"
        subtitle="Ponelo en el mostrador. Cada vez que alguien lo escanea, suma un sello."
        onBack={() => setStep(5)}
        onNext={() => setStep(7)}
        saving={saving}
        error={error}
      >
        <div className="space-y-5">
          <div className="flex flex-col items-center rounded-[20px] border border-[#E3E5F0] bg-white p-6">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="QR de tu negocio" className="h-56 w-56" />
            ) : (
              <div className="flex h-56 w-56 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[#5C6BC0]" />
              </div>
            )}
            <a
              href={qrDataUrl ?? "#"}
              download={`qr-${state?.businessName ?? "flikker"}.png`}
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-[12px] bg-[#171A2B] px-5 text-sm font-bold text-white hover:bg-[#2A2F45]"
            >
              <QrCode className="h-4 w-4" /> Descargar QR
            </a>
          </div>

          <div className="rounded-[20px] border border-[#5C6BC0]/25 bg-[#EEF0FB] p-5">
            <p className="text-sm font-bold text-[#171A2B]">
              ¿Querés algo listo para poner en el mostrador?
            </p>
            <p className="mt-2 flex items-start gap-2 text-sm leading-6 text-[#4A5268]">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#5C6BC0]" />
              <span>
                <strong>Soporte QR + NFC.</strong> Tus clientes pueden escanear
                el QR o acercar el celular. Ambos abren exactamente el mismo
                programa.
              </span>
            </p>
            <a
              href={FLIKKER_WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex h-11 items-center rounded-[12px] bg-[#5C6BC0] px-5 text-sm font-bold text-white hover:bg-[#4f5eb0]"
            >
              Pedir soporte QR + NFC
            </a>
          </div>
        </div>
      </WizardShell>
    );
  }

  // ── Paso 7 — Automatizaciones ─────────────────────────────────────────
  if (step === 7) {
    return (
      <WizardShell
        step={7}
        totalSteps={TOTAL_STEPS}
        title="Flikker también puede ayudarte a traerlos de vuelta"
        subtitle="Mensajes automáticos por WhatsApp, en el momento justo."
        onBack={() => setStep(6)}
        onNext={() =>
          void save(
            "notifications",
            {
              remindNearReward: remindNear,
              reactivateInactive: reactivate,
              reactivationBenefitIds: reactivate ? allowedBenefits : [],
            },
            8,
          )
        }
        nextLabel="Terminar"
        saving={saving}
        error={error}
      >
        {/*
          Dos opciones, no tres. Había un tercer checkbox — "recordar una
          recompensa disponible" — que se sacó porque no tiene con qué
          ejecutarse: el único objetivo de progreso de Retention V2
          (REWARD_GOAL_PROGRESS) recluta goals ACTIVE y excluye los UNLOCKED
          por diseño, así que el cliente con la recompensa ya desbloqueada no
          entra en ninguna campaña. Un checkbox que no hace nada es peor que
          uno que falta.
        */}
        <div className="space-y-3">
          {[
            {
              checked: remindNear,
              set: setRemindNear,
              label: "Recordar cuando esté cerca del premio",
              hint: "Cuando le faltan pocos sellos para llegar.",
            },
            {
              checked: reactivate,
              set: setReactivate,
              label: "Reactivar clientes que dejaron de venir",
              hint: "Flikker elige el momento según el historial de visitas.",
            },
          ].map((item) => (
            <label
              key={item.label}
              className="flex cursor-pointer items-start gap-3 rounded-[14px] border border-[#E3E5F0] bg-white p-4 transition-colors hover:border-[#5C6BC0]"
            >
              <input
                type="checkbox"
                checked={item.checked}
                onChange={(e) => item.set(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#5C6BC0]"
              />
              <span className="text-[15px] font-semibold text-[#171A2B]">
                {item.label}
                <span className="mt-0.5 block text-xs font-normal text-[#8891A4]">
                  {item.hint}
                </span>
              </span>
            </label>
          ))}

          {reactivate ? (
            <div className="rounded-[16px] border border-[#E3E5F0] bg-white p-5">
              <p className="text-sm font-bold text-[#171A2B]">
                ¿Qué puede ofrecer Flikker para intentar recuperarlos?
              </p>
              <div className="mt-3 space-y-2">
                {benefits.map((b) => (
                  <label key={b.id} className="flex items-center gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={allowedBenefits.includes(b.id)}
                      onChange={(e) =>
                        setAllowedBenefits((prev) =>
                          e.target.checked
                            ? [...prev, b.id]
                            : prev.filter((id) => id !== b.id),
                        )
                      }
                      className="h-4 w-4 accent-[#5C6BC0]"
                    />
                    <span className="text-[#171A2B]">{b.title}</span>
                  </label>
                ))}
                <label className="flex items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={allowedBenefits.length === 0}
                    onChange={() => setAllowedBenefits([])}
                    className="h-4 w-4 accent-[#5C6BC0]"
                  />
                  <span className="text-[#171A2B]">
                    Solo enviar recordatorios, sin beneficio
                  </span>
                </label>
              </div>
              <p className="mt-4 text-xs leading-5 text-[#8891A4]">
                Flikker decide cuándo contactar según el historial de visitas.
                Nunca usa un beneficio que no hayas autorizado.
              </p>
            </div>
          ) : null}
        </div>
      </WizardShell>
    );
  }

  // ── Final ─────────────────────────────────────────────────────────────
  const activeAutomations = [remindNear, reactivate].filter(Boolean).length;

  return (
    <WizardShell
      step={7}
      totalSteps={TOTAL_STEPS}
      title="Tu programa está listo"
      subtitle="Ya podés poner el QR en el mostrador y empezar a sumar clientes."
      aside={previewCard}
      onNext={async () => {
        setSaving(true);
        setError(null);
        try {
          // Cerrar el onboarding va ANTES de navegar. Si falla nos quedamos
          // acá: mandar al dashboard con el negocio todavía en borrador haría
          // que el guard del panel rebotara de vuelta al wizard.
          // `POST /onboarding/complete` es idempotente, así que reintentar
          // después de un éxito cuya respuesta se perdió también funciona.
          await post("complete");
          router.push("/dashboard");
          router.refresh();
        } catch (e) {
          setError(
            e instanceof Error
              ? `${e.message} Tu configuración está guardada — probá de nuevo.`
              : "No pudimos terminar. Tu configuración está guardada — probá de nuevo.",
          );
          setSaving(false);
        }
      }}
      nextLabel={error ? "Reintentar" : "Ir a Flikker"}
      saving={saving}
      error={error}
    >
      <dl className="divide-y divide-[#EFF1F7] rounded-[16px] border border-[#E3E5F0] bg-white px-5">
        {[
          ["Programa", `${stamps} sellos → ${rewardTitle || "tu recompensa"}`],
          ["Cada visita", "+1 sello"],
          ["Feedback", feedbackBonus ? "+1 sello extra" : "Desactivado"],
          [
            "Bienvenida",
            wantsWelcome ? welcomeTitle || "Beneficio elegido" : "Sin regalo",
          ],
          ["Google", googleUrl ? "Conectado" : "Pendiente"],
          ["Automatizaciones", `${activeAutomations} activas`],
          ["QR", "Listo"],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 py-3.5">
            <dt className="text-sm text-[#7B8295]">{label}</dt>
            <dd className="text-right text-sm font-bold text-[#171A2B]">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </WizardShell>
  );
}
