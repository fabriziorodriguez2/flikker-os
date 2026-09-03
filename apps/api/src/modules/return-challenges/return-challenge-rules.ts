import {
  localDayKey,
  startOfLocalDayPlus,
  startOfLocalWeek,
} from '../../common/utils/timezone.util';

/**
 * Reglas puras del desafío de vuelta. Sin Prisma, sin `new Date()` escondido.
 */

const MS_PER_HOUR = 3_600_000;

/**
 * Plazo mínimo útil. Crear un desafío el domingo a las 22:00 con dos horas
 * para volver no es un desafío, es una trampa — así que en ese caso se corre
 * al domingo siguiente.
 */
export const MIN_USEFUL_HOURS = 48;

export interface ChallengeWindow {
  startsAt: Date;
  /** Instante UTC del lunes 00:00 local. EXCLUSIVO. */
  expiresAt: Date;
  /** El domingo — último día para volver, en el calendario del negocio. */
  deadlineDayKey: string;
}

/**
 * "Volvé antes del domingo" = hasta el lunes 00:00 local.
 *
 * Regla completa, en una frase: vence el próximo lunes a la medianoche del
 * negocio; si faltan menos de 48 horas, el lunes siguiente.
 *
 * `expiresAt` es exclusivo, igual que `Mission.endsAt`: una visita del domingo
 * 23:59 entra, una del lunes 00:00 no. Y `deadlineDayKey` es el domingo, no el
 * lunes — mostrar la medianoche cruda diría un día de más.
 */
export function resolveChallengeWindow(
  timezone: string,
  now: Date,
): ChallengeWindow {
  const thisWeekStart = startOfLocalWeek(now, timezone);
  let expiresAt = startOfLocalDayPlus(thisWeekStart, timezone, 7);

  if (expiresAt.getTime() - now.getTime() < MIN_USEFUL_HOURS * MS_PER_HOUR) {
    expiresAt = startOfLocalDayPlus(thisWeekStart, timezone, 14);
  }

  return {
    startsAt: now,
    expiresAt,
    // Un milisegundo antes del corte cae en el domingo local.
    deadlineDayKey: localDayKey(new Date(expiresAt.getTime() - 1), timezone),
  };
}

/** ¿La visita ocurrió dentro del plazo? Ventana medio-abierta. */
export function isWithinWindow(
  window: { startsAt: Date; expiresAt: Date },
  occurredAt: Date,
): boolean {
  return (
    occurredAt.getTime() >= window.startsAt.getTime() &&
    occurredAt.getTime() < window.expiresAt.getTime()
  );
}
