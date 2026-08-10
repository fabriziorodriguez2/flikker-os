"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, Loader2, MapPin, Sparkles } from "lucide-react";
import { useLogoPalette } from "@/lib/use-logo-palette";
import PhoneInput, { isValidNationalPhone } from "@/components/ui/phone-input";

interface MyFlikkerPlace {
  businessId: string;
  businessName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  visitsTotal: number;
  lastVisitAt: string | null;
  rewardGoal: {
    incentiveName: string;
    progressVisits: number;
    targetAdditionalVisits: number;
    remainingVisits: number;
  } | null;
  benefitAvailable: { name: string; code: string; expiresAt: string | null } | null;
}

function MiFlikkerTitle() {
  return (
    <h1 className="flex items-center justify-center gap-2.5" aria-label="Mi Flikker">
      <span className="font-display text-[24px] font-bold tracking-[-0.04em] text-[#171A2B]">
        MI
      </span>
      <Image
        src="/flikker-wordmark.svg"
        alt="Flikker"
        width={920}
        height={290}
        className="h-[27px] w-auto"
      />
    </h1>
  );
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data: data as Record<string, unknown> };
}

export default function MiFlikkerClient({ hasSession }: { hasSession: boolean }) {
  const [status, setStatus] = useState<"loading" | "verify" | "places">(
    hasSession ? "loading" : "verify",
  );
  const [places, setPlaces] = useState<MyFlikkerPlace[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSession) return;
    void load();
  }, [hasSession]);

  async function load() {
    setStatus("loading");
    try {
      const res = await fetch("/api/mi-flikker/places");
      if (res.status === 401) {
        setStatus("verify");
        return;
      }
      if (!res.ok) throw new Error();
      setPlaces((await res.json()) as MyFlikkerPlace[]);
      setStatus("places");
    } catch {
      setLoadError("No pudimos cargar tus lugares. Probá de nuevo.");
      setStatus("places");
    }
  }

  if (status === "verify") {
    return <VerifyScreen onVerified={load} />;
  }

  if (status === "loading") {
    return (
      <Shell>
        <div className="flex h-40 items-center justify-center text-[#8A91A3]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Cargando…
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <MiFlikkerTitle />
      <p className="mt-1 text-center text-sm text-[#8A91A3]">
        Todas tus recompensas Flikker en un solo lugar.
      </p>

      {loadError ? (
        <p className="mt-6 text-center text-sm text-[#C0392B]">{loadError}</p>
      ) : places.length === 0 ? (
        <p className="mt-6 text-center text-sm text-[#8A91A3]">
          Todavía no tenés lugares. Escaneá el QR o NFC de un negocio Flikker
          para empezar.
        </p>
      ) : (
        <div className="mi-wallet mt-7 w-full pb-16">
          {places.map((place, index) => (
            <PlaceCard key={place.businessId} place={place} index={index} />
          ))}
        </div>
      )}
    </Shell>
  );
}

