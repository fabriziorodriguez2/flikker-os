"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  BadgePercent,
  Check,
  CheckCircle2,
  Footprints,
  Gift,
  Loader2,
  PartyPopper,
  Sparkles,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import { normalizeUruguayNationalPhone } from "@/components/ui/phone-input";
import OtpInput from "@/components/ui/otp-input";
import { useImagePalette } from "@/lib/use-logo-palette";
import CustomerShell from "@/components/public/customer-shell";
import LoyaltyCard from "@/components/public/loyalty-card";
import CheckinFeedbackCard from "@/components/public/checkin-feedback-card";
import BenefitCard from "@/components/public/benefit-card";
import SlideToReveal from "@/components/public/slide-to-reveal";
import ChallengeRow from "@/components/public/challenge-row";
import type { CheckinLanding, PublicBenefit } from "./page";

// ── Types shared with the API responses ──────────────────────────────────────

export interface PersonalBenefit extends PublicBenefit {
  redemption: { code: string; redeemed: boolean } | null;
}

interface RewardGoalView {
  goal: {
    incentiveName: string;
    progressVisits: number;
    visitProgress?: number;
    bonusStamps?: number;
    targetAdditionalVisits: number;
    remainingVisits: number;
  } | null;
  unlockedNow: boolean;
  benefit: { name: string; code: string; expiresAt: string | null } | null;
}

interface PersonalSpace {
  customer: { name: string };
  visits: { total: number; lastAt: string | null };
  benefit: PersonalBenefit | null;
  // Optional defensively: every real response includes it, but the card must
  // never crash the whole personal space if it's ever missing.
  rewardGoal?: RewardGoalView | null;
  reviewPrompt: { show: boolean; googleUrl: string | null };
  /**
   * Otros beneficios otorgados a este cliente y sin canjear — típicamente
   * por una promoción manual (Notificaciones → Promociones ya puede elegir
   * cualquier Benefit del catálogo, no solo el `active` de acá arriba).
   * Independiente de cuál sea `benefit`: un cliente puede tener este Y el
   * activo, o solo este. Optional defensivamente, mismo criterio que
   * `rewardGoal`.
   */
  otherBenefits?: PersonalBenefit[];
  /**
   * Misiones vivas de este negocio. Optional defensivamente, mismo criterio
   * que `rewardGoal`: un negocio sin misiones manda una lista vacía.
   */
  missions?: MissionView[];
  /**
   * True SOLO cuando la visita que se acaba de registrar completó un desafío
   * de vuelta. Optional defensivamente, mismo criterio que el resto.
   */
  returnChallengeCompleted?: boolean;
  /**
   * True SOLO cuando el sello del desafío realmente sumó progreso. Puede ser
   * `false` con `returnChallengeCompleted: true`: la visita normal, sola, ya
   * alcanzaba el target de la tarjeta, y el sello del desafío quedó como
   * excedente. El copy no debe prometer "+1 sello extra" en ese caso.
   */
  returnChallengeBonusApplied?: boolean;
}

interface MissionView {
  missionId: string;
  name: string;
  progress: {
    current: number;
    target: number;
    remaining: number;
    complete: boolean;
  };
  rewardName: string | null;
  rewardHidden: boolean;
  rewardCode: string | null;
}

type Mode = "presence" | "booting" | "register" | "recover" | "personal";
type CheckinStatus = "checked_in" | "duplicate" | null;

interface JsonResult {
  ok: boolean;
  status: number;
  data: Record<string, unknown> | null;
}

async function postJson(url: string, body?: unknown): Promise<JsonResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

/** El backend rechazó por falta/vencimiento del código del local. */
function isPresenceRejection(result: JsonResult): boolean {
  return (
    result.status === 400 &&
    (result.data?.code === "presence_required" ||
      (result.data?.message as { code?: string })?.code === "presence_required")
  );
}

function presenceMessageOf(result: JsonResult): string {
  const nested = result.data?.message as
    | { message?: string }
    | string
    | undefined;
  if (typeof nested === "string") return nested;
  return (
    nested?.message ??
    "Ese código ya no sirve. Pedí el que se muestra ahora en el local."
  );
}

function brandOf(landing: CheckinLanding): string {
  return landing.business.primaryColor ?? "#5C6BC0";
}

// ── Root ─────────────────────────────────────────────────────────────────────

