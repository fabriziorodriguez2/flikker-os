"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import PoweredByFlikker from "@/components/ui/powered-by-flikker";
import type { QrInfo } from "./page";

async function captureContact(
  businessId: string,
  name: string,
  phone: string,
  birthdate?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/qr/${encodeURIComponent(businessId)}/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        phone,
        ...(birthdate ? { birthdate } : {}),
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: false, error: data.message ?? "Error al registrar" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Error de conexión" };
  }
}

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
  // Build YYYY-MM-DD. Validate that day fits the month (e.g. no Feb 30).
  const isoCandidate = `${y.toString().padStart(4, "0")}-${m
    .toString()
    .padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
  const parsed = new Date(`${isoCandidate}T00:00:00`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== y ||
    parsed.getUTCMonth() + 1 !== m ||
    parsed.getUTCDate() !== d
  ) {
    return null;
  }
  return isoCandidate;
}

function CaptureForm({
  info,
  businessId,
  onSuccess,
}: {
  info: QrInfo;
  businessId: string;
  onSuccess: () => void;
}) {
  const brand = info.primaryColor ?? "#5C6BC0";
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = info.benefitText
    ? info.benefitText
    : `Recibí descuentos y novedades de ${info.businessName}`;

  const subtitle = info.benefitText
    ? "Dejanos tu nombre y número y te lo enviamos por WhatsApp."
    : "Dejanos tu nombre y número y te avisamos cuando haya algo para vos.";

  const btnLabel = info.benefitText ? "Quiero mi beneficio" : "Anotarme";

  const currentYear = new Date().getFullYear();
  const yearRange: number[] = [];
  for (let y = currentYear - 10; y >= currentYear - 100; y--) {
    yearRange.push(y);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    // Build birthdate only when all three selects are filled. Partial values
    // are silently dropped (field is optional, no validation noise).
    const birthdate =
      birthDay && birthMonth && birthYear
        ? (buildBirthdateIso(birthDay, birthMonth, birthYear) ?? undefined)
        : undefined;
    const result = await captureContact(
      businessId,
      name.trim(),
      phone,
      birthdate,
    );
    if (result.ok) {
      onSuccess();
    } else {
      setError(result.error ?? "Error al registrar");
    }
    setSaving(false);
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f8fafc]">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        {info.logoUrl && (
          <img
            src={info.logoUrl}
            alt={info.businessName}
            className="mb-5 h-16 w-16 rounded-2xl object-contain shadow"
          />
        )}

        <h1 className="text-center text-2xl font-bold leading-tight text-[#101828]">
          {title}
        </h1>
        <p className="mt-3 text-center text-sm text-[#475467]">{subtitle}</p>

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
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              placeholder="091624988"
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
      </div>

      <p className="pb-5 text-center text-xs text-[#9ca3af]">
        <PoweredByFlikker />
      </p>
    </div>
  );
}

function ConfirmationScreen({
  info,
  businessId,
}: {
  info: QrInfo;
  businessId: string;
}) {
  const brand = info.primaryColor ?? "#5C6BC0";
  const showReviewBtn = true;

  return (
    <div className="flex min-h-screen flex-col bg-[#f8fafc]">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm text-center">
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-4xl"
            style={{ backgroundColor: `${brand}22` }}
          >
            🎉
          </div>
          <h2 className="text-2xl font-bold text-[#101828]">¡Listo!</h2>
          <p className="mt-1 text-base text-[#475467]">Ya quedaste registrado.</p>

          <p className="mt-6 text-sm text-[#475467]">
            Si visitaste{" "}
            <span className="font-semibold text-[#101828]">{info.businessName}</span>,
            contanos cómo te fue. Una reseña ayuda mucho.
          </p>

          <div
            className={`mt-8 transition-all duration-700 ${
              showReviewBtn
                ? "translate-y-0 opacity-100"
                : "translate-y-4 opacity-0"
            }`}
          >
            {info.googleBusinessProfileUrl ? (
              <a
                href={`/qr/${encodeURIComponent(businessId)}/review`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#111827] py-4 text-sm font-bold text-white transition-opacity hover:opacity-90"
              >
                ¿Cómo fue tu experiencia?
                <ArrowRight className="h-4 w-4" />
              </a>
            ) : (
              <p className="text-sm text-[#475467]">
                ¡Gracias por registrarte! Hasta pronto.
              </p>
            )}
          </div>

          <footer className="mt-8 flex items-center justify-center text-xs text-[#9ca3af]">
            <PoweredByFlikker />
          </footer>
        </div>
      </div>
    </div>
  );
}

export default function QrLandingClient({
  businessId,
  info,
}: {
  businessId: string;
  info: QrInfo;
}) {
  const [confirmed, setConfirmed] = useState(false);

  if (confirmed)
    return <ConfirmationScreen info={info} businessId={businessId} />;

  return (
    <CaptureForm
      info={info}
      businessId={businessId}
      onSuccess={() => setConfirmed(true)}
    />
  );
}