function PlaceCard({ place, index }: { place: MyFlikkerPlace; index: number }) {
  const palette = useLogoPalette(place.businessId, place.logoUrl, place.primaryColor);
  return (
    <Link
      href={`/mi-flikker/${place.businessId}`}
      className="mi-coupon mi-wallet-card sticky block min-h-[148px] overflow-hidden rounded-[24px] p-5 text-white shadow-[0_8px_18px_rgba(20,24,40,0.14)] transition-transform duration-300 hover:-translate-y-1 focus-visible:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      style={{
        top: 88 + Math.min(index, 8) * 10,
        zIndex: index + 1,
        background: `linear-gradient(135deg, ${palette.primary} 0%, ${palette.secondary} 115%)`,
      }}
    >
      {place.logoUrl ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-[35%] rotate-45 opacity-[0.065] mix-blend-screen"
          style={{
            backgroundImage: `url("/api/mi-flikker/places/${encodeURIComponent(place.businessId)}/logo")`,
            backgroundPosition: "14px 12px",
            backgroundRepeat: "repeat",
            backgroundSize: "64px 64px",
            filter: "grayscale(1) contrast(0.8)",
          }}
        />
      ) : null}
      <div className="relative flex items-center gap-3.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[15px] border border-white/35 bg-white/18 backdrop-blur-sm">
          {place.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={place.logoUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <MapPin className="h-5 w-5" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-bold tracking-[-0.02em]">
            {place.businessName}
          </p>
          <p className="mt-0.5 text-[13px] font-medium text-white/70">
            {place.visitsTotal} {place.visitsTotal === 1 ? "visita" : "visitas"}
          </p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-white/70" />
      </div>

      <div className="relative mt-4 pt-3">
        {place.benefitAvailable ? (
          <p className="flex items-center gap-2 text-[14px] font-semibold">
            <Sparkles className="h-4 w-4 text-[#FFE08A]" aria-hidden="true" />
            <span className="truncate">Tenés disponible: {place.benefitAvailable.name}</span>
          </p>
        ) : place.rewardGoal ? (
          <div>
            <div className="flex items-center justify-between gap-3 text-[13px] font-semibold">
              <span className="truncate">Próximo premio: {place.rewardGoal.incentiveName}</span>
              <span className="shrink-0 text-white/75">
                {place.rewardGoal.progressVisits}/{place.rewardGoal.targetAdditionalVisits}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white/85"
                style={{
                  width: `${Math.min(100, (place.rewardGoal.progressVisits / Math.max(1, place.rewardGoal.targetAdditionalVisits)) * 100)}%`,
                }}
              />
            </div>
          </div>
        ) : (
          <p className="text-[13px] font-medium text-white/65">Todavía no hay un premio activo</p>
        )}
      </div>
    </Link>
  );
}

function VerifyScreen({ onVerified }: { onVerified: () => void }) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    // Piloto V2 (#7) — el backend ya normaliza y valida el E.164 real, pero
    // no vale la pena gastar un OTP en un número con formato inválido.
    if (!isValidNationalPhone(phone)) {
      setError("Ingresá un número válido (7 a 9 dígitos).");
      return;
    }
    setSending(true);
    setError(null);
    const { ok } = await postJson("/api/mi-flikker/verify/start", { phone });
    setSending(false);
    if (ok) setStep("code");
    else setError("No pudimos enviar el código. Revisá el número.");
  }

  async function confirmCode() {
    setSending(true);
    setError(null);
    const { ok, data } = await postJson("/api/mi-flikker/verify/confirm", { phone, code });
    setSending(false);
    if (ok) onVerified();
    else setError((data.message as string) ?? "Código inválido.");
  }

  return (
    <Shell>
      <MiFlikkerTitle />
      <p className="mt-1 text-center text-sm text-[#8A91A3]">
        Ingresá tu WhatsApp para ver tus recompensas en todos los negocios
        Flikker.
      </p>

      <div className="mt-6 w-full space-y-3">
        {step === "phone" ? (
          <>
            <PhoneInput
              value={phone}
              onChange={setPhone}
              placeholder="91 624 988"
              className="rounded-[14px] [&>div]:rounded-[14px] [&>div]:border-white/80 [&>div]:bg-white/80"
            />
            <button
              type="button"
              disabled={sending || !isValidNationalPhone(phone)}
              onClick={() => void sendCode()}
              className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#5C6BC0] py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Enviar código
            </button>
          </>
        ) : (
          <>
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="Código de 6 dígitos"
              className="w-full rounded-[14px] border border-white/80 bg-white/80 px-4 py-3 text-center text-lg tracking-[0.3em] outline-none focus:border-[#5C6BC0]"
            />
            <button
              type="button"
              disabled={sending || code.length !== 6}
              onClick={() => void confirmCode()}
              className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#5C6BC0] py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirmar
            </button>
            <button
              type="button"
              onClick={() => setStep("phone")}
              className="w-full text-center text-xs font-semibold text-[#697084]"
            >
              Cambiar número
            </button>
          </>
        )}
        {error ? <p className="text-center text-sm text-[#C0392B]">{error}</p> : null}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-[#F5F6FB] px-5 py-10">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