export default function CheckinClient({
  token,
  landing,
  hasSession,
}: {
  token: string;
  landing: CheckinLanding;
  hasSession: boolean;
}) {
  // Código del local. Se pide UNA vez, antes que nada, y después viaja en
  // cada POST del recorrido — el cliente está parado en el mostrador, no
  // tiene por qué tipearlo tres veces. Nunca se persiste: si vuelve mañana
  // desde su casa, el estado arranca vacío y no hay nada que reusar.
  const presenceRequired = landing.presence?.required ?? false;
  const [presenceCode, setPresenceCode] = useState("");
  const [presenceError, setPresenceError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>(
    presenceRequired ? "presence" : hasSession ? "booting" : "register",
  );
  const [personal, setPersonal] = useState<PersonalSpace | null>(null);
  const [checkinStatus, setCheckinStatus] = useState<CheckinStatus>(null);
  const [prefillPhone, setPrefillPhone] = useState("");

  // On mount, if we already have a session cookie, attempt a recognized
  // check-in. A 401 means the session is dead → fall back to the form.
  useEffect(() => {
    if (!hasSession || mode !== "booting") return;
    let active = true;
    void (async () => {
      const result = await postJson(`/api/checkin/${token}/checkin`, {
        presenceCode: presenceCode || undefined,
      });
      if (!active) return;
      if (result.ok && result.data) {
        setPersonal(result.data.personal as PersonalSpace);
        setCheckinStatus((result.data.status as CheckinStatus) ?? "checked_in");
        setMode("personal");
      } else if (isPresenceRejection(result)) {
        // El backend es la autoridad: aunque la pantalla creyera que el
        // código estaba bien (venció mientras completaba, o ya se usó para
        // esta visita), vuelve a pedirlo en vez de dar la visita por hecha.
        setPresenceCode("");
        setPresenceError(presenceMessageOf(result));
        setMode("presence");
      } else {
        setMode("register");
      }
    })();
    return () => {
      active = false;
    };
  }, [hasSession, token, mode, presenceCode]);

  if (mode === "presence") {
    return (
      <PresenceScreen
        token={token}
        landing={landing}
        error={presenceError}
        onSubmit={(code) => {
          setPresenceCode(code);
          setPresenceError(null);
          setMode(hasSession ? "booting" : "register");
        }}
      />
    );
  }

  function goPersonal(data: PersonalSpace, status: CheckinStatus) {
    setPersonal(data);
    setCheckinStatus(status);
    setMode("personal");
  }

  if (mode === "booting") {
    return <CenteredSpinner />;
  }

  if (mode === "personal" && personal) {
    return (
      <PersonalScreen
        token={token}
        landing={landing}
        personal={personal}
        checkinStatus={checkinStatus}
        onSwitchAccount={() => {
          setPersonal(null);
          setCheckinStatus(null);
          setPrefillPhone("");
          setMode("register");
        }}
      />
    );
  }

  if (mode === "recover") {
    return (
      <RecoverScreen
        token={token}
        landing={landing}
        initialPhone={prefillPhone}
        presenceCode={presenceCode}
        onRecovered={(data) => goPersonal(data, "checked_in")}
        onBack={() => setMode("register")}
      />
    );
  }

  return (
    <RegisterScreen
      token={token}
      landing={landing}
      presenceCode={presenceCode}
      onRegistered={(data) => goPersonal(data, "checked_in")}
      onExists={(phone) => {
        setPrefillPhone(phone);
        setMode("recover");
      }}
      onRecoverInstead={(phone) => {
        setPrefillPhone(phone);
        setMode("recover");
      }}
    />
  );
}

// ── Presencia (código rotativo del local) ────────────────────────────────────

/**
 * Primer paso cuando el negocio exige prueba de presencia.
 *
 * Por qué existe: el QR es un cartel impreso, así que su URL es la misma
 * siempre y cualquiera que la guarde puede volver a abrirla desde su casa.
 * Este código, que solo se muestra dentro del local y rota cada pocos
 * minutos, es lo que hace que ese link guardado ya no alcance.
 *
 * Se pide una sola vez por recorrido — el cliente lo lee del mostrador y
 * sigue. No se guarda en el navegador a propósito: si guardara, mañana
 * volvería a servir y no habríamos resuelto nada.
 */
function PresenceScreen({
  token,
  landing,
  error,
  onSubmit,
}: {
  token: string;
  landing: CheckinLanding;
  error: string | null;
  onSubmit: (code: string) => void;
}) {
  const palette = useImagePalette(
    `${token}:${landing.business.logoUrl ?? ""}`,
    `/api/checkin/${encodeURIComponent(token)}/logo`,
    landing.business.logoUrl,
    landing.business.primaryColor,
  );
  const [code, setCode] = useState("");

  const clean = code.trim().toUpperCase();

  return (
    <Shell
      landing={landing}
      brandOverride={palette}
      backgroundColor={landing.business.checkinBackgroundColor}
    >
      <h1 className="text-center text-2xl font-bold leading-tight text-[color:var(--pub-text)]">
        Código del local
      </h1>
      <p className="mt-3 max-w-sm text-center text-sm text-[color:var(--pub-text-muted)]">
        Pedile al mostrador el código que aparece en la pantalla de{" "}
        {landing.business.businessName} y escribilo acá.
      </p>

      <form
        className="mt-6 w-full max-w-sm"
        onSubmit={(event) => {
          event.preventDefault();
          if (clean.length === 6) onSubmit(clean);
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={6}
          aria-label="Código del local"
          placeholder="ABC234"
          className="w-full rounded-2xl border border-[#d0d5dd] bg-white px-4 py-4 text-center text-2xl font-bold tracking-[0.4em] text-[#101828] placeholder:tracking-[0.4em] placeholder:text-[#c8cdd8] focus:border-[#5C6BC0] focus:outline-none focus:ring-1 focus:ring-[#5C6BC0]"
        />

        {error ? (
          <p className="mt-3 text-center text-sm font-semibold text-[#FFD4D4]">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={clean.length !== 6}
          style={{
            backgroundColor: "var(--pub-accent)",
            color: "var(--pub-on-accent)",
          }}
          className="mt-4 w-full rounded-2xl py-4 text-base font-semibold disabled:opacity-50"
        >
          Continuar
        </button>
      </form>
    </Shell>
  );
}

// ── Register (first visit) ───────────────────────────────────────────────────

const MONTHS_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function buildBirthdateIso(
  day: string,
  month: string,
  year: string,
): string | null {
  if (!day || !month || !year) return null;
  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) {
    return null;
  }
  const iso = `${y.toString().padStart(4, "0")}-${m
    .toString()
    .padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== y ||
    parsed.getUTCMonth() + 1 !== m ||
    parsed.getUTCDate() !== d
  ) {
    return null;
  }
  return iso;
}

/**
 * El formulario visual de inscripción — nombre, teléfono, fecha de
 * nacimiento opcional, botón — SIN el submit real. Exportado a propósito:
 * Programa → Página de inscripción lo reusa para su preview (pedido
 * explícito: "reutilizar los componentes visuales reales del flujo público,
 * pero en modo preview seguro, sin ejecutar registros ni POST reales").
 *
 * `onSubmit` es opcional exactamente por eso: si no se pasa, el `<form>`
 * nunca dispara ningún request (el navegador no tiene a dónde mandarlo) —
 * no hace falta ningún flag de "modo preview" esparcido en la lógica de
 * negocio, alcanza con no pasarle un handler real.
 */
export function RegisterFormFields({
  benefit,
  submitLabel,
  savingLabel,
  onSubmit,
  onRecoverInstead,
  preview = false,
}: {
  benefit: CheckinLanding["benefit"];
  submitLabel: string;
  savingLabel?: string;
  onSubmit?: (values: {
    name: string;
    phone: string;
    birthdate?: string;
  }) => Promise<{ error?: string } | void>;
  onRecoverInstead?: (phone: string) => void;
  preview?: boolean;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const yearRange: number[] = [];
  for (let y = currentYear - 10; y >= currentYear - 100; y--) yearRange.push(y);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!onSubmit) return;
    setError(null);
    setSaving(true);
    const birthdate =
      birthDay && birthMonth && birthYear
        ? (buildBirthdateIso(birthDay, birthMonth, birthYear) ?? undefined)
        : undefined;

    const result = await onSubmit({
      name: name.trim(),
      phone,
      ...(birthdate ? { birthdate } : {}),
    });
    setSaving(false);
    if (result?.error) setError(result.error);
  }

  return (
    <div className="contents" inert={preview ? true : undefined}>
      {benefit && (benefit.description || benefit.terms) && (
        <div className="mt-5 w-full max-w-sm rounded-2xl border border-[#e4e7ec] bg-white p-4 text-left shadow-sm">
          {benefit.description && (
            <p className="text-sm text-[#344054]">{benefit.description}</p>
          )}
          {benefit.terms && (
            <p className="mt-2 text-xs leading-relaxed text-[#667085]">
              <span className="font-semibold">Condiciones:</span>{" "}
              {benefit.terms}
            </p>
          )}
        </div>
      )}

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="mt-8 w-full max-w-sm space-y-3"
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tu nombre"
          required
          className="w-full rounded-2xl border border-[#d0d5dd] bg-white px-4 py-4 text-sm text-[#101828] placeholder:text-[#9ca3af] focus:border-[#5C6BC0] focus:outline-none focus:ring-1 focus:ring-[#5C6BC0]"
        />

        <div className="flex overflow-hidden rounded-2xl border border-[#d0d5dd] bg-white focus-within:border-[#5C6BC0] focus-within:ring-1 focus-within:ring-[#5C6BC0]">
          <span className="flex items-center border-r border-[#d0d5dd] bg-[#f3f4f6] px-4 text-sm font-medium text-[#475467]">
            +598
          </span>
          <input
            type="tel"
            inputMode="numeric"
            value={phone}
            // Pre-piloto #7 — bug real: el `maxLength` en el DOM truncaba el
            // valor pegado (ej. "+59891624988") a 9 caracteres CRUDOS antes
            // de limpiarlo, perdiendo dígitos reales. `normalizeUruguayNationalPhone`
            // ya limpia y recorta el prefijo "598"/"0" ANTES de recortar a 9
            // — mismo helper que ya usa PhoneInput en onboarding.
            onChange={(e) =>
              setPhone(normalizeUruguayNationalPhone(e.target.value))
            }
            placeholder="91624988"
            required
            className="w-full bg-transparent py-4 pl-3 pr-4 text-sm text-[#101828] placeholder:text-[#9ca3af] focus:outline-none"
          />
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-[color:var(--pub-text-muted)]">
            Fecha de nacimiento (opcional)
          </p>
          <div className="grid grid-cols-3 gap-2">
            <select
              value={birthDay}
              onChange={(e) => setBirthDay(e.target.value)}
              aria-label="Día"
              className="rounded-2xl border border-[#d0d5dd] bg-white px-3 py-3 text-sm text-[#101828] focus:border-[#5C6BC0] focus:outline-none focus:ring-1 focus:ring-[#5C6BC0]"
            >
              <option value="">Día</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d.toString().padStart(2, "0")}
                </option>
              ))}
            </select>
            <select
              value={birthMonth}
              onChange={(e) => setBirthMonth(e.target.value)}
              aria-label="Mes"
              className="rounded-2xl border border-[#d0d5dd] bg-white px-3 py-3 text-sm text-[#101828] focus:border-[#5C6BC0] focus:outline-none focus:ring-1 focus:ring-[#5C6BC0]"
            >
              <option value="">Mes</option>
              {MONTHS_ES.map((label, i) => (
                <option key={i} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              aria-label="Año"
              className="rounded-2xl border border-[#d0d5dd] bg-white px-3 py-3 text-sm text-[#101828] focus:border-[#5C6BC0] focus:outline-none focus:ring-1 focus:ring-[#5C6BC0]"
            >
              <option value="">Año</option>
              {yearRange.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-center text-xs text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving || !name.trim() || phone.length < 8}
          className="w-full rounded-[14px] py-4 text-base font-bold transition-opacity disabled:opacity-45"
          style={{
            backgroundColor: "var(--pub-accent)",
            color: "var(--pub-on-accent)",
          }}
        >
          {saving ? (savingLabel ?? "Guardando…") : submitLabel}
        </button>
      </form>

      {onRecoverInstead ? (
        <button
          type="button"
          onClick={() => onRecoverInstead(phone)}
          className="mt-5 text-xs font-medium text-[color:var(--pub-text-muted)] underline underline-offset-2 hover:text-[color:var(--pub-text)]"
        >
          Ya soy cliente
        </button>
      ) : null}
    </div>
  );
}

/**
 * La pantalla visual completa de inscripción, compartida entre el check-in
 * real y Programa → Página de inscripción. `preview` solo vuelve inerte el
 * árbol de controles; no cambia estilos, estructura ni copy.
 */
export function RegisterScreenContent({
  landing,
  palette,
  fill = true,
  preview = false,
  onSubmit,
  onRecoverInstead,
}: {
  landing: CheckinLanding;
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    accentText: string;
  };
  fill?: boolean;
  preview?: boolean;
  onSubmit?: (values: {
    name: string;
    phone: string;
    birthdate?: string;
  }) => Promise<{ error?: string } | void>;
  onRecoverInstead?: (phone: string) => void;
}) {
  const isRaffle = landing.benefit?.type === "raffle";
  const title =
    landing.welcomeMessage ??
    landing.benefitText ??
    `Sumate a ${landing.business.businessName}`;
  const subtitle = isRaffle
    ? "Dejanos tu nombre y número para participar del sorteo."
    : landing.benefitText
      ? "Dejanos tu nombre y número y te lo enviamos por WhatsApp."
      : "Dejanos tu nombre y número para registrar tu visita.";
  const btnLabel = isRaffle
    ? "Quiero participar"
    : landing.benefitText
      ? "Quiero mi beneficio"
      : "Registrar mi visita";

  return (
    <Shell
      landing={landing}
      brandOverride={palette}
      backgroundColor={landing.business.checkinBackgroundColor}
      fill={fill}
      hero
    >
      {/*
        Onboarding de Flikker, no landing del local. El logo del negocio va
        grande y centrado arriba (sin aro, sin "TU TARJETA EN FLIKKER" — el
        título ya lo dice); el resto manda lo que la persona tiene que hacer,
        alineado a la izquierda y con jerarquía clara en vez de un bloque
        centrado sobre un fondo de color.
      */}
      <h1
        className="text-[27px] font-extrabold leading-[1.12] tracking-[-0.035em]"
        style={{ color: "var(--pub-text)" }}
      >
        {title}
      </h1>
      <p className="mt-2 text-[15px] leading-6" style={{ color: "var(--pub-text-muted)" }}>
        {subtitle}
      </p>

      <RegisterFormFields
        benefit={landing.benefit}
        submitLabel={btnLabel}
        savingLabel="Registrando…"
        onSubmit={onSubmit}
        onRecoverInstead={onRecoverInstead}
        preview={preview}
      />
    </Shell>
  );
}

function RegisterScreen({
  token,
  landing,
  presenceCode,
  onRegistered,
  onExists,
  onRecoverInstead,
}: {
  token: string;
  landing: CheckinLanding;
  /** Código del local ya ingresado; `""` cuando el negocio no lo exige. */
  presenceCode: string;
  onRegistered: (data: PersonalSpace) => void;
  onExists: (phone: string) => void;
  onRecoverInstead: (phone: string) => void;
}) {
  const palette = useImagePalette(
    `${token}:${landing.business.logoUrl ?? ""}`,
    `/api/checkin/${encodeURIComponent(token)}/logo`,
    landing.business.logoUrl,
    landing.business.primaryColor,
  );

  async function handleRegister(values: {
    name: string;
    phone: string;
    birthdate?: string;
  }) {
    const result = await postJson(`/api/checkin/${token}/register`, {
      ...values,
      presenceCode: presenceCode || undefined,
    });

    if (result.ok && result.data?.status === "registered") {
      onRegistered(result.data.personal as PersonalSpace);
      return;
    }
    if (result.ok && result.data?.status === "exists") {
      onExists(values.phone);
      return;
    }
    return {
      error:
        (result.data?.message as string) ??
        "No pudimos registrarte. Probá de nuevo.",
    };
  }

  return (
    <RegisterScreenContent
      landing={landing}
      palette={palette}
      onSubmit={handleRegister}
      onRecoverInstead={onRecoverInstead}
    />
  );
}

// ── Recover (WhatsApp one-time code) ─────────────────────────────────────────

function RecoverScreen({
  token,
  landing,
  initialPhone,
  presenceCode,
  onRecovered,
  onBack,
}: {
  token: string;
  landing: CheckinLanding;
  initialPhone: string;
  /** Código del local ya ingresado; `""` cuando el negocio no lo exige. */
  presenceCode: string;
  onRecovered: (data: PersonalSpace) => void;
  onBack: () => void;
}) {
  const palette = useImagePalette(
    `${token}:${landing.business.logoUrl ?? ""}`,
    `/api/checkin/${encodeURIComponent(token)}/logo`,
    landing.business.logoUrl,
    landing.business.primaryColor,
  );
  const [phone, setPhone] = useState(initialPhone);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoSent = useRef(false);

  // Coming from a known-phone registration → send the code immediately.
  useEffect(() => {
    if (initialPhone && initialPhone.length >= 8 && !autoSent.current) {
      autoSent.current = true;
      void sendCode(initialPhone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendCode(target: string) {
    setBusy(true);
    setError(null);
    const result = await postJson(`/api/checkin/${token}/recover/start`, {
      phone: target,
    });
    setBusy(false);
    if (result.ok) {
      setCodeSent(true);
    } else {
      setError("No pudimos enviar el código. Revisá el número.");
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const result = await postJson(`/api/checkin/${token}/recover/verify`, {
      phone,
      code,
      presenceCode: presenceCode || undefined,
    });
    setBusy(false);
    if (result.ok && result.data?.status === "restored") {
      onRecovered(result.data.personal as PersonalSpace);
    } else {
      setError("Código incorrecto o vencido. Probá de nuevo.");
    }
  }

  return (
    <Shell
      landing={landing}
      brandOverride={palette}
      backgroundColor={landing.business.checkinBackgroundColor}
    >
      <h1 className="text-center text-2xl font-bold leading-tight text-[color:var(--pub-text)]">
        Recuperá tu perfil
      </h1>
      <p className="mt-3 max-w-sm text-center text-sm text-[color:var(--pub-text-muted)]">
        {codeSent
          ? "Te enviamos un código por WhatsApp. Ingresalo para continuar."
          : "Ingresá tu WhatsApp y te enviamos un código para confirmar que sos vos."}
      </p>

      <div className="mt-8 w-full max-w-sm space-y-3">
        {!codeSent ? (
          <>
            <div className="flex overflow-hidden rounded-2xl border border-[#d0d5dd] bg-white focus-within:border-[#5C6BC0] focus-within:ring-1 focus-within:ring-[#5C6BC0]">
              <span className="flex items-center border-r border-[#d0d5dd] bg-[#f3f4f6] px-4 text-sm font-medium text-[#475467]">
                +598
              </span>
              <input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) =>
                  setPhone(normalizeUruguayNationalPhone(e.target.value))
                }
                placeholder="91624988"
                className="w-full bg-transparent py-4 pl-3 pr-4 text-sm text-[#101828] placeholder:text-[#9ca3af] focus:outline-none"
              />
            </div>
            <button
              type="button"
              disabled={busy || phone.length < 8}
              onClick={() => void sendCode(phone)}
              className="w-full rounded-2xl py-4 text-base font-bold shadow-[0_10px_24px_rgba(12,16,30,0.2)] transition-opacity disabled:opacity-45"
              style={{
                backgroundColor: "var(--pub-accent)",
                color: "var(--pub-on-accent)",
              }}
            >
              {busy ? "Enviando…" : "Enviar código"}
            </button>
          </>
        ) : (
          <>
            <OtpInput
              value={code}
              onChange={setCode}
              autoFocus
              disabled={busy}
            />
            <button
              type="button"
              disabled={busy || code.length !== 6}
              onClick={() => void verify()}
              className="w-full rounded-2xl py-4 text-base font-bold shadow-[0_10px_24px_rgba(12,16,30,0.2)] transition-opacity disabled:opacity-45"
              style={{
                backgroundColor: "var(--pub-accent)",
                color: "var(--pub-on-accent)",
              }}
            >
              {busy ? "Verificando…" : "Confirmar"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void sendCode(phone)}
              className="w-full text-xs font-medium text-[color:var(--pub-text-muted)] underline underline-offset-2 hover:text-[color:var(--pub-text)]"
            >
              Reenviar código
            </button>
          </>
        )}

        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-center text-xs text-red-600">
            {error}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onBack}
        className="mt-5 text-xs font-medium text-[color:var(--pub-text-muted)] underline underline-offset-2 hover:text-[color:var(--pub-text)]"
      >
        Volver
      </button>
    </Shell>
  );
}

// ── Personal space ───────────────────────────────────────────────────────────

/** El icono del tipo de beneficio, para pasárselo a `BenefitCard`. */
function benefitIconFor(type: string): LucideIcon {
  if (type === "discount") return BadgePercent;
  if (type === "gift") return Gift;
  if (type === "raffle") return Ticket;
  if (type === "promotion") return Sparkles;
  return PartyPopper;
}

function PersonalScreen({
  token,
  landing,
  personal,
  checkinStatus,
  onSwitchAccount,
}: {
  token: string;
  landing: CheckinLanding;
  personal: PersonalSpace;
  checkinStatus: CheckinStatus;
  onSwitchAccount: () => void;
}) {
  const palette = useImagePalette(
    `${token}:${landing.business.logoUrl ?? ""}`,
    `/api/checkin/${encodeURIComponent(token)}/logo`,
    landing.business.logoUrl,
    landing.business.primaryColor,
  );
  const brand = palette.primary;
  const promptShown = useRef(false);
  const benefitViewed = useRef(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Ya no depende de que exista googleUrl: el mini-flow de feedback (§9)
  // vale por sí solo (sello bonus, opinión interna) incluso cuando no hay
  // link de Google — la oferta de Google es un paso aparte, condicionado
  // por el backend a partir del puntaje, nunca acá.
  const showReview = personal.reviewPrompt.show;

  useEffect(() => {
    if (showReview && !promptShown.current) {
      promptShown.current = true;
      void postJson(`/api/checkin/${token}/event`, {
        type: "review_prompt_shown",
      });
    }
  }, [showReview, token]);

  function onReviewLinkClicked() {
    void postJson(`/api/checkin/${token}/event`, {
      type: "review_link_clicked",
    });
  }

  async function switchAccount() {
    setLoggingOut(true);
    await postJson(`/api/checkin/session/logout`);
    onSwitchAccount();
  }

  function onBenefitReveal() {
    if (benefitViewed.current) return;
    benefitViewed.current = true;
    void postJson(`/api/checkin/${token}/event`, {
      type: "benefit_viewed",
    });
  }

  const firstName =
    personal.customer.name.split(" ")[0] || personal.customer.name;

  const isDuplicate = checkinStatus === "duplicate";

  /**
   * El estado de la tarjeta, leído una sola vez. Los tres bloques que
   * dependen de él (premio desbloqueado, tarjeta activa, misiones) preguntan
   * por estas dos constantes en vez de repetir el `?.` cada uno.
   *
   * Son mutuamente excluyentes por construcción del backend: un ciclo que
   * acaba de desbloquearse ya no está ACTIVE, así que nunca hay tarjeta en
   * progreso y premio recién desbloqueado a la vez.
   */
  const unlockedReward =
    personal.rewardGoal?.unlockedNow && personal.rewardGoal.benefit
      ? personal.rewardGoal.benefit
      : null;
  const activeGoal = personal.rewardGoal?.goal ?? null;

  /**
   * ¿Este beneficio es el mismo que ya se está mostrando como premio recién
   * desbloqueado? Se compara por código de canje, que es lo único que
   * identifica una emisión concreta — dos beneficios distintos pueden
   * llamarse igual.
   */
  function isUnlockedRewardBenefit(benefit: PersonalBenefit): boolean {
    return Boolean(
      unlockedReward &&
        benefit.redemption &&
        benefit.redemption.code === unlockedReward.code,
    );
  }

  return (
    <Shell
      landing={landing}
      brandOverride={palette}
      backgroundColor={landing.business.checkinBackgroundColor}
      compact
    >
      <div className="flex w-full max-w-md flex-col items-center">
        {/*
          ── 1. Qué pasó con ESTA visita ─────────────────────────────────────
          Una sola cabecera para los dos estados. En `duplicate` el mensaje
          que manda es que la visita ya estaba contada: va en el título, no en
          una pastilla debajo del saludo, porque es la única pregunta que la
          persona tiene parada frente al mostrador. Y no es un error: mismo
          tono, mismos colores, sin rojo ni ícono de alerta.
        */}
        <div className="checkin-success-pop mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--pub-surface)] text-[color:var(--pub-text)]">
          {isDuplicate ? (
            <Check className="h-5 w-5 stroke-[2.5]" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          )}
        </div>
        <h1 className="checkin-enter text-balance text-center text-2xl font-bold tracking-[-0.035em] text-[color:var(--pub-text)]">
          {isDuplicate ? "Tu visita de hoy ya está contada" : `¡Hola, ${firstName}!`}
        </h1>
        <p className="checkin-enter mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm text-[color:var(--pub-text-muted)]">
          <span className="font-semibold">
            {isDuplicate ? `Hola, ${firstName}` : "Tu visita quedó guardada"}
          </span>
          <span aria-hidden="true" className="opacity-50">
            ·
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Footprints className="h-4 w-4 shrink-0" aria-hidden="true" />
            {personal.visits.total}{" "}
            {personal.visits.total === 1 ? "visita" : "visitas"}
          </span>
        </p>

        <div className="mt-5 grid w-full grid-cols-1 gap-3">
          {/*
            ── 2. El premio, cuando acaba de desbloquearse ───────────────────
            Pasa a ser el elemento principal de la pantalla. NO se dibuja una
            tarjeta nueva 0/N debajo: el ciclo siguiente todavía no existe
            (ACTIVE → UNLOCKED → REDEEMED → próxima Visit → nueva ACTIVE), y
            mostrarlo sería prometer un progreso que el backend no tiene.
          */}
          {unlockedReward ? (
            <RewardUnlockedHero
              reward={unlockedReward}
              brand={brand}
              onReveal={onBenefitReveal}
            />
          ) : null}

          {/* Beneficios que ya puede usar hoy (bienvenida, promo,
              reactivación). Se omite el que ya viene mostrado arriba como
              premio recién desbloqueado — es la misma emisión. */}
          {personal.benefit && !isUnlockedRewardBenefit(personal.benefit) && (
            <BenefitRewardCard
              benefit={personal.benefit}
              brand={brand}
              onReveal={onBenefitReveal}
            />
          )}

          {/*
            Mismo filtro que arriba, y por el mismo motivo: cuando la visita
            desbloquea la tarjeta, el backend devuelve esa emisión DOS veces —
            como `rewardGoal.benefit` (el premio recién ganado) y otra vez
            dentro de `otherBenefits` (los beneficios sin canjear). Sin este
            filtro el cliente ve el mismo premio dos veces en la misma
            pantalla. No se deduplica por título — dos beneficios distintos
            pueden llamarse igual — sino por código de canje, que es lo único
            que identifica una emisión concreta.
          */}
          {(personal.otherBenefits ?? [])
            .filter((benefit) => !isUnlockedRewardBenefit(benefit))
            .map((benefit, i) => (
              <BenefitRewardCard
                key={`${benefit.redemption?.code ?? benefit.title}-${i}`}
                benefit={benefit}
                brand={brand}
                onReveal={onBenefitReveal}
              />
            ))}

          {/*
            ── 3. La tarjeta activa ──────────────────────────────────────────
            El mismo `LoyaltyCard` de siempre, con la configuración real del
            negocio. En `duplicate` se muestra igual pero atenuada y con una
            línea que aclara que hoy no cambió: el progreso no es la noticia.
          */}
          {activeGoal ? (
            <div className={isDuplicate ? "opacity-90" : undefined}>
              <LoyaltyCard
                rewardName={activeGoal.incentiveName}
                progress={activeGoal.progressVisits}
                target={activeGoal.targetAdditionalVisits}
                bonusStamps={activeGoal.bonusStamps ?? 0}
                appearance={{
                  cardColor: landing.business.loyaltyCardColor ?? brand,
                  textColor: landing.business.loyaltyCardTextColor,
                  backgroundImage: landing.business.loyaltyCardBackgroundImage,
                  stampAreaColor: landing.business.loyaltyStampAreaColor,
                  stampColor: landing.business.loyaltyStampColor,
                  stampIcon: landing.business.loyaltyStampIcon,
                  logoUrl: landing.business.logoUrl,
                  businessName: landing.business.businessName,
                  showBusinessName: landing.business.loyaltyShowBusinessName,
                  stampBackgroundPattern:
                    landing.business.loyaltyStampBackgroundPattern,
                  stampBackgroundOpacity:
                    landing.business.loyaltyStampBackgroundOpacity,
                }}
              />
              {isDuplicate ? (
                <p className="mt-2 text-center text-xs text-[color:var(--pub-text-muted)]">
                  Tu tarjeta no cambió con esta visita.
                </p>
              ) : null}
            </div>
          ) : null}

          {/*
            ── 4. Desafíos ───────────────────────────────────────────────────
            Solo los que existen de verdad. Primero el desafío de vuelta que
            ESTA visita completó (es un hecho recién ocurrido), después las
            misiones vivas. Van DESPUÉS de la tarjeta: el progreso real se lee
            primero y el aviso del sello extra lo explica a continuación.
          */}
          {personal.returnChallengeCompleted ? (
            <ChallengeRow
              kind="return_challenge"
              variant="card"
              status="completed"
              title={
                personal.returnChallengeBonusApplied
                  ? "Volviste a tiempo"
                  : "¡Completaste tu desafío de vuelta!"
              }
              // El sello solo se promete cuando REALMENTE sumó progreso: la
              // visita normal, sola, puede haber alcanzado el target y dejado
              // el bonus como excedente.
              subtitle={
                personal.returnChallengeBonusApplied
                  ? "Ganaste +1 sello extra por tu desafío."
                  : null
              }
            />
          ) : null}

          {(personal.missions ?? []).map((mission) => (
            <ChallengeRow
              key={mission.missionId}
              kind="mission"
              variant="card"
              title={mission.name}
              progress={mission.progress}
              subtitle={
                mission.progress.complete
                  ? "¡Completaste el desafío!"
                  : `${mission.progress.current} de ${mission.progress.target} visitas`
              }
              status={mission.progress.complete ? "completed" : "active"}
              reward={missionReward(mission)}
              // Solo cuando además hay tarjeta de sellos: sin ella la frase no
              // tendría a qué referirse con "también".
              footnote={
                activeGoal
                  ? "Tus visitas también cuentan para este desafío"
                  : null
              }
            />
          ))}
        </div>

        {/* ── 5. Feedback ─────────────────────────────────────────────────── */}
        {showReview && (
          <div className="mt-4 w-full">
            <CheckinFeedbackCard
              hasActiveGoal={Boolean(activeGoal)}
              onReviewLinkClicked={onReviewLinkClicked}
            />
          </div>
        )}

        {/* ── 6. Navegación secundaria ───────────────────────────────────── */}
        <Link
          href="/mi-flikker"
          className="checkin-enter-delay mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[14px] py-3 text-sm font-bold"
          style={{
            backgroundColor: "var(--pub-accent)",
            color: "var(--pub-on-accent)",
          }}
        >
          Mis lugares y premios
        </Link>

        <button
          type="button"
          onClick={() => void switchAccount()}
          disabled={loggingOut}
          className="mt-2 rounded-full px-4 py-1.5 text-xs font-semibold text-[color:var(--pub-text-muted)] transition-colors hover:bg-[color:var(--pub-surface)] hover:text-[color:var(--pub-text)] disabled:opacity-60"
        >
          {loggingOut ? "Cerrando…" : "Cambiar de cuenta"}
        </button>
      </div>
    </Shell>
  );
}

/**
 * "Un regalo para vos" — la card de beneficio real que ve el cliente en su
 * espacio personal, exista o no una tarjeta de sellos. Exportada a
 * propósito: Programa → Tarjeta digital la reusa para la preview del modo
 * Solo-Beneficios, en vez de una maqueta desconectada.
 */
export function BenefitRewardCard({
  benefit,
  brand,
  onReveal,
}: {
  benefit: PersonalBenefit;
  brand: string;
  onReveal?: () => void;
}) {
  return (
    <div className="checkin-enter-delay">
      <BenefitCard
        title={benefit.title}
        description={benefit.description}
        terms={benefit.terms}
        icon={benefitIconFor(benefit.type)}
        code={benefit.redemption?.code ?? null}
        redeemed={benefit.redemption?.redeemed ?? false}
        reveal="slide"
        brand={brand}
        onReveal={onReveal}
        footer={
          !benefit.redemption && benefit.type === "raffle"
            ? "Ya estás participando. ¡Mucha suerte!"
            : undefined
        }
      />
    </div>
  );
}

/**
 * El premio de una misión, traducido a la forma que espera `ChallengeRow`.
 *
 * `rewardHidden` es una decisión del negocio: el premio existe pero no se
 * nombra hasta completar la misión. Sin premio configurado no se inventa
 * ninguna fila.
 */
function missionReward(mission: MissionView) {
  const { remaining, complete } = mission.progress;
  if (mission.rewardHidden) {
    return {
      label: "Premio secreto",
      detail:
        remaining === 1
          ? "te falta 1 visita para descubrirlo"
          : `te faltan ${remaining} visitas para descubrirlo`,
    };
  }
  if (!mission.rewardName) return null;
  return {
    label: complete
      ? `Desbloqueaste: ${mission.rewardName}`
      : mission.rewardName,
    detail: mission.rewardCode ? `código ${mission.rewardCode}` : null,
  };
}

/**
 * El premio que ESTA visita acaba de desbloquear — el elemento principal de
 * la pantalla cuando ocurre.
 *
 * Trae su propio canje (`SlideToReveal` con el código real de la emisión),
 * así el cliente puede usarlo ahí mismo en el mostrador en vez de tener que
 * ir a buscarlo a Mi Flikker.
 *
 * Lo que deliberadamente NO hace: dibujar la tarjeta siguiente en 0/N. El
 * ciclo nuevo no existe todavía — nace recién con la próxima Visit válida
 * (ACTIVE → UNLOCKED → REDEEMED → próxima Visit → nueva ACTIVE) — y
 * anticiparlo sería mostrar un progreso que el backend no tiene.
 */
function RewardUnlockedHero({
  reward,
  brand,
  onReveal,
}: {
  reward: NonNullable<RewardGoalView["benefit"]>;
  brand: string;
  onReveal?: () => void;
}) {
  return (
    <div className="checkin-enter checkin-hover-lift relative overflow-hidden rounded-[24px] border border-[color:var(--pub-surface-border)] bg-[color:var(--pub-surface)] p-5 text-[color:var(--pub-text)]">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{
            backgroundColor: "var(--pub-accent)",
            color: "var(--pub-on-accent)",
          }}
        >
          <PartyPopper className="h-4 w-4" aria-hidden="true" />
        </span>
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-[color:var(--pub-text-muted)]">
          Completaste la tarjeta
        </p>
      </div>

      <p className="mt-3 text-[22px] font-bold leading-tight tracking-[-0.02em]">
        {reward.name}
      </p>
      {reward.expiresAt ? (
        <p className="mt-1.5 text-xs text-[color:var(--pub-text-muted)]">
          Válido hasta{" "}
          {new Date(reward.expiresAt).toLocaleDateString("es-UY")}
        </p>
      ) : null}

      <div className="mt-5">
        <SlideToReveal
          code={reward.code}
          brand={brand}
          onReveal={onReveal ?? (() => undefined)}
        />
      </div>
    </div>
  );
}

// ── Layout primitives ────────────────────────────────────────────────────────

/**
 * Exportado (no solo local a este archivo): Programa → Página de inscripción
 * lo reusa para su preview en vivo, en vez de mantener una maqueta
 * desconectada — mismo fondo, mismo logo, mismo pie de "Powered by Flikker"
 * que ve el cliente real. `brandOverride` es opcional a propósito: la
 * preview del panel no necesita (ni puede, sin un token real) la extracción
 * de paleta desde el logo — pasa los colores configurados directamente.
 *
 * `fill`: `true` (default, comportamiento real sin cambios) ocupa el
 * viewport completo (`min-h-[100dvh]`). La preview del panel pasa `false`
 * para llenar en cambio el alto fijo del marco de celular (`PhoneFrame`).
 */
export function Shell({
  landing,
  brandOverride,
  backgroundColor,
  fill = true,
  compact = false,
  hero = false,
  children,
}: {
  landing: CheckinLanding;
  brandOverride?: { primary: string; secondary: string };
  /**
   * `true` solo en el registro: logo grande y centrado, sin aro ni eyebrow —
   * ver `CustomerShell`'s `businessPresentation="hero"`. En cualquier otra
   * pantalla del check-in (código de local, personal, recuperar perfil) el
   * header sigue siendo el chico de siempre.
   */
  hero?: boolean;
  /**
   * `Business.checkinBackgroundColor` — ya NO pinta nada. Se mantiene en la
   * firma porque el panel lo sigue pasando desde su preview en vivo, pero
   * deliberadamente se ignora: era el campo que teñía la pantalla entera y
   * hacía que la app se viera distinta en cada local. La identidad del
   * negocio ahora entra por su color de marca, no por un fondo elegido.
   */
  backgroundColor?: string | null;
  fill?: boolean;
  compact?: boolean;
  children: React.ReactNode;
}) {
  void backgroundColor;
  const brand = brandOverride?.primary ?? brandOf(landing);

  return (
    <CustomerShell
      business={{
        name: landing.business.businessName,
        logoUrl: landing.business.logoUrl,
      }}
      businessPresentation={hero ? "hero" : "compact"}
      eyebrow={hero ? null : "Tu tarjeta en Flikker"}
      brand={brand}
      fill={fill}
      compact={compact}
    >
      {children}
    </CustomerShell>
  );
}


function CenteredSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
      <Loader2 className="h-6 w-6 animate-spin text-[#5C6BC0]" />
    </div>
  );
}
