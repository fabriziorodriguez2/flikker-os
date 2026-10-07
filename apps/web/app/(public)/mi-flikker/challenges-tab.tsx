"use client";

import { Loader2, Target } from "lucide-react";
import WalletChallengeCard from "@/components/public/wallet-challenge-card";
import PublicState from "@/components/public/public-state";

/**
 * Espejo de `MyFlikkerChallenge` en la API — unión discriminada por `kind`.
 * Cada mecánica trae los campos que necesita; nada se fuerza a una forma
 * común artificial.
 */
export type MyFlikkerChallenge =
  | MissionChallenge
  | StreakChallenge
  | ReturnChallengeCard;

interface ChallengeBase {
  timezone?: string;
  businessId: string;
  businessName: string;
  logoUrl: string | null;
}

export interface ReturnChallengeCard extends ChallengeBase {
  kind: "return_challenge";
  challengeId: string;
  /** Domingo local ("2026-09-27") — el último día para volver. */
  deadlineDayKey: string;
}

export interface StreakChallenge extends ChallengeBase {
  kind: "streak";
  /** Nunca 0: una racha rota no llega hasta acá. */
  currentWeeks: number;
  state: "ACTIVE" | "AT_RISK";
  /** Domingo de la semana en curso ("2026-09-27"). */
  deadlineDayKey: string;
}

export interface MissionChallenge extends ChallengeBase {
  kind: "mission";
  missionId: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "COMPLETED" | "EXPIRED";
  progress: {
    current: number;
    target: number;
    remaining: number;
    complete: boolean;
  };
  endsAt: string;
  /** Timezone del negocio — con qué reloj se lee la fecha límite. */
  timezone: string;
  /**
   * Último día para venir ("2026-09-30"), ya resuelto por el backend en el
   * timezone del negocio. El cliente NO vuelve a calcularlo: hacerlo con el
   * reloj del dispositivo corría la fecha para quien está de viaje.
   */
  lastDayKey: string;
  rewardName: string | null;
  rewardHidden: boolean;
  rewardCode: string | null;
}

/**
 * Mi Flikker → Desafíos.
 *
 * Solo muestra lo que el cliente REALMENTE tiene: sin desafíos no hay
 * tarjetas decorativas ni un "0 de 3" inventado, hay un estado vacío.
 *
 * La composición wallet vive en `WalletChallengeCard`. El texto de cada
 * mecánica sigue en `toRow`, compartido con el detalle y el check-in.
 */
export default function ChallengesTab({
  challenges,
  loading,
  error = false,
  onRetry,
}: {
  challenges: MyFlikkerChallenge[];
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-[#8A91A3]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
        Cargando…
      </div>
    );
  }

  if (error)
    return (
      <div role="alert" className="py-5 text-sm text-[#777780]">
        No pudimos cargar tus desaf?os.{" "}
        <button onClick={onRetry} className="font-bold text-[#6851EC]">
          Reintentar
        </button>
      </div>
    );

  if (challenges.length === 0) {
    return (
      <PublicState
        icon={Target}
        title="No tenés desafíos activos"
        compact
        description="Cuando alguno de tus lugares proponga un objetivo — como venir 3 veces en el mes — te va a aparecer acá, con tu progreso."
      />
    );
  }

  return (
    <>
      <ul className="flex w-full flex-col gap-5">
        {challenges.map((challenge) => (
          <WalletChallengeCard
            key={challengeKey(challenge)}
            challenge={challenge}
          />
        ))}
      </ul>
      <p className="mt-4 text-center text-[10px] leading-relaxed text-[#85858F]">
        Cuando un lugar tenga un desafío para vos, va a aparecer acá.
      </p>
    </>
  );
}

function challengeKey(challenge: MyFlikkerChallenge): string {
  if (challenge.kind === "return_challenge") {
    return `rc:${challenge.challengeId}`;
  }
  if (challenge.kind === "streak") return `streak:${challenge.businessId}`;
  return `mission:${challenge.businessId}:${challenge.missionId}`;
}

/**
 * Traduce cada mecánica a las props de `ChallengeRow`. Es el único lugar del
 * front donde se decide qué texto le corresponde a cada tipo de desafío — el
 * detalle de lugar reusa esta misma función.
 */
export function toRow(challenge: MyFlikkerChallenge) {
  if (challenge.kind === "return_challenge") {
    return {
      kind: "return_challenge" as const,
      title: "Desafío de vuelta",
      subtitle: `Volvé antes del ${formatDeadline(challenge.deadlineDayKey)}`,
      reward: { label: "+1 sello extra" },
    };
  }

  if (challenge.kind === "streak") {
    return {
      kind: "streak" as const,
      title: `Racha de ${challenge.currentWeeks} ${
        challenge.currentWeeks === 1 ? "semana" : "semanas"
      }`,
      subtitle:
        challenge.state === "ACTIVE"
          ? "Ya mantuviste tu racha esta semana."
          : `Volvé antes del ${formatDeadline(challenge.deadlineDayKey)} para mantenerla.`,
    };
  }

  const { current, target, complete, remaining } = challenge.progress;
  return {
    kind: "mission" as const,
    title: challenge.name,
    subtitle: complete ? "¡Completado!" : `${current} de ${target} visitas`,
    progress: { current, target },
    status: complete ? ("completed" as const) : ("active" as const),
    deadline: complete
      ? null
      : `Hasta el ${formatDeadline(challenge.lastDayKey)}`,
    reward: missionReward(challenge, remaining, complete),
  };
}

function missionReward(
  challenge: MissionChallenge,
  remaining: number,
  complete: boolean,
) {
  if (challenge.rewardHidden) {
    return {
      label: "Premio secreto",
      detail:
        remaining === 1
          ? "te falta 1 visita para descubrirlo"
          : `te faltan ${remaining} visitas para descubrirlo`,
    };
  }
  if (!challenge.rewardName) return null;
  return {
    label: complete
      ? `Desbloqueaste: ${challenge.rewardName}`
      : challenge.rewardName,
    detail: challenge.rewardCode
      ? `mostrá el código ${challenge.rewardCode} en el local`
      : null,
  };
}

/**
 * Formatea "2026-09-30" como "30 de setiembre".
 *
 * El día ya viene resuelto por el backend en el timezone del negocio, así que
 * acá no hay ninguna aritmética de zonas: se parsea a mediodía UTC —lejos de
 * los dos bordes— solo para poder pedirle el nombre del mes a `Intl`, y se
 * formatea en UTC para que ese mediodía no se mueva de día.
 */
export function formatDeadline(lastDayKey: string): string {
  const [year, month, day] = lastDayKey.split("-").map(Number);
  return new Intl.DateTimeFormat("es-UY", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}
