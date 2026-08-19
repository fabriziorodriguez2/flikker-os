"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  BadgePercent,
  Check,
  CheckCircle2,
  Footprints,
  Gift,
  Loader2,
  LockKeyhole,
  PartyPopper,
  Sparkles,
  Ticket,
} from "lucide-react";
import PoweredByFlikker from "@/components/ui/powered-by-flikker";
import { normalizeUruguayNationalPhone } from "@/components/ui/phone-input";
import OtpInput from "@/components/ui/otp-input";
import { useImagePalette } from "@/lib/use-logo-palette";
import LoyaltyCard from "@/components/public/loyalty-card";
import CheckinFeedbackCard from "@/components/public/checkin-feedback-card";
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
}

type Mode = "booting" | "register" | "recover" | "personal";
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

function brandOf(landing: CheckinLanding): string {
  return landing.business.primaryColor ?? "#5C6BC0";
}

function colorWithAlpha(color: string, alpha: string, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alpha}` : fallback;
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
  const [mode, setMode] = useState<Mode>(hasSession ? "booting" : "register");
  const [personal, setPersonal] = useState<PersonalSpace | null>(null);
  const [checkinStatus, setCheckinStatus] = useState<CheckinStatus>(null);
  const [prefillPhone, setPrefillPhone] = useState("");

  // On mount, if we already have a session cookie, attempt a recognized
  // check-in. A 401 means the session is dead → fall back to the form.
  useEffect(() => {
    if (!hasSession) return;
    let active = true;
    void (async () => {
      const result = await postJson(`/api/checkin/${token}/checkin`);
      if (!active) return;
      if (result.ok && result.data) {
        setPersonal(result.data.personal as PersonalSpace);
        setCheckinStatus((result.data.status as CheckinStatus) ?? "checked_in");
        setMode("personal");
      } else {
        setMode("register");
      }
    })();
    return () => {
      active = false;
    };
  }, [hasSession, token]);

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
        onRecovered={(data) => goPersonal(data, "checked_in")}
        onBack={() => setMode("register")}
      />
    );
  }

  return (
    <RegisterScreen
      token={token}
      landing={landing}
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
  palette,
  submitLabel,
  savingLabel,
  onSubmit,
  onRecoverInstead,
}: {
  benefit: CheckinLanding["benefit"];
  palette: { accent: string; accentText: string };
  submitLabel: string;
  savingLabel?: string;
  onSubmit?: (values: {
    name: string;
    phone: string;
    birthdate?: string;
  }) => Promise<{ error?: string } | void>;
  onRecoverInstead?: (phone: string) => void;
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
    <>
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
          <p className="mb-1.5 text-xs font-medium text-white/70">
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
          className="w-full rounded-2xl py-4 text-base font-bold shadow-[0_10px_24px_rgba(12,16,30,0.2)] transition-all hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-45"
          style={{ backgroundColor: palette.accent, color: palette.accentText }}
        >
          {saving ? (savingLabel ?? "Guardando…") : submitLabel}
        </button>
      </form>

      {onRecoverInstead ? (
        <button
          type="button"
          onClick={() => onRecoverInstead(phone)}
          className="mt-5 text-xs font-medium text-white/70 underline underline-offset-2 hover:text-white"
        >
          Ya soy cliente
        </button>
      ) : null}
    </>
  );
}

function RegisterScreen({
  token,
  landing,
  onRegistered,
  onExists,
  onRecoverInstead,
}: {
  token: string;
  landing: CheckinLanding;
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

  const isRaffle = landing.benefit?.type === "raffle";
  // `welcomeMessage` SOLO reemplaza el título — el subtítulo y el botón de
  // acá abajo siguen decidiéndose con `benefitText`, a propósito, para no
  // romper esa lógica ("¿hay un beneficio real detrás?").
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

  async function handleRegister(values: {
    name: string;
    phone: string;
    birthdate?: string;
  }) {
    const result = await postJson(`/api/checkin/${token}/register`, values);

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
    <Shell landing={landing} brandOverride={palette}>
      <h1 className="text-center text-2xl font-bold leading-tight text-white">
        {title}
      </h1>
      <p className="mt-3 text-center text-sm text-white/70">{subtitle}</p>

      <RegisterFormFields
        benefit={landing.benefit}
        palette={palette}
        submitLabel={btnLabel}
        savingLabel="Registrando…"
        onSubmit={handleRegister}
        onRecoverInstead={onRecoverInstead}
      />
    </Shell>
  );
}

// ── Recover (WhatsApp one-time code) ─────────────────────────────────────────

function RecoverScreen({
  token,
  landing,
  initialPhone,
  onRecovered,
  onBack,
}: {
  token: string;
  landing: CheckinLanding;
  initialPhone: string;
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
    });
    setBusy(false);
    if (result.ok && result.data?.status === "restored") {
      onRecovered(result.data.personal as PersonalSpace);
    } else {
      setError("Código incorrecto o vencido. Probá de nuevo.");
    }
  }

  return (
    <Shell landing={landing} brandOverride={palette}>
      <h1 className="text-center text-2xl font-bold leading-tight text-white">
        Recuperá tu perfil
      </h1>
      <p className="mt-3 max-w-sm text-center text-sm text-white/70">
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
                backgroundColor: palette.accent,
                color: palette.accentText,
              }}
            >
              {busy ? "Enviando…" : "Enviar código"}
            </button>
          </>
        ) : (
          <>
            <OtpInput value={code} onChange={setCode} tone="dark" autoFocus />
            <button
              type="button"
              disabled={busy || code.length !== 6}
              onClick={() => void verify()}
              className="w-full rounded-2xl py-4 text-base font-bold shadow-[0_10px_24px_rgba(12,16,30,0.2)] transition-opacity disabled:opacity-45"
              style={{
                backgroundColor: palette.accent,
                color: palette.accentText,
              }}
            >
              {busy ? "Verificando…" : "Confirmar"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void sendCode(phone)}
              className="w-full text-xs font-medium text-white/70 underline underline-offset-2 hover:text-white"
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
        className="mt-5 text-xs font-medium text-white/70 underline underline-offset-2 hover:text-white"
      >
        Volver
      </button>
    </Shell>
  );
}

// ── Personal space ───────────────────────────────────────────────────────────

function BenefitIcon({ type }: { type: string }) {
  const iconClass = "h-5 w-5";

  if (type === "discount") {
    return <BadgePercent className={iconClass} aria-hidden="true" />;
  }
  if (type === "gift") {
    return <Gift className={iconClass} aria-hidden="true" />;
  }
  if (type === "raffle") {
    return <Ticket className={iconClass} aria-hidden="true" />;
  }
  if (type === "promotion") {
    return <Sparkles className={iconClass} aria-hidden="true" />;
  }
  return <PartyPopper className={iconClass} aria-hidden="true" />;
}

function SlideToReveal({
  code,
  brand,
  onReveal,
}: {
  code: string;
  brand: string;
  onReveal: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(0);
  const pointerStartRef = useRef<{ pointerX: number; dragX: number } | null>(
    null,
  );
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [breaking, setBreaking] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Canje por URL — el QR ya no codifica el código en texto plano: codifica
  // una URL (`/redeem/{code}`) que el empleado abre con la cámara NATIVA de
  // su teléfono (no una cámara dentro de Flikker). Esa pantalla ya sabe
  // resolver el negocio y el permiso a partir del propio código — nada
  // nuevo del lado del servidor, es el mismo `redemptionCode` de siempre.
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!revealed) return;
    let cancelled = false;
    const redeemUrl = `${window.location.origin}/redeem/${code}`;
    void QRCode.toDataURL(redeemUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 220,
    }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [revealed, code]);

  function maxDrag() {
    return Math.max(0, (trackRef.current?.clientWidth ?? 0) - 60);
  }

  function moveTo(next: number) {
    const value = Math.min(maxDrag(), Math.max(0, next));
    dragRef.current = value;
    setDragX(value);
  }

  function reveal() {
    if (revealed || breaking) return;
    moveTo(maxDrag());
    setBreaking(true);
    onReveal();
    revealTimerRef.current = setTimeout(() => {
      setRevealed(true);
      setBreaking(false);
    }, 620);
  }

  function finishDrag() {
    const max = maxDrag();
    pointerStartRef.current = null;
    setDragging(false);
    if (max > 0 && dragRef.current >= max * 0.76) {
      reveal();
    } else {
      moveTo(0);
    }
  }

  if (revealed) {
    return (
      <div className="checkin-code-reveal relative overflow-hidden rounded-[22px] border border-white/38 bg-white/16 px-4 py-4 text-center backdrop-blur-sm">
        <div className="checkin-unlock-icon mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#343B68] shadow-[0_6px_16px_rgba(21,25,46,0.18)]">
          <Check className="h-4 w-4 stroke-[3]" aria-hidden="true" />
        </div>
        <div className="text-sm font-bold text-white">
          ¡Premio desbloqueado!
        </div>
        <p className="mt-1 text-[11px] text-white/65">
          Mostrá este QR en el local
        </p>
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrDataUrl}
            alt="QR para canjear tu recompensa"
            className="mx-auto mt-3 h-[140px] w-[140px] rounded-[12px] bg-white p-2"
          />
        ) : null}
        <p className="mt-2 font-mono text-[15px] font-bold tracking-[0.15em] text-white/80">
          {code}
        </p>
        <p className="mt-0.5 text-[10px] text-white/55">
          O decile este código al personal
        </p>
      </div>
    );
  }

  if (breaking) {
    return (
      <div className="checkin-seal-break relative h-[60px] overflow-visible rounded-full">
        <div className="checkin-seal-piece checkin-seal-piece-left absolute inset-y-0 left-0 w-[52%] rounded-l-full border border-white/30 bg-black/12 backdrop-blur-sm" />
        <div className="checkin-seal-piece checkin-seal-piece-right absolute inset-y-0 right-0 w-[52%] rounded-r-full border border-white/30 bg-black/12 backdrop-blur-sm" />
        <div className="checkin-seal-burst absolute inset-0 z-10 flex items-center justify-center gap-2 text-white">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          <span className="text-xs font-bold">¡Listo!</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={trackRef}
      className="relative h-[60px] touch-none select-none overflow-hidden rounded-full border border-white/30 bg-black/12 p-1 shadow-inner"
    >
      <div
        aria-hidden="true"
        className="absolute bottom-1 left-1 top-1 rounded-full bg-white/10 transition-[width] duration-75"
        style={{ width: Math.max(52, dragX + 52) }}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center pl-10 pr-3">
        <span
          className={`text-xs font-bold text-white transition-opacity duration-200 ${
            dragX > 52 ? "opacity-40" : "opacity-90"
          }`}
        >
          Deslizá para reclamar
        </span>
      </div>
      <button
        type="button"
        aria-label="Deslizá hacia la derecha para revelar el código del beneficio"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          pointerStartRef.current = {
            pointerX: event.clientX,
            dragX: dragRef.current,
          };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const start = pointerStartRef.current;
          if (!start) return;
          moveTo(start.dragX + event.clientX - start.pointerX);
        }}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            reveal();
          }
        }}
        className={`absolute left-1 top-1/2 z-10 flex h-[52px] w-[52px] items-center justify-center rounded-full border-[3px] border-white bg-white shadow-[0_6px_18px_rgba(31,35,58,0.22)] outline outline-1 outline-white/35 outline-offset-2 focus-visible:ring-2 focus-visible:ring-white/80 ${
          dragging ? "" : "transition-transform duration-300 ease-out"
        }`}
        style={{
          transform: `translate3d(${dragX}px, -50%, 0)`,
          color: brand,
        }}
      >
        <LockKeyhole className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
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

  return (
    <Shell landing={landing} brandOverride={palette}>
      <div className="flex w-full max-w-md flex-col items-center">
        <div className="checkin-success-pop mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/14 text-white">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h1 className="checkin-enter text-center text-[28px] font-bold tracking-[-0.035em] text-white">
          ¡Hola, {firstName}! <span aria-hidden="true">👋</span>
        </h1>
        <p className="checkin-enter mt-3 flex items-center gap-1.5 rounded-full bg-white/12 px-3.5 py-2 text-center text-[13px] font-semibold text-white/90">
          <Check className="h-3.5 w-3.5 stroke-[2.5]" aria-hidden="true" />
          {checkinStatus === "duplicate"
            ? "Tu visita de hoy ya estaba guardada"
            : "¡Tu visita quedó guardada!"}
        </p>

        <div className="mt-6 grid w-full grid-cols-1 gap-4">
          <div className="checkin-enter relative overflow-hidden rounded-[24px] bg-white px-5 py-4 shadow-[0_10px_24px_rgba(12,16,30,0.14)]">
            <div className="relative flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-[14px]"
                  style={{
                    backgroundColor: colorWithAlpha(
                      brand,
                      "18",
                      "rgba(92,107,192,0.1)",
                    ),
                    color: brand,
                  }}
                >
                  <Footprints className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-bold text-[#24283A]">
                    ¡Seguís sumando!
                  </p>
                  <p className="mt-0.5 text-xs text-[#8A91A3]">
                    Cada visita te acerca a algo lindo
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[32px] font-bold leading-none text-[#171A2B]">
                  {personal.visits.total}
                </p>
                <p className="mt-1 text-[11px] font-semibold text-[#8A91A3]">
                  {personal.visits.total === 1 ? "visita" : "visitas"}
                </p>
              </div>
            </div>
          </div>

          <RewardGoalCard
            rewardGoal={personal.rewardGoal}
            brand={brand}
            landing={landing}
          />

          {personal.benefit && (
            <BenefitRewardCard
              benefit={personal.benefit}
              brand={brand}
              onReveal={onBenefitReveal}
            />
          )}
        </div>

        {showReview && (
          <div className="mt-5 w-full">
            <CheckinFeedbackCard
              hasActiveGoal={Boolean(personal.rewardGoal?.goal)}
              brand={brand}
              accentBg={palette.accent}
              accentText={palette.accentText}
              onReviewLinkClicked={onReviewLinkClicked}
            />
          </div>
        )}

        <Link
          href="/mi-flikker"
          className="checkin-enter-delay mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[16px] bg-white py-3.5 text-sm font-semibold text-[#24283A] shadow-[0_8px_18px_rgba(12,16,30,0.12)] transition-colors hover:bg-white/90"
        >
          Mis lugares y premios
        </Link>

        <button
          type="button"
          onClick={() => void switchAccount()}
          disabled={loggingOut}
          className="mt-4 rounded-full px-4 py-2 text-xs font-semibold text-white/65 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-60"
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
    <div
      className="checkin-enter-delay relative overflow-hidden rounded-[24px] border border-white/12 bg-black/20 p-5 text-left text-white shadow-[0_10px_24px_rgba(12,16,30,0.16)]"
      style={{
        backgroundColor: "rgba(14, 17, 29, 0.24)",
      }}
    >
      <div className="relative flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/35 bg-white/20 backdrop-blur-sm">
          <BenefitIcon type={benefit.type} />
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="text-xs font-semibold text-white/75">
            Un regalo para vos
          </p>
          <p className="mt-1 text-lg font-bold leading-tight text-white">
            {benefit.title}
          </p>
        </div>
      </div>
      {benefit.description && (
        <p className="relative mt-3 text-sm leading-5 text-white/78">
          {benefit.description}
        </p>
      )}
      {benefit.terms && (
        <p className="relative mt-2 text-[11px] leading-relaxed text-white/58">
          <span className="font-bold text-white/72">Condiciones:</span>{" "}
          {benefit.terms}
        </p>
      )}

      {benefit.redemption &&
        (benefit.redemption.redeemed ? (
          <div className="relative mt-4 flex items-center gap-2 rounded-[15px] border border-white/18 bg-white/14 px-3.5 py-3 text-xs font-bold text-white/82">
            <CheckCircle2 className="h-4 w-4" /> Ya disfrutaste este beneficio
          </div>
        ) : (
          <div className="relative mt-5">
            <SlideToReveal
              code={benefit.redemption.code}
              brand={brand}
              onReveal={onReveal ?? (() => undefined)}
            />
            <p className="mt-2 text-center text-[10px] text-white/60">
              Mostralo al personal cuando quieras disfrutarlo
            </p>
          </div>
        ))}

      {!benefit.redemption && benefit.type === "raffle" && (
        <div className="relative mt-4 flex items-center gap-2 rounded-[15px] border border-white/18 bg-white/14 px-3.5 py-3 text-xs font-bold text-white/86">
          <Ticket className="h-4 w-4" aria-hidden="true" />
          Ya estás participando. ¡Mucha suerte!
        </div>
      )}
    </div>
  );
}

/**
 * Fase E §14/§15: the reason to scan is the customer's own progress, never
 * "for our metrics". Three states: unlocked just now, still in progress, or
 * nothing active — the last one still explains what scanning is for.
 */
function RewardGoalCard({
  rewardGoal,
  brand,
  landing,
}: {
  rewardGoal: RewardGoalView | null | undefined;
  brand: string;
  landing: CheckinLanding;
}) {
  if (!rewardGoal) return null;

  if (rewardGoal.unlockedNow && rewardGoal.benefit) {
    return (
      <div className="checkin-enter checkin-hover-lift relative overflow-hidden rounded-[24px] bg-white p-5 shadow-[0_10px_24px_rgba(12,16,30,0.14)]">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{
              backgroundColor: `color-mix(in srgb, ${brand} 12%, white)`,
              color: brand,
            }}
          >
            <PartyPopper className="h-4 w-4" aria-hidden="true" />
          </span>
          <p className="text-sm font-bold" style={{ color: brand }}>
            ¡Recompensa desbloqueada!
          </p>
        </div>
        <p className="mt-3 text-[20px] font-bold leading-tight text-[#171A2B]">
          {rewardGoal.benefit.name}
        </p>
        <p className="mt-1.5 text-xs text-[#8A91A3]">
          Ya la tenés disponible en tu cuenta Flikker.
        </p>
      </div>
    );
  }

  if (rewardGoal.goal) {
    const {
      progressVisits,
      targetAdditionalVisits,
      incentiveName,
      bonusStamps,
    } = rewardGoal.goal;
    return (
      <div className="checkin-enter checkin-hover-lift">
        <LoyaltyCard
          rewardName={incentiveName}
          progress={progressVisits}
          target={targetAdditionalVisits}
          bonusStamps={bonusStamps ?? 0}
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
          }}
        />
      </div>
    );
  }

  return null;
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
  fill = true,
  children,
}: {
  landing: CheckinLanding;
  brandOverride?: { primary: string; secondary: string };
  fill?: boolean;
  children: React.ReactNode;
}) {
  const brand = brandOverride?.primary ?? brandOf(landing);
  const secondary =
    brandOverride?.secondary ?? `color-mix(in srgb, ${brand} 58%, #20233D)`;

  return (
    <div
      className={`relative flex w-full flex-col overflow-hidden ${
        fill ? "min-h-[100dvh]" : "h-full min-h-full"
      }`}
      style={{
        backgroundImage: `linear-gradient(145deg, ${brand} 0%, ${secondary} 100%)`,
      }}
    >
      <div className="relative flex flex-1 flex-col items-center justify-start px-5 py-8 sm:px-6 sm:py-10">
        {landing.business.logoUrl && (
          <div className="relative mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={landing.business.logoUrl}
              alt={landing.business.businessName}
              className="h-28 w-28 object-contain sm:h-32 sm:w-32"
            />
          </div>
        )}
        {children}
      </div>
      <p className="relative pb-5 text-center text-xs text-white/45">
        <PoweredByFlikker />
      </p>
    </div>
  );
}

function CenteredSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
      <Loader2 className="h-6 w-6 animate-spin text-[#5C6BC0]" />
    </div>
  );
}
