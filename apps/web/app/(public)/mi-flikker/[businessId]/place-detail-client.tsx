"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, Footprints, Gift, Loader2, Sparkles } from "lucide-react";
import { useLogoPalette } from "@/lib/use-logo-palette";

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

/**
 * Fase E §20: only customer-facing fields — name/logo, visits, last visit,
 * current goal/progress, unlocked benefit. Never segment, assignment,
 * experiment or uplift; those never leave the business dashboard.
 */
export default function PlaceDetailClient({ businessId }: { businessId: string }) {
  const [place, setPlace] = useState<MyFlikkerPlace | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error" | "unauthorized">(
    "loading",
  );
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

      <section
        className="mi-coupon relative overflow-hidden rounded-[28px] p-6 text-white shadow-[0_20px_46px_rgba(31,27,58,0.22)]"
        style={{ background: `linear-gradient(140deg, ${brand} 0%, ${palette.secondary} 115%)` }}
      >
        <span aria-hidden="true" className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-white/12 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[20px] border border-white/35 bg-white/18 backdrop-blur-sm">
            {place.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={place.logoUrl} alt="" className="h-full w-full object-contain" />
            ) : (
              <Gift className="h-7 w-7" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white/70">Tu tarjeta en</p>
            <h1 className="mt-0.5 text-[26px] font-bold leading-tight tracking-[-0.035em]">
              {place.businessName}
            </h1>
          </div>
        </div>

        <div className="relative mt-6 grid grid-cols-2 gap-3 pt-5">
          <div className="rounded-[16px] bg-white/12 p-3.5 backdrop-blur-sm">
            <Footprints className="h-5 w-5 text-white/75" aria-hidden="true" />
            <p className="mt-2 text-[28px] font-bold leading-none">{place.visitsTotal}</p>
            <p className="mt-1 text-xs font-medium text-white/65">
              {place.visitsTotal === 1 ? "visita acumulada" : "visitas acumuladas"}
            </p>
          </div>
          <div className="rounded-[16px] bg-white/12 p-3.5 backdrop-blur-sm">
            <CalendarDays className="h-5 w-5 text-white/75" aria-hidden="true" />
            <p className="mt-2 text-base font-bold">
              {place.lastVisitAt
                ? new Date(place.lastVisitAt).toLocaleDateString("es-UY")
                : "—"}
            </p>
            <p className="mt-1 text-xs font-medium text-white/65">Última visita</p>
          </div>
        </div>
      </section>

      {place.benefitAvailable ? (
        <section className="mt-5 overflow-hidden rounded-[28px] bg-white/80 p-6 shadow-[0_16px_38px_rgba(31,35,58,0.1)] backdrop-blur-xl">
          <p className="flex items-center gap-2 text-sm font-bold" style={{ color: brand }}>
            <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${brand} 12%, white)` }}>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            Recompensa lista para usar
          </p>
          <p className="mt-4 text-[24px] font-bold leading-tight tracking-[-0.03em] text-[#171A2B]">
            {place.benefitAvailable.name}
          </p>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-[#8A91A3]">Código de canje</p>
          <p className="mt-2 rounded-[16px] border border-dashed border-[#D8DBE7] bg-[#F7F7FB] px-4 py-4 text-center font-mono text-[28px] font-bold tracking-[0.2em] text-[#24283A]">
            {place.benefitAvailable.code}
          </p>
          {place.benefitAvailable.expiresAt ? (
            <p className="mt-2 text-center text-xs text-[#8A91A3]">
              Válido hasta{" "}
              {new Date(place.benefitAvailable.expiresAt).toLocaleDateString("es-UY")}
            </p>
          ) : null}
          <p className="mt-4 text-center text-sm font-medium text-[#697084]">
            Mostrá este código al personal para disfrutar tu premio.
          </p>
        </section>
      ) : place.rewardGoal ? (
        <section className="mt-5 overflow-hidden rounded-[28px] bg-white/80 p-6 shadow-[0_16px_38px_rgba(31,35,58,0.1)] backdrop-blur-xl">
          <p className="flex items-center gap-2 text-sm font-bold text-[#24283A]">
            <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${brand} 12%, white)`, color: brand }}>
              <Gift className="h-4 w-4" aria-hidden="true" />
            </span>
            {place.rewardGoal.remainingVisits === 1
              ? "Te falta 1 visita para desbloquear:"
              : `Te faltan ${place.rewardGoal.remainingVisits} visitas para desbloquear:`}
          </p>
          <p className="mt-4 text-[24px] font-bold leading-tight tracking-[-0.03em]" style={{ color: brand }}>
            {place.rewardGoal.incentiveName}
          </p>
          <div className="mt-6 h-3 w-full overflow-hidden rounded-full bg-[#E7E9F1]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(
                  100,
                  Math.round(
                    (place.rewardGoal.progressVisits /
                      Math.max(1, place.rewardGoal.targetAdditionalVisits)) *
                      100,
                  ),
                )}%`,
                backgroundColor: brand,
              }}
            />
          </div>
          <p className="mt-2.5 text-sm font-semibold text-[#697084]">
            {place.rewardGoal.progressVisits}/{place.rewardGoal.targetAdditionalVisits}{" "}
            visitas completadas
          </p>
        </section>
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
      )}
    </Shell>
  );
}

function Shell({ children, brand = "#5C6BC0" }: { children: React.ReactNode; brand?: string }) {
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
