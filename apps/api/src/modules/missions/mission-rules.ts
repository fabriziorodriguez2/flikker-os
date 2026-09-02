import { MissionPeriodPreset, MissionStatus } from '@prisma/client';

/**
 * Reglas puras de una misión. Sin Prisma, sin `new Date()` escondido: todo lo
 * que decide entra por parámetro, así que cada regla es reproducible en un
 * test y en un reporte.
 */

/**
 * Los campos que definen QUÉ pidió la misión y qué prometió a cambio. Una vez
 * que alguien está jugando, estos quedan congelados.
 *
 * El motivo es el mismo que llevó a `benefitTitleSnapshot` en las emisiones:
 * si el dueño sube `targetVisits` de 3 a 5, alguien que iba 3/3 pasa a 3/5 y
 * el sistema le retira una promesa que ya había cumplido. Como el progreso es
 * derivado (no hay número guardado), no hay forma de "respetarle el viejo
 * objetivo" sin snapshotear la regla por cliente — que es exactamente la
 * complejidad que esta fase evita. Congelar es la respuesta honesta: para
 * cambiar las reglas, se crea una misión nueva.
 *
 * Nombre, descripción y estado (pausar/terminar) siguen siendo editables
 * siempre: son presentación y control, no la regla del juego.
 */
export const MISSION_LOCKED_FIELDS = [
  'targetVisits',
  'startsAt',
  'endsAt',
  'periodPreset',
  'periodDays',
  'rewardBenefitId',
] as const;

export type MissionLockedField = (typeof MISSION_LOCKED_FIELDS)[number];

export interface MissionEditableFields {
  name?: string;
  description?: string | null;
  rewardHiddenUntilComplete?: boolean;
}

/**
 * Qué transiciones de estado son legales.
 *
 * `ENDED` es terminal a propósito: es el destino de una misión que el dueño
 * "elimina" teniendo participantes. Permitir volver de ahí sería reabrir un
 * período ya cerrado y devolverle a alguien una misión que su historial ya
 * dio por terminada.
 */
const ALLOWED_TRANSITIONS: Record<MissionStatus, MissionStatus[]> = {
  [MissionStatus.DRAFT]: [MissionStatus.ACTIVE, MissionStatus.ENDED],
  [MissionStatus.ACTIVE]: [MissionStatus.PAUSED, MissionStatus.ENDED],
  [MissionStatus.PAUSED]: [MissionStatus.ACTIVE, MissionStatus.ENDED],
  [MissionStatus.ENDED]: [],
};

export function canTransition(from: MissionStatus, to: MissionStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * ¿Esta misión está reclutando y contando visitas ahora mismo?
 *
 * PAUSED deja de sumar sin borrar nada: quien ya estaba adentro conserva su
 * participación y su progreso derivado, y si la misión se reanuda dentro de
 * su ventana, sigue donde estaba.
 */
export function isMissionLive(
  mission: { status: MissionStatus; startsAt: Date; endsAt: Date },
  now: Date,
): boolean {
  return (
    mission.status === MissionStatus.ACTIVE &&
    now.getTime() >= mission.startsAt.getTime() &&
    now.getTime() < mission.endsAt.getTime()
  );
}

export interface MissionProgress {
  /** Visitas válidas dentro de la ventana. Nunca por encima del objetivo. */
  current: number;
  target: number;
  remaining: number;
  complete: boolean;
}

/**
 * El progreso que se muestra. `visitsInWindow` viene de contar `Visit` —
 * nunca de un contador guardado, que es lo que haría posible sumar dos veces
 * la misma visita.
 */
export function computeMissionProgress(
  visitsInWindow: number,
  targetVisits: number,
): MissionProgress {
  const current = Math.min(visitsInWindow, targetVisits);
  return {
    current,
    target: targetVisits,
    remaining: Math.max(0, targetVisits - visitsInWindow),
    complete: visitsInWindow >= targetVisits,
  };
}

/**
 * Qué nombre de premio mostrarle al cliente.
 *
 * `rewardHiddenUntilComplete` es SOLO presentación: el premio ya está
 * decidido desde que se creó la misión y la emisión no cambia en nada. Lo
 * único que cambia es si se dice cuál es antes de tiempo.
 */
export function visibleRewardName(
  mission: {
    rewardHiddenUntilComplete: boolean;
    rewardBenefit: { title: string } | null;
  },
  complete: boolean,
): string | null {
  if (!mission.rewardBenefit) return null;
  if (mission.rewardHiddenUntilComplete && !complete) return null;
  return mission.rewardBenefit.title;
}

/** Etiqueta corta del período, para no mostrarle dos fechas al dueño. */
export function periodLabel(
  preset: MissionPeriodPreset,
  periodDays: number | null,
): string {
  switch (preset) {
    case MissionPeriodPreset.THIS_WEEK:
      return 'Esta semana';
    case MissionPeriodPreset.THIS_MONTH:
      return 'Este mes';
    case MissionPeriodPreset.NEXT_N_DAYS:
      return `Próximos ${periodDays ?? 0} días`;
    case MissionPeriodPreset.CUSTOM:
      return 'Período personalizado';
  }
}
