"use client";

import { useEffect, useRef, useState } from "react";
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
  Star,
  Ticket,
} from "lucide-react";
import PoweredByFlikker from "@/components/ui/powered-by-flikker";
import type { CheckinLanding, PublicBenefit } from "./page";

// ── Types shared with the API responses ──────────────────────────────────────

interface PersonalBenefit extends PublicBenefit {
  redemption: { code: string; redeemed: boolean } | null;
}

interface PersonalSpace {
  customer: { name: string };
  visits: { total: number; lastAt: string | null };
  benefit: PersonalBenefit | null;
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
    const data = (await res
      .json()
      .catch(() => null)) as Record<string, unknown> | null;
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
        setCheckinStatus(
          (result.data.status as CheckinStatus) ?? "checked_in",
        );
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
  const brand = brandOf(landing);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRaffle = landing.benefit?.type === "raffle";
  const title = landing.benefitText ?? `Sumate a ${landing.business.businessName}`;
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

  const currentYear = new Date().getFullYear();
  const yearRange: number[] = [];
  for (let y = currentYear - 10; y >= currentYear - 100; y--) yearRange.push(y);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const birthdate =
      birthDay && birthMonth && birthYear
        ? (buildBirthdateIso(birthDay, birthMonth, birthYear) ?? undefined)
        : undefined;

    const result = await postJson(`/api/checkin/${token}/register`, {
      name: name.trim(),
      phone,
      ...(birthdate ? { birthdate } : {}),
    });
    setSaving(false);

