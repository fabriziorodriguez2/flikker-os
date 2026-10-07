"use client";

import Link from "next/link";
import { Gift, Loader2, Star } from "lucide-react";
import PublicState from "@/components/public/public-state";

export type RewardStatus = "AVAILABLE" | "REDEEMED" | "EXPIRED";

/** Espejo de `MyFlikkerReward` en la API. Una fila = una emisión. */
export interface MyFlikkerReward {
  participationId: string;
  businessId: string;
  businessName: string;
  businessLogo: string | null;
  benefitTitle: string;
  status: RewardStatus;
  /** Solo llega con `AVAILABLE` — el backend no lo manda en los otros casos. */
  redemptionCode: string | null;
  expiresAt: string | null;
  redeemedAt: string | null;
  source: string;
  href: string;
}

/** Available issuances are actionable; redeemed/expired issuances are quiet history. */
export default function RewardsTab({
  rewards,
  loading,
  error = false,
  onRetry,
}: {
  rewards: MyFlikkerReward[];
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  if (loading)
    return (
      <div
        role="status"
        className="flex h-40 items-center justify-center text-[#85858F]"
      >
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Cargando…
      </div>
    );
  if (error)
    return (
      <div role="alert" className="py-5 text-sm text-[#777780]">
        No pudimos cargar tus premios.{" "}
        <button onClick={onRetry} className="font-bold text-[#6851EC]">
          Reintentar
        </button>
      </div>
    );
  const available = rewards.filter((r) => r.status === "AVAILABLE");
  const history = rewards.filter((r) => r.status !== "AVAILABLE");
  return (
    <>
      {available.length ? (
        <ul className="flex flex-col gap-3">
          {available.map((reward) => (
            <li key={reward.participationId}>
              <RewardCard reward={reward} />
            </li>
          ))}
        </ul>
      ) : (
        <PublicState
          icon={Gift}
          title="No tenés premios disponibles"
          description="Cuando desbloquees un beneficio, aparece acá."
          action={{ label: "Ver mis lugares", href: "/mi-flikker" }}
          compact
        />
      )}
      {history.length ? (
        <section className="mt-6">
          <h2 className="mb-3 text-[10px] font-bold uppercase tracking-[0.13em] text-[#777780]">
            Historial
          </h2>
          <ul className="flex flex-col gap-2">
            {history.map((reward) => (
              <li key={reward.participationId}>
                <RewardCard reward={reward} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

export function RewardCard({ reward }: { reward: MyFlikkerReward }) {
  if (reward.status !== "AVAILABLE")
    return (
      <div
        data-reward-status={reward.status}
        className="flex items-center gap-3 rounded-[16px] border border-dashed border-[#D7D6DE] px-3 py-3"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/50 text-[#AAA4C4]">
          <Star className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className="break-words text-xs font-semibold text-[#777780]">
            {reward.benefitTitle}
          </p>
          <p className="mt-1 break-words text-[10px] leading-relaxed text-[#98969F]">
            {reward.businessName} ·{" "}
            {reward.status === "REDEEMED"
              ? "Canjeado" +
                (reward.redeemedAt
                  ? " el " + formatDate(reward.redeemedAt)
                  : "")
              : "Venció" +
                (reward.expiresAt ? " el " + formatDate(reward.expiresAt) : "")}
          </p>
        </div>
      </div>
    );
  return (
    <Link
      href={reward.href}
      data-reward-status={reward.status}
      className="flex min-w-0 overflow-hidden rounded-[20px] bg-white shadow-[0_3px_8px_#17171D06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6851EC]"
    >
      <span className="relative flex w-[72px] shrink-0 items-center justify-center border-r border-dashed border-white/50 bg-[#6348E7] before:absolute before:-right-1.5 before:-top-1.5 before:h-3 before:w-3 before:rounded-full before:bg-[#ECEBF0] after:absolute after:-bottom-1.5 after:-right-1.5 after:h-3 after:w-3 after:rounded-full after:bg-[#ECEBF0]">
        <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#6348E7]">
          {reward.businessLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={reward.businessLogo}
              alt=""
              className="h-full w-full object-contain p-1"
            />
          ) : (
            <Star className="h-4 w-4" />
          )}
        </span>
      </span>
      <div className="min-w-0 flex-1 p-4">
        <span className="inline-block rounded-full bg-[#E0F4E9] px-2 py-1 text-[9px] font-bold text-[#176745]">
          Disponible
        </span>
        <h2 className="mt-2 break-words text-[20px] font-bold leading-tight tracking-[-0.025em]">
          {reward.benefitTitle}
        </h2>
        <p className="mt-1 break-words text-[10px] text-[#85858F]">
          {reward.businessName}
        </p>
        <span className="mt-3 flex min-h-10 items-center justify-center rounded-[12px] bg-[#19191F] px-3 py-2 text-xs font-bold text-white">
          Ver premio
        </span>
      </div>
    </Link>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-UY", {
    day: "numeric",
    month: "long",
  });
}
