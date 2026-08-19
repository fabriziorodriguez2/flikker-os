"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ArrowLeft, Gift, Loader2 } from "lucide-react";
import { useLogoPalette } from "@/lib/use-logo-palette";
import LoyaltyCard from "@/components/public/loyalty-card";

interface MyFlikkerPlace {
  businessId: string;
  businessName: string;
  logoUrl: string | null;
  /** Apariencia de la tarjeta. Null = usar la marca del negocio. */
  loyaltyCardColor?: string | null;
  loyaltyCardTextColor?: string | null;
  loyaltyCardBackgroundImage?: string | null;
  loyaltyStampAreaColor?: string | null;
  loyaltyStampColor?: string | null;
  loyaltyStampIcon?: string | null;
  loyaltyShowBusinessName?: boolean;
  primaryColor: string | null;
  visitsTotal: number;
  lastVisitAt: string | null;
  rewardGoal: {
    incentiveName: string;
    progressVisits: number;
    visitProgress?: number;
    bonusStamps?: number;
    targetAdditionalVisits: number;
    remainingVisits: number;
  } | null;
  benefitAvailable: {
    name: string;
    code: string;
    expiresAt: string | null;
  } | null;
}

/**
 * Fase E §20: only customer-facing fields — name/logo, visits, last visit,
 * current goal/progress, unlocked benefit. Never segment, assignment,
 * experiment or uplift; those never leave the business dashboard.
 */
