"use client";

import { useEffect, useState } from "react";
import type { QrInfo } from "./page";

async function captureContact(
  businessId: string,
  name: string,
  phone: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/qr/${encodeURIComponent(businessId)}/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone }),
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = info.benefitText
    ? info.benefitText
    : `Recibí descuentos y novedades de ${info.businessName}`;

  const subtitle = info.benefitText
    ? "Dejanos tu nombre y número y te lo enviamos por WhatsApp."
    : "Dejanos tu nombre y número y te avisamos cuando haya algo para vos.";

  const btnLabel = info.benefitText ? "Quiero mi beneficio" : "Anotarme";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const result = await captureContact(businessId, name.trim(), `+598${phone}`);
    if (result.ok) {
      onSuccess();
    } else {
      setError(result.error ?? "Error al registrar");
    }
    setSaving(false);
  }

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ backgroundColor: brand }}
    >
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        {info.logoUrl && (
          <img
            src={info.logoUrl}
            alt={info.businessName}
            className="mb-6 h-16 w-16 rounded-2xl object-contain shadow"
          />
        )}

        <h1 className="text-center text-2xl font-bold leading-tight text-white">
          {title}
        </h1>
        <p className="mt-3 text-center text-sm text-white/75">{subtitle}</p>

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
            className="w-full rounded-2xl border-2 border-white/30 bg-white/10 px-4 py-4 text-sm text-white placeholder:text-white/50 focus:border-white/60 focus:outline-none"
          />

          <div className="flex overflow-hidden rounded-2xl border-2 border-white/30 bg-white/10 focus-within:border-white/60">
            <span className="flex items-center bg-white/10 px-4 text-sm font-medium text-white/80">
              +598
            </span>
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              placeholder="09X XXX XXX"
              maxLength={9}
              required
              className="w-full bg-transparent py-4 pl-3 pr-4 text-sm text-white placeholder:text-white/50 focus:outline-none"
            />
          </div>

          {error && (
            <p className="rounded-xl bg-white/20 px-3 py-2 text-center text-xs text-white">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || !name.trim() || phone.length < 8}
            className="w-full rounded-2xl bg-white py-4 text-sm font-bold transition-opacity disabled:opacity-60"
            style={{ color: brand }}
          >
            {saving ? "Registrando…" : btnLabel}
          </button>
        </form>
      </div>

      <p className="pb-5 text-center text-xs text-white/40">Powered by Flikker</p>
    </div>
  );
}

function ConfirmationScreen({ info }: { info: QrInfo }) {
  const brand = info.primaryColor ?? "#5C6BC0";
  const [showReviewBtn, setShowReviewBtn] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowReviewBtn(true), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6 py-12"
      style={{ backgroundColor: brand }}
    >
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/20 text-4xl">
          🎉
        </div>
        <h2 className="text-2xl font-bold text-white">¡Listo!</h2>
        <p className="mt-1 text-base text-white/90">Ya quedaste registrado.</p>

        <p className="mt-6 text-sm text-white/75">
          Una última cosa — si alguna vez fuiste a{" "}
          <span className="font-semibold text-white">{info.businessName}</span>,
          tu opinión vale mucho para ellos.
        </p>

        <div
          className={`mt-8 transition-all duration-700 ${
            showReviewBtn ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
          }`}
        >
          {info.googleBusinessProfileUrl ? (
            <a
              href={info.googleBusinessProfileUrl}
              target="_blank"
              rel="noreferrer"
              className="block w-full rounded-2xl bg-white py-4 text-sm font-bold transition-opacity hover:opacity-90"
              style={{ color: brand }}
            >
              Dejar una reseña en Google →
            </a>
          ) : (
            <p className="text-sm text-white/60">
              ¡Gracias por registrarte! Hasta pronto.
            </p>
          )}
        </div>
      </div>

      <p className="mt-auto pt-10 text-xs text-white/40">Powered by Flikker</p>
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

  if (confirmed) return <ConfirmationScreen info={info} />;

  return (
    <CaptureForm
      info={info}
      businessId={businessId}
      onSuccess={() => setConfirmed(true)}
    />
  );
}
