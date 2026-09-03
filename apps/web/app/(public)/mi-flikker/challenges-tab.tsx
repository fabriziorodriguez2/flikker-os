"use client";

import { Loader2, Target } from "lucide-react";

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
 * Solo muestra lo que el cliente REALMENTE tiene. Sin misiones no hay
 * tarjetas decorativas ni un "0 de 3" inventado: hay una frase que explica
 * qué son los desafíos y por qué esta pantalla está vacía.
 *
 * Hoy la lista trae solo misiones. Cuando existan rachas y desafíos de vuelta
 * se suman a la misma lista y esta pantalla no cambia de forma.
 */
export default function ChallengesTab({
  challenges,
  loading,
}: {
  challenges: MyFlikkerChallenge[];
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

  if (challenges.length === 0) {
    return (
      <div className="mt-10 px-2 text-center">
        <span
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-[15px] bg-[#EEF0FB] text-[#5C6BC0]"
          aria-hidden="true"
        >
          <Target className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <p className="mt-4 font-display text-base font-bold text-[#171A2B]">
          Todavía no tenés desafíos
        </p>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-[#8A91A3]">
          Cuando alguno de tus lugares proponga un objetivo — como venir 3
          veces en el mes — te va a aparecer acá, con tu progreso.
        </p>
      </div>
    );
  }

  return (
    <ul className="mt-8 flex w-full flex-col gap-3 pb-16">
      {challenges.map((challenge) =>
        challenge.kind === "return_challenge" ? (
          <ReturnChallengeRow
            key={`rc:${challenge.challengeId}`}
            challenge={challenge}
          />
        ) : challenge.kind === "streak" ? (
          <StreakCard
            key={`streak:${challenge.businessId}`}
            challenge={challenge}
          />
        ) : (
          <MissionRow
            key={`mission:${challenge.businessId}:${challenge.missionId}`}
            challenge={challenge}
          />
        ),
      )}
    </ul>
  );
}

/**
 * Desafío de vuelta. Va primero en la lista: tiene plazo corto y un premio
 * concreto en juego.
 *
 * Solo llegan acá los ACTIVE y sin vencer — el backend filtra por estado y
 * fecha, así que un desafío vencido o cancelado nunca se muestra. Un
 * cancelado, en particular, no es algo que haya que explicarle al cliente:
 * pasó del otro lado.
 */
function ReturnChallengeRow({
  challenge,
}: {
  challenge: ReturnChallengeCard;
}) {
  return (
    <li className="rounded-[20px] bg-white p-5 shadow-[0_2px_14px_rgba(23,26,43,0.06)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8A91A3]">
        {challenge.businessName}
      </p>

      <h3 className="mt-2 flex items-center gap-2 font-display text-[17px] font-bold leading-tight text-[#171A2B]">
        <span aria-hidden="true">⏳</span>
        Desafío de vuelta
      </h3>

      <p className="mt-2 text-sm text-[#5B6076]">
        Volvé antes del {formatDeadline(challenge.deadlineDayKey)}
      </p>

      <p className="mt-4 rounded-[14px] bg-[#EEF0FB] px-3.5 py-3 text-sm font-semibold text-[#4A56A6]">
        +1 sello extra
      </p>

      <a
        href={`/mi-flikker/${challenge.businessId}`}
        className="mt-3 inline-block text-sm font-semibold text-[#5C6BC0] underline underline-offset-2"
      >
        Ver mi tarjeta
      </a>
    </li>
  );
}

/**
 * La tarjeta de racha. Misma caja blanca que el resto de Desafíos: la
 * gamificación acá es el progreso, no la estética — sin gradientes, sin
 * confeti, sin puntajes.
 */
function StreakCard({ challenge }: { challenge: StreakChallenge }) {
  return (
    <li className="rounded-[20px] bg-white p-5 shadow-[0_2px_14px_rgba(23,26,43,0.06)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8A91A3]">
        {challenge.businessName}
      </p>

      <h3 className="mt-2 flex items-center gap-2 font-display text-[17px] font-bold leading-tight text-[#171A2B]">
        <span aria-hidden="true">🔥</span>
        Racha actual
      </h3>

      <p className="mt-1 font-display text-[26px] font-bold leading-none text-[#5C6BC0]">
        {challenge.currentWeeks}{" "}
        <span className="text-[17px]">
          {challenge.currentWeeks === 1 ? "semana" : "semanas"}
        </span>
      </p>

      <p className="mt-3 text-sm text-[#5B6076]">
        {challenge.state === "ACTIVE"
          ? "Ya mantuviste tu racha esta semana."
          : `Volvé antes del ${formatDeadline(challenge.deadlineDayKey)} para mantenerla.`}
      </p>
    </li>
  );
}

function MissionRow({ challenge }: { challenge: MissionChallenge }) {
  return (
    <li className="rounded-[20px] bg-white p-5 shadow-[0_2px_14px_rgba(23,26,43,0.06)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8A91A3]">
        {challenge.businessName}
      </p>

      <h3 className="mt-2 font-display text-[17px] font-bold leading-tight text-[#171A2B]">
        {challenge.name}
      </h3>

      <ProgressDots
        current={challenge.progress.current}
        target={challenge.progress.target}
      />

      <p className="mt-2 text-sm text-[#5B6076]">
        {challenge.progress.complete
          ? "¡Completado!"
          : `${challenge.progress.current} de ${challenge.progress.target} visitas`}
      </p>

      {challenge.rewardHidden ? (
        <RewardRow
          icon="🎁"
          title="Premio secreto"
          detail={
            challenge.progress.remaining === 1
              ? "Te falta 1 visita para descubrirlo."
              : `Te faltan ${challenge.progress.remaining} visitas para descubrirlo.`
          }
        />
      ) : challenge.rewardName ? (
        <RewardRow
          icon="🎉"
          title={
            challenge.progress.complete
              ? `Desbloqueaste: ${challenge.rewardName}`
              : challenge.rewardName
          }
          detail={
            challenge.rewardCode
              ? `Mostrá el código ${challenge.rewardCode} en el local.`
              : "Tu premio al completarlo."
          }
        />
      ) : null}

      {!challenge.progress.complete ? (
        <p className="mt-3 text-xs text-[#8A91A3]">
          Hasta el {formatDeadline(challenge.lastDayKey)}
        </p>
      ) : null}
    </li>
  );
}

/** Los puntitos del progreso. Hasta 10; más allá se muestra solo el número. */
function ProgressDots({
  current,
  target,
}: {
  current: number;
  target: number;
}) {
  if (target > 10) return null;
  return (
    <div
      className="mt-3 flex flex-wrap gap-1.5"
      role="img"
      aria-label={`${current} de ${target} visitas`}
    >
      {Array.from({ length: target }, (_, index) => (
        <span
          key={index}
          className={`h-2.5 w-2.5 rounded-full ${
            index < current ? "bg-[#5C6BC0]" : "bg-[#E2E4EF]"
          }`}
        />
      ))}
    </div>
  );
}

function RewardRow({
  icon,
  title,
  detail,
}: {
  icon: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="mt-4 flex items-start gap-2.5 rounded-[14px] bg-[#F5F5FA] px-3.5 py-3">
      <span className="text-base leading-none" aria-hidden="true">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-semibold text-[#171A2B]">{title}</span>
        <span className="text-xs leading-snug text-[#8A91A3]">{detail}</span>
      </span>
    </div>
  );
}

/**
 * Formatea "2026-09-30" como "30 de setiembre".
 *
 * El día ya viene resuelto por el backend en el timezone del negocio, así que
 * acá no hay ninguna aritmética de zonas: se parsea a mediodía UTC —lejos de
 * los dos bordes— solo para poder pedirle el nombre del mes a `Intl`, y se
 * formatea en UTC para que ese mediodía no se mueva de día.
 */
function formatDeadline(lastDayKey: string): string {
  const [year, month, day] = lastDayKey.split("-").map(Number);
  return new Intl.DateTimeFormat("es-UY", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}