export default function PlaceDetailClient({
  businessId,
}: {
  businessId: string;
}) {
  const [place, setPlace] = useState<MyFlikkerPlace | null>(null);
  const [status, setStatus] = useState<
    "loading" | "ok" | "error" | "unauthorized"
  >("loading");
  const palette = useLogoPalette(
    place?.businessId ?? businessId,
    place?.logoUrl ?? null,
    place?.primaryColor ?? null,
  );

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  async function load() {
    setStatus("loading");
    const res = await fetch(`/api/mi-flikker/places/${businessId}`);
    if (res.status === 401) {
      setStatus("unauthorized");
      return;
    }
    if (!res.ok) {
      setStatus("error");
      return;
    }
    setPlace((await res.json()) as MyFlikkerPlace);
    setStatus("ok");
  }

  if (status === "unauthorized") {
    return (
      <Shell>
        <p className="text-center text-sm text-[#8A91A3]">
          Tu sesión venció.{" "}
          <Link href="/mi-flikker" className="font-semibold text-[#5C6BC0]">
            Volvé a ingresar
          </Link>
          .
        </p>
      </Shell>
    );
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

  if (status === "error" || !place) {
    return (
      <Shell>
        <p className="text-center text-sm text-[#C0392B]">
          No pudimos cargar este lugar.
        </p>
      </Shell>
    );
  }

  const brand = palette.primary;

  return (
    <Shell brand={brand}>
      <Link
        href="/mi-flikker"
        className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-2 text-xs font-semibold text-[#5F6375] shadow-sm transition-colors hover:bg-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Mis lugares
      </Link>

      {place.rewardGoal ? (
        <LoyaltyCard
          rewardName={place.rewardGoal.incentiveName}
          progress={place.rewardGoal.progressVisits}
          target={place.rewardGoal.targetAdditionalVisits}
          bonusStamps={place.rewardGoal.bonusStamps ?? 0}
          qrValue={`/mi-flikker/${place.businessId}`}
          appearance={{
            cardColor: place.loyaltyCardColor ?? brand,
            textColor: place.loyaltyCardTextColor,
            backgroundImage: place.loyaltyCardBackgroundImage,
            stampAreaColor: place.loyaltyStampAreaColor,
            stampColor: place.loyaltyStampColor,
            stampIcon: place.loyaltyStampIcon,
            logoUrl: place.logoUrl,
            businessName: place.businessName,
            showBusinessName: place.loyaltyShowBusinessName,
          }}
        />
      ) : null}

      {place.benefitAvailable ? (
        <GiftReveal benefit={place.benefitAvailable} brand={brand} />
      ) : !place.rewardGoal ? (
        <section className="mt-5 rounded-[28px] bg-white/80 p-6 shadow-[0_16px_38px_rgba(31,35,58,0.1)] backdrop-blur-xl">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-full"
            style={{
              backgroundColor: `color-mix(in srgb, ${brand} 12%, white)`,
              color: brand,
            }}
          >
            <Gift className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-xl font-bold text-[#202333]">
            Próximo premio en camino
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#7B8295]">
            Todavía no hay una recompensa activa. Escaneá el QR en tu próxima
            visita para descubrir novedades.
          </p>
        </section>
      ) : null}
    </Shell>
  );
}

function GiftReveal({
  benefit,
  brand,
}: {
  benefit: NonNullable<MyFlikkerPlace["benefitAvailable"]>;
  brand: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!revealed) return;

    let cancelled = false;
    const redeemUrl = `${window.location.origin}/redeem/${benefit.code}`;
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
  }, [benefit.code, revealed]);

  if (!revealed) {
    return (
      <div className="mt-7 flex justify-center">
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="group flex h-24 w-24 items-center justify-center rounded-[28px] text-white shadow-[0_16px_34px_rgba(31,35,58,0.2)] transition-transform hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white focus-visible:ring-offset-2 active:scale-95"
          style={{
            background: `linear-gradient(145deg, ${brand}, color-mix(in srgb, ${brand} 70%, black))`,
          }}
          aria-label="Abrir regalo y mostrar el código de canje"
        >
          <Gift
            className="h-11 w-11 transition-transform group-hover:rotate-6"
            strokeWidth={1.8}
            aria-hidden="true"
          />
        </button>
      </div>
    );
  }

  return (
    <section className="mt-5 overflow-hidden rounded-[28px] bg-white/90 p-6 shadow-[0_16px_38px_rgba(31,35,58,0.1)] backdrop-blur-xl">
      <div className="text-center">
        <span
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-[16px] text-white"
          style={{ backgroundColor: brand }}
        >
          <Gift className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-[#8A91A3]">
          Tu regalo
        </p>
        <h2 className="mt-1 text-[24px] font-bold leading-tight tracking-[-0.03em] text-[#171A2B]">
          {benefit.name}
        </h2>
      </div>

      <div className="mt-5 flex min-h-[220px] items-center justify-center">
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrDataUrl}
            alt={`QR para canjear ${benefit.name}`}
            className="h-[220px] w-[220px] rounded-[18px] bg-white p-2"
          />
        ) : (
          <Loader2
            className="h-7 w-7 animate-spin text-[#8A91A3]"
            aria-label="Generando QR"
          />
        )}
      </div>

      <p className="mt-4 text-center text-xs font-semibold uppercase tracking-[0.12em] text-[#8A91A3]">
        Código de canje
      </p>
      <p className="mt-2 rounded-[16px] border border-dashed border-[#D8DBE7] bg-[#F7F7FB] px-4 py-4 text-center font-mono text-[26px] font-bold tracking-[0.18em] text-[#24283A]">
        {benefit.code}
      </p>
      {benefit.expiresAt ? (
        <p className="mt-2 text-center text-xs text-[#8A91A3]">
          Válido hasta {new Date(benefit.expiresAt).toLocaleDateString("es-UY")}
        </p>
      ) : null}
      <p className="mt-4 text-center text-sm font-medium text-[#697084]">
        Mostrá el QR o el código al personal para disfrutar tu regalo.
      </p>
    </section>
  );
}

function Shell({
  children,
  brand = "#5C6BC0",
}: {
  children: React.ReactNode;
  brand?: string;
}) {
  return (
    <div
      className="flex min-h-screen flex-col items-center bg-[#F5F6FB] px-5 py-8"
      style={{
        backgroundImage: `radial-gradient(circle at 90% 0%, color-mix(in srgb, ${brand} 20%, transparent), transparent 38%), linear-gradient(160deg, #FAFAFE 0%, #F1F2F8 100%)`,
      }}
    >
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
