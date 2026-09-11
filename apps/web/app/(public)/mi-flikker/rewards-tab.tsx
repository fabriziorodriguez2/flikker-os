"use client";

import Link from "next/link";
import { ChevronRight, Gift, Loader2, MapPin } from "lucide-react";
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

/**
 * Mi Flikker → Premios. Todas las emisiones del cliente, de todos sus
 * negocios, en una sola lista.
 *
 * Cada `BenefitParticipation` es su propia fila: dos emisiones del mismo
 * beneficio, con el mismo título, se muestran dos veces — son dos promesas
 * distintas con códigos distintos y el cliente puede usar las dos.
 *
 * El QR no se dibuja acá: tocar un premio disponible abre `/beneficio/{id}`,
 * que ya es la pantalla de una emisión (con `BenefitCard` y su revelado). No
 * hay un segundo componente de código en el producto.
 */
export default function RewardsTab({
  rewards,
  loading,
}: {
  rewards: MyFlikkerReward[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-[#8A91A3]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
        Cargando…
      </div>
    );
  }

  if (rewards.length === 0) {
    return (
      <PublicState
        icon={Gift}
        title="Todavía no tenés premios"
        description="Cuando desbloquees un beneficio, aparece acá."
        action={{ label: "Ver mis lugares", href: "/mi-flikker" }}
      />
    );
  }

  return (
    <ul className="mt-6 flex w-full flex-col gap-3 pb-4">
      {rewards.map((reward) => (
        <li key={reward.participationId}>
          <RewardCard reward={reward} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Disponible es la única tarjeta accionable — es un `<Link>` al detalle de la
 * emisión. Canjeado y vencido son historia: se dibujan como `<div>`, sin
 * link, sin código y visualmente atenuados, así no hay forma de tocarlos
 * esperando un QR que ya no existe.
 */
function RewardCard({ reward }: { reward: MyFlikkerReward }) {
  const available = reward.status === "AVAILABLE";

  const body = (
    <>
      <Logo reward={reward} dimmed={!available} />

      <div className="min-w-0 flex-1">
        <p
          className={`break-words text-[15px] font-bold leading-tight tracking-[-0.01em] ${
            available ? "text-[#1A1A24]" : "text-[#5A5A6E]"
          }`}
        >
          {reward.benefitTitle}
        </p>
        <p className="mt-0.5 truncate text-[13px] font-medium text-[#8A90A6]">
          {reward.businessName}
        </p>
        <StatusLine reward={reward} />
      </div>

      {available ? (
        <ChevronRight
          className="h-5 w-5 shrink-0 self-center text-[#B7BACB]"
          aria-hidden="true"
        />
      ) : null}
    </>
  );

  const shared =
    "flex items-center gap-3.5 rounded-[18px] border p-4 transition-colors";

  if (!available) {
    return (
      <div
        data-reward-status={reward.status}
        className={`${shared} border-[#EDEEF5] bg-[#FAFAFC]`}
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      href={reward.href}
      data-reward-status={reward.status}
      className={`${shared} border-[#E7E8F1] bg-white hover:border-[#DBDDE9] hover:bg-[#FCFCFE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6A5DF0] focus-visible:ring-offset-2`}
    >
      {body}
    </Link>
  );
}

function Logo({
  reward,
  dimmed,
}: {
  reward: MyFlikkerReward;
  dimmed: boolean;
}) {
  const className = `h-11 w-11 shrink-0 rounded-[12px] border border-[#ECEDF3] bg-white object-contain p-1.5 ${
    dimmed ? "opacity-60 grayscale" : ""
  }`;

  if (reward.businessLogo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={reward.businessLogo} alt="" className={className} />;
  }
  return (
    <span
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[#F3F2F8] text-[#8A90A6] ${
        dimmed ? "opacity-60" : ""
      }`}
    >
      <MapPin className="h-[18px] w-[18px]" aria-hidden="true" />
    </span>
  );
}

/** La línea de estado. Nunca muestra un código: solo dice en qué está. */
function StatusLine({ reward }: { reward: MyFlikkerReward }) {
  if (reward.status === "AVAILABLE") {
    return (
      <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#EFEDFD] px-2.5 py-1 text-[12px] font-bold text-[#4A3FD1]">
        <Gift className="h-[13px] w-[13px] shrink-0" aria-hidden="true" />
        Disponible
      </span>
    );
  }

  if (reward.status === "REDEEMED") {
    return (
      <p className="mt-1 text-[12px] font-medium text-[#8A90A6]">
        Canjeado{reward.redeemedAt ? ` el ${formatDate(reward.redeemedAt)}` : ""}
      </p>
    );
  }

  return (
    <p className="mt-1 text-[12px] font-medium text-[#8A90A6]">
      Venció{reward.expiresAt ? ` el ${formatDate(reward.expiresAt)}` : ""}
    </p>
  );
}

/** "8 de septiembre" — sin año, que en esta pantalla es siempre reciente. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-UY", {
    day: "numeric",
    month: "long",
  });
}
