"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, Loader2, MapPin, Sparkles } from "lucide-react";

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
        <div className="mt-6 w-full space-y-3">
          {places.map((place) => (
            <PlaceCard key={place.businessId} place={place} />
          ))}
        </div>
      )}
    </Shell>
  );
}

function PlaceCard({ place }: { place: MyFlikkerPlace }) {
  const brand = place.primaryColor ?? "#5C6BC0";
  return (
    <Link
      href={`/mi-flikker/${place.businessId}`}
      className="flex items-center gap-3 rounded-[18px] border border-white/80 bg-white/72 px-4 py-3.5 shadow-[0_10px_28px_rgba(31,35,58,0.08)] backdrop-blur-md transition-transform hover:-translate-y-0.5"
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px]"
        style={{ backgroundColor: `${brand}18`, color: brand }}
      >
        <MapPin className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-[#24283A]">{place.businessName}</p>
        <p className="mt-0.5 text-xs text-[#8A91A3]">
          {place.visitsTotal} {place.visitsTotal === 1 ? "visita" : "visitas"}
        </p>
        {place.benefitAvailable ? (
          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-[#15966D]">
            <Sparkles className="h-3.5 w-3.5" /> Recompensa disponible: {place.benefitAvailable.name}
          </p>
        ) : place.rewardGoal ? (
          <p className="mt-1 text-xs font-semibold" style={{ color: brand }}>
            Te falta{place.rewardGoal.remainingVisits === 1 ? "" : "n"}{" "}
            {place.rewardGoal.remainingVisits} visita
            {place.rewardGoal.remainingVisits === 1 ? "" : "s"}
          </p>
        ) : (
          <p className="mt-1 text-xs text-[#8A91A3]">Sin recompensa activa</p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-[#B7BCCB]" />
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
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Tu número de WhatsApp"
              className="w-full rounded-[14px] border border-white/80 bg-white/80 px-4 py-3 text-sm outline-none focus:border-[#5C6BC0]"
            />
            <button
              type="button"
              disabled={sending || phone.trim().length < 6}
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
