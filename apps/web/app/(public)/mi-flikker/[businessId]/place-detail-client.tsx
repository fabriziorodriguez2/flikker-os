"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Gift, Loader2, Sparkles } from "lucide-react";

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

  const brand = place.primaryColor ?? "#5C6BC0";

  return (
    <Shell>
      <Link
        href="/mi-flikker"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#697084]"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Mis lugares
      </Link>

      <h1 className="text-[24px] font-bold tracking-[-0.03em] text-[#171A2B]">
        {place.businessName}
      </h1>
      <p className="mt-1 text-sm text-[#8A91A3]">
        {place.visitsTotal} {place.visitsTotal === 1 ? "visita" : "visitas"} ·{" "}
        {place.lastVisitAt
          ? `Última visita ${new Date(place.lastVisitAt).toLocaleDateString("es-UY")}`
          : "Sin visitas registradas"}
      </p>

      {place.benefitAvailable ? (
        <div className="mt-5 rounded-[18px] border border-white/80 bg-white/72 px-5 py-4 shadow-[0_10px_28px_rgba(31,35,58,0.08)]">
          <p className="flex items-center gap-1.5 text-sm font-bold" style={{ color: brand }}>
            <Sparkles className="h-4 w-4" /> Recompensa disponible
          </p>
          <p className="mt-1 text-base font-bold text-[#171A2B]">
            {place.benefitAvailable.name}
          </p>
          <p className="mt-2 rounded-[10px] bg-[#F5F6FA] px-3 py-2 text-center text-lg font-bold tracking-[0.2em] text-[#24283A]">
            {place.benefitAvailable.code}
          </p>
          {place.benefitAvailable.expiresAt ? (
            <p className="mt-2 text-center text-xs text-[#8A91A3]">
              Válido hasta{" "}
              {new Date(place.benefitAvailable.expiresAt).toLocaleDateString("es-UY")}
            </p>
          ) : null}
          <p className="mt-2 text-center text-xs text-[#8A91A3]">
            Mostrá este código en el local para canjearlo.
          </p>
        </div>
      ) : place.rewardGoal ? (
        <div className="mt-5 rounded-[18px] border border-white/80 bg-white/72 px-5 py-4 shadow-[0_10px_28px_rgba(31,35,58,0.08)]">
          <p className="flex items-center gap-1.5 text-sm font-bold text-[#24283A]">
            <Gift className="h-4 w-4" style={{ color: brand }} />
            {place.rewardGoal.remainingVisits === 1
              ? "Te falta 1 visita para desbloquear:"
              : `Te faltan ${place.rewardGoal.remainingVisits} visitas para desbloquear:`}
          </p>
          <p className="mt-1 text-base font-bold" style={{ color: brand }}>
            {place.rewardGoal.incentiveName}
          </p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#EDEFF5]">
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
          <p className="mt-1.5 text-[11px] font-semibold text-[#8A91A3]">
            {place.rewardGoal.progressVisits}/{place.rewardGoal.targetAdditionalVisits}{" "}
            visitas
          </p>
        </div>
      ) : (
        <p className="mt-5 text-sm text-[#8A91A3]">
          Sin recompensa activa por ahora. Escaneá tu próxima visita para ver
          si hay algo nuevo.
        </p>
      )}
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