    if (result.ok && result.data?.status === "registered") {
      onRegistered(result.data.personal as PersonalSpace);
      return;
    }
    if (result.ok && result.data?.status === "exists") {
      onExists(phone);
      return;
    }
    setError(
      (result.data?.message as string) ??
        "No pudimos registrarte. Probá de nuevo.",
    );
  }

  return (
    <Shell landing={landing}>
      <h1 className="text-center text-2xl font-bold leading-tight text-[#101828]">
        {title}
      </h1>
      <p className="mt-3 text-center text-sm text-[#475467]">{subtitle}</p>

      {landing.benefit &&
        (landing.benefit.description || landing.benefit.terms) && (
          <div className="mt-5 w-full max-w-sm rounded-2xl border border-[#e4e7ec] bg-white p-4 text-left shadow-sm">
            {landing.benefit.description && (
              <p className="text-sm text-[#344054]">
                {landing.benefit.description}
              </p>
            )}
            {landing.benefit.terms && (
              <p className="mt-2 text-xs leading-relaxed text-[#667085]">
                <span className="font-semibold">Condiciones:</span>{" "}
                {landing.benefit.terms}
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
            onChange={(e) =>
              setPhone(e.target.value.replace(/\D/g, "").replace(/^0+/, ""))
            }
            placeholder="91624988"
            maxLength={9}
            required
            className="w-full bg-transparent py-4 pl-3 pr-4 text-sm text-[#101828] placeholder:text-[#9ca3af] focus:outline-none"
          />
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-[#475467]">
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
          className="w-full rounded-2xl py-4 text-sm font-bold text-white transition-opacity disabled:opacity-60"
          style={{ backgroundColor: brand }}
        >
          {saving ? "Registrando…" : btnLabel}
        </button>
      </form>

      <button
        type="button"
        onClick={() => onRecoverInstead(phone)}
        className="mt-5 text-xs font-medium text-[#667085] underline underline-offset-2"
      >
        Ya soy cliente
      </button>
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
  const brand = brandOf(landing);
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
    <Shell landing={landing}>
      <h1 className="text-center text-2xl font-bold leading-tight text-[#101828]">
        Recuperá tu perfil
      </h1>
      <p className="mt-3 max-w-sm text-center text-sm text-[#475467]">
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
                  setPhone(
                    e.target.value.replace(/\D/g, "").replace(/^0+/, ""),
                  )
                }
                placeholder="91624988"
                maxLength={9}
                className="w-full bg-transparent py-4 pl-3 pr-4 text-sm text-[#101828] placeholder:text-[#9ca3af] focus:outline-none"
              />
            </div>
            <button
              type="button"
              disabled={busy || phone.length < 8}
              onClick={() => void sendCode(phone)}
              className="w-full rounded-2xl py-4 text-sm font-bold text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: brand }}
            >
              {busy ? "Enviando…" : "Enviar código"}
            </button>
          </>
        ) : (
          <>
            <input
              type="tel"
              inputMode="numeric"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="000000"
              maxLength={6}
              className="w-full rounded-2xl border border-[#d0d5dd] bg-white px-4 py-4 text-center text-lg font-semibold tracking-[0.3em] text-[#101828] placeholder:tracking-[0.3em] placeholder:text-[#cbd5e1] focus:border-[#5C6BC0] focus:outline-none focus:ring-1 focus:ring-[#5C6BC0]"
            />
            <button
              type="button"
              disabled={busy || code.length !== 6}
              onClick={() => void verify()}
              className="w-full rounded-2xl py-4 text-sm font-bold text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: brand }}
            >
              {busy ? "Verificando…" : "Confirmar"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void sendCode(phone)}
              className="w-full text-xs font-medium text-[#667085] underline underline-offset-2"
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
        className="mt-5 text-xs font-medium text-[#667085] underline underline-offset-2"
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

  useEffect(() => {
    return () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, []);

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
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/72">
          Beneficio desbloqueado
        </div>
        <p className="mt-1 text-[10px] text-white/58">
          Mostrá este código en el local
        </p>
        <p className="mt-2 font-mono text-[26px] font-bold tracking-[0.2em] text-white">
          {code}
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
          <span className="text-[11px] font-bold uppercase tracking-[0.12em]">
            Precinto abierto
          </span>
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
  const brand = brandOf(landing);
  const promptShown = useRef(false);
  const benefitViewed = useRef(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const showReview =
    personal.reviewPrompt.show && Boolean(personal.reviewPrompt.googleUrl);

  useEffect(() => {
    if (showReview && !promptShown.current) {
      promptShown.current = true;
      void postJson(`/api/checkin/${token}/event`, {
        type: "review_prompt_shown",
      });
    }
  }, [showReview, token]);

  function onReviewClick() {
    void postJson(`/api/checkin/${token}/event`, {
      type: "review_link_clicked",
    });
    if (personal.reviewPrompt.googleUrl) {
      window.open(
        personal.reviewPrompt.googleUrl,
        "_blank",
        "noopener,noreferrer",
      );
    }
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

  const firstName = personal.customer.name.split(" ")[0] || personal.customer.name;

  return (
    <Shell landing={landing}>
      <div className="flex w-full max-w-md flex-col items-center">
        <div
          className="checkin-success-pop checkin-success-halo relative mb-4 flex h-14 w-14 items-center justify-center rounded-full"
          style={{
            backgroundColor: colorWithAlpha(
              brand,
              "18",
              "rgba(92,107,192,0.1)",
            ),
          }}
        >
          <CheckCircle2
            className="relative h-8 w-8"
            style={{ color: brand }}
          />
        </div>
        <p className="checkin-enter mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#8A91A3]">
          Visita registrada
        </p>
        <h1 className="checkin-enter text-center text-[28px] font-bold tracking-[-0.035em] text-[#171A2B]">
          Hola, {firstName}
        </h1>
        <p className="checkin-enter mt-1.5 flex items-center gap-1.5 text-center text-sm font-semibold text-[#15966D]">
          <Check className="h-4 w-4" aria-hidden="true" />
          {checkinStatus === "duplicate"
            ? "Tu check-in de hoy ya fue registrado"
            : "Check-in realizado"}
        </p>

        <div className="mt-7 grid w-full grid-cols-1 gap-4">
          <div className="checkin-enter checkin-hover-lift relative overflow-hidden rounded-[22px] border border-white/80 bg-white/72 px-5 py-4 shadow-[0_14px_36px_rgba(31,35,58,0.09)] backdrop-blur-md">
            <span
              aria-hidden="true"
              className="absolute -right-8 -top-10 h-28 w-28 rounded-full opacity-10 blur-xl"
              style={{ backgroundColor: brand }}
            />
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
                  <p className="text-sm font-bold text-[#24283A]">Tus visitas</p>
                  <p className="mt-0.5 text-xs text-[#8A91A3]">
                    Cada visita cuenta
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

          {personal.benefit && (
            <div
              className="checkin-enter-delay checkin-benefit-shine relative overflow-hidden rounded-[24px] p-5 text-left text-white shadow-[0_18px_42px_rgba(31,35,58,0.2)]"
              style={{
                background: `linear-gradient(135deg, #343B68 0%, ${brand} 100%)`,
              }}
            >
              <span
                aria-hidden="true"
                className="absolute -right-14 -top-16 h-44 w-44 rounded-full bg-white/14 blur-2xl"
              />
              <span
                aria-hidden="true"
                className="absolute -bottom-20 -left-12 h-40 w-40 rounded-full bg-black/12 blur-2xl"
              />
              <div className="relative flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-white/22 bg-white/14 backdrop-blur-sm">
                  <BenefitIcon type={personal.benefit.type} />
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/68">
                    Tu beneficio
                  </p>
                  <p className="mt-1 text-lg font-bold leading-tight text-white">
                    {personal.benefit.title}
                  </p>
                </div>
              </div>
              {personal.benefit.description && (
                <p className="relative mt-3 text-sm leading-5 text-white/78">
                  {personal.benefit.description}
                </p>
              )}
              {personal.benefit.terms && (
                <p className="relative mt-2 text-[11px] leading-relaxed text-white/58">
                  <span className="font-bold text-white/72">Condiciones:</span>{" "}
                  {personal.benefit.terms}
                </p>
              )}

              {personal.benefit.redemption &&
                (personal.benefit.redemption.redeemed ? (
                  <div className="relative mt-4 flex items-center gap-2 rounded-[15px] border border-white/18 bg-white/14 px-3.5 py-3 text-xs font-bold text-white/82">
                    <CheckCircle2 className="h-4 w-4" /> Ya disfrutaste este beneficio
                  </div>
                ) : (
                  <div className="relative mt-5">
                    <SlideToReveal
                      code={personal.benefit.redemption.code}
                      brand={brand}
                      onReveal={onBenefitReveal}
                    />
                    <p className="mt-2 text-center text-[10px] text-white/50">
                      El personal confirma el canje en el local
                    </p>
                  </div>
                ))}

              {!personal.benefit.redemption &&
                personal.benefit.type === "raffle" && (
                  <div className="relative mt-4 flex items-center gap-2 rounded-[15px] border border-white/18 bg-white/14 px-3.5 py-3 text-xs font-bold text-white/86">
                    <Ticket className="h-4 w-4" aria-hidden="true" />
                    Ya estás participando. ¡Mucha suerte!
                  </div>
                )}
            </div>
          )}
        </div>

        {showReview && (
          <button
            type="button"
            onClick={onReviewClick}
            className="group checkin-enter-delay mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[18px] py-4 text-sm font-bold text-white shadow-[0_12px_28px_rgba(31,35,58,0.16)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(31,35,58,0.22)]"
            style={{ backgroundColor: brand }}
          >
            <Star className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
            Contá tu experiencia en Google
          </button>
        )}

        <button
          type="button"
          onClick={() => void switchAccount()}
          disabled={loggingOut}
          className="mt-4 rounded-full px-4 py-2 text-xs font-semibold text-[#697084] transition-colors hover:bg-white/65 hover:text-[#34394D] disabled:opacity-60"
        >
          {loggingOut ? "Cerrando…" : "Cambiar de cuenta"}
        </button>
      </div>
    </Shell>
  );
}

// ── Layout primitives ────────────────────────────────────────────────────────

function Shell({
  landing,
  children,
}: {
  landing: CheckinLanding;
  children: React.ReactNode;
}) {
  const brand = brandOf(landing);

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden bg-[#F5F6FB]"
      style={{
        backgroundImage: `radial-gradient(circle at 8% 2%, ${colorWithAlpha(brand, "28", "rgba(92,107,192,0.16)")} 0, transparent 34%), radial-gradient(circle at 94% 78%, rgba(255,171,118,0.2) 0, transparent 31%), linear-gradient(160deg, #FAFBFF 0%, #F3F4FA 58%, #F8F4F2 100%)`,
      }}
    >
      <div
        aria-hidden="true"
        className="checkin-backdrop-grid pointer-events-none absolute inset-0"
        style={{ color: brand }}
      />
      <div
        aria-hidden="true"
        className="checkin-starfall pointer-events-none absolute inset-0 overflow-hidden"
        style={{ color: brand }}
      >
        {[
          { left: "6%", size: 10, duration: 18, delay: -3 },
          { left: "15%", size: 8, duration: 22, delay: -16 },
          { left: "24%", size: 14, duration: 26, delay: -8 },
          { left: "34%", size: 9, duration: 20, delay: -18 },
          { left: "44%", size: 11, duration: 24, delay: -12 },
          { left: "55%", size: 8, duration: 19, delay: -5 },
          { left: "64%", size: 15, duration: 27, delay: -21 },
          { left: "73%", size: 9, duration: 21, delay: -10 },
          { left: "82%", size: 12, duration: 25, delay: -24 },
          { left: "91%", size: 8, duration: 18, delay: -7 },
          { left: "29%", size: 10, duration: 23, delay: -14 },
          { left: "68%", size: 13, duration: 28, delay: -1 },
        ].map((star, index) => (
          <Star
            key={`${star.left}-${index}`}
            className="checkin-falling-star absolute fill-current"
            style={{
              left: star.left,
              top: "-6vh",
              width: star.size,
              height: star.size,
              opacity: 0,
              animation: `checkin-starfall ${star.duration}s ${star.delay}s linear infinite`,
              filter: "drop-shadow(0 0 5px currentColor)",
              willChange: "transform, opacity",
            }}
          />
        ))}
      </div>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 430 900"
        preserveAspectRatio="none"
      >
        <path
          d="M-52 176C45 98 109 116 180 175C256 238 330 228 482 124"
          fill="none"
          stroke={brand}
          strokeOpacity="0.09"
          strokeWidth="1.2"
        />
        <path
          d="M-40 194C44 130 107 140 174 194C255 259 350 241 473 151"
          fill="none"
          stroke={brand}
          strokeOpacity="0.055"
          strokeWidth="1"
        />
        <path
          d="M-70 724C50 651 126 667 205 734C278 795 357 794 486 699"
          fill="none"
          stroke="#FF9A4D"
          strokeOpacity="0.08"
          strokeWidth="1.2"
        />
      </svg>
      <div
        aria-hidden="true"
        className="checkin-orbit checkin-ambient-delayed pointer-events-none absolute -right-24 top-14 h-64 w-64 rounded-full"
        style={{ color: brand }}
      >
        <span className="absolute left-6 top-1/2 h-2 w-2 rounded-full bg-current shadow-[0_0_16px_currentColor]" />
      </div>
      <div
        aria-hidden="true"
        className="checkin-orbit checkin-orbit-small checkin-ambient pointer-events-none absolute -bottom-20 -left-20 h-52 w-52 rounded-full text-[#FF9A4D]"
      >
        <span className="absolute right-8 top-5 h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_14px_currentColor]" />
      </div>
      <div
        aria-hidden="true"
        className="checkin-ambient pointer-events-none absolute -left-24 top-[38%] h-64 w-64 rounded-full border border-white/60 bg-white/18 blur-sm"
      />
      <div
        aria-hidden="true"
        className="checkin-ambient-delayed pointer-events-none absolute -right-20 top-20 h-48 w-48 rounded-full border border-white/50 bg-white/14"
      />
      <div className="relative flex flex-1 flex-col items-center justify-center px-5 py-10 sm:px-6 sm:py-12">
        {landing.business.logoUrl && (
          <div className="checkin-logo-float relative mb-6">
            <span
              aria-hidden="true"
              className="absolute inset-1 rounded-full opacity-25 blur-xl"
              style={{ backgroundColor: brand }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={landing.business.logoUrl}
              alt={landing.business.businessName}
              className="relative h-16 w-16 rounded-full object-contain drop-shadow-[0_10px_18px_rgba(31,35,58,0.13)]"
            />
          </div>
        )}
        {children}
      </div>
      <p className="relative pb-5 text-center text-xs text-[#9ca3af]">
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
