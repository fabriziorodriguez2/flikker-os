"use client";

import { Loader2, Target } from "lucide-react";

/** Espejo de `MyFlikkerChallenge` en la API. */
export interface MyFlikkerChallenge {
  missionId: string;
  businessId: string;
  businessName: string;
  logoUrl: string | null;
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
      {challenges.map((challenge) => (
        <li
          key={`${challenge.businessId}:${challenge.missionId}`}
          className="rounded-[20px] bg-white p-5 shadow-[0_2px_14px_rgba(23,26,43,0.06)]"
        >
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
      ))}
    </ul>
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
