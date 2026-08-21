"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Gift, Loader2 } from "lucide-react";
import { useLogoPalette } from "@/lib/use-logo-palette";
import LoyaltyCard from "@/components/public/loyalty-card";
import RedemptionReveal from "@/components/public/redemption-reveal";

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
  loyaltyStampBackgroundPattern?: string | null;
  loyaltyStampBackgroundOpacity?: number | null;
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
  benefitAvailable: { name: string; code: string; expiresAt: string | null } | null;
  /**
   * Otros beneficios otorgados y sin canjear — típicamente por una
   * promoción manual (Notificaciones → Promociones ya puede elegir
   * cualquier Benefit del catálogo). Independiente de `benefitAvailable`
   * (esa es solo la recompensa de una tarjeta ya desbloqueada).
   */
  otherBenefits: {
    title: string;
    description: string | null;
    terms: string | null;
    code: string;
    expiresAt: string | null;
  }[];
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
            stampBackgroundPattern: place.loyaltyStampBackgroundPattern,
            stampBackgroundOpacity: place.loyaltyStampBackgroundOpacity,
          }}
        />
      ) : null}

      {place.benefitAvailable ? (
        <GiftReveal benefit={place.benefitAvailable} brand={brand} />
      ) : null}

      {/* Otros beneficios (ej. por promoción manual) — independientes de
          `benefitAvailable`, que es solo la recompensa de la tarjeta.
          Pueden coexistir con ella o aparecer solos. */}
      {place.otherBenefits.map((benefit, i) => (
        <GiftReveal
          key={`${benefit.title}-${i}`}
          benefit={{
            name: benefit.title,
            code: benefit.code,
            expiresAt: benefit.expiresAt,
          }}
          brand={brand}
        />
      ))}

      {!place.benefitAvailable && place.otherBenefits.length === 0 ? (
        place.rewardGoal ? (
          <p className="mt-4 text-center text-sm font-semibold text-[#697084]">
            Tu próximo regalo: {place.rewardGoal.incentiveName}
          </p>
        ) : (
          <section className="mt-5 rounded-[28px] bg-white/80 p-6 shadow-[0_16px_38px_rgba(31,35,58,0.1)] backdrop-blur-xl">
            <span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${brand} 12%, white)`, color: brand }}>
              <Gift className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-xl font-bold text-[#202333]">Próximo premio en camino</h2>
            <p className="mt-2 text-sm leading-6 text-[#7B8295]">
              Todavía no hay una recompensa activa. Escaneá el QR en tu próxima visita para descubrir novedades.
            </p>
          </section>
        )
      ) : null}
    </Shell>
  );
}

/**
 * Un beneficio disponible (bienvenida, reactivación, promo, o la recompensa
 * de una tarjeta de sellos que ya se completó) — nunca la tarjeta de sellos
 * en curso. Vive SIEMPRE dentro de esta misma card blanca/opaca, en los dos
 * estados (antes y después de revelar), para que jamás se lea como si
 * formara parte visualmente de la tarjeta de sellos incompleta que está
 * arriba: esa tarjeta (`RewardGoalStamps`, en el hero de más arriba) nunca
 * tiene QR, y este bloque nunca comparte fondo/color con ella.
 */
function GiftReveal({
  benefit,
  brand,
}: {
  benefit: NonNullable<MyFlikkerPlace["benefitAvailable"]>;
  brand: string;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <section className="mt-5 overflow-hidden rounded-[28px] bg-white/90 p-6 shadow-[0_16px_38px_rgba(31,35,58,0.1)] backdrop-blur-xl">
      <p className="text-center text-xs font-bold uppercase tracking-[0.12em] text-[#8A91A3]">
        Beneficio disponible
      </p>

      {!revealed ? (
        <div className="mt-4 flex flex-col items-center text-center">
          <span
            className="flex h-12 w-12 items-center justify-center rounded-[16px] text-white"
            style={{ backgroundColor: brand }}
          >
            <Gift className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-3 text-[22px] font-bold leading-tight tracking-[-0.03em] text-[#171A2B]">
            {benefit.name}
          </h2>
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="group mt-5 flex h-20 w-20 items-center justify-center rounded-[24px] text-white shadow-[0_16px_34px_rgba(31,35,58,0.2)] transition-transform hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white focus-visible:ring-offset-2 active:scale-95"
            style={{
              background: `linear-gradient(145deg, ${brand}, color-mix(in srgb, ${brand} 70%, black))`,
            }}
            aria-label={`Mostrar el código de canje de ${benefit.name}`}
          >
            <Gift
              className="h-9 w-9 transition-transform group-hover:rotate-6"
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </button>
          <p className="mt-3 text-xs text-[#8A91A3]">Tocá para ver tu código</p>
        </div>
      ) : (
        <div className="mt-4 text-center text-[#171A2B]">
          <h2 className="text-[24px] font-bold leading-tight tracking-[-0.03em]">
            {benefit.name}
          </h2>

          <div className="mt-5">
            <RedemptionReveal
              code={benefit.code}
              redeemPath={`/redeem/${benefit.code}`}
            />
          </div>

          {benefit.expiresAt ? (
            <p className="mt-2 text-center text-xs text-[#8A91A3]">
              Válido hasta{" "}
              {new Date(benefit.expiresAt).toLocaleDateString("es-UY")}
            </p>
          ) : null}
        </div>
      )}
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
