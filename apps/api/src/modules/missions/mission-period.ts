import { MissionPeriodPreset } from '@prisma/client';
import {
  startOfLocalDay,
  startOfLocalDayPlus,
  startOfLocalMonth,
  startOfLocalWeek,
  startOfNextLocalMonth,
} from '../../common/utils/timezone.util';

/**
 * Resuelve el preset elegido por el dueño a una ventana ABSOLUTA.
 *
 * Se corre UNA sola vez, al crear la misión, y el resultado se persiste en
 * `Mission.startsAt`/`endsAt`. Nada vuelve a interpretar "este mes" después:
 * si el negocio cambiara de timezone, o si el mes cambia mientras la misión
 * está viva, la gente que ya está jugando no ve moverse las reglas.
 *
 * En Fase 1 la ventana es GLOBAL: todos los participantes de una misión
 * comparten las mismas fechas. Las ventanas rolling por cliente ("14 días
 * desde que entrás") son otro problema y viven en los Return Challenges.
 *
 * La ventana es medio-abierta — `[startsAt, endsAt)` — así que dos períodos
 * consecutivos nunca se solapan por un instante ni dejan un hueco.
 */
export interface MissionWindow {
  startsAt: Date;
  endsAt: Date;
}

export const MIN_TARGET_VISITS = 1;
export const MAX_TARGET_VISITS = 50;
export const MIN_PERIOD_DAYS = 1;
export const MAX_PERIOD_DAYS = 365;

export class MissionPeriodError extends Error {}

export function resolveMissionWindow(
  preset: MissionPeriodPreset,
  timezone: string,
  now: Date,
  options: { periodDays?: number | null; startsAt?: Date; endsAt?: Date } = {},
): MissionWindow {
  switch (preset) {
    case MissionPeriodPreset.THIS_WEEK: {
      const startsAt = startOfLocalWeek(now, timezone);
      return { startsAt, endsAt: startOfLocalDayPlus(startsAt, timezone, 7) };
    }

    case MissionPeriodPreset.THIS_MONTH:
      return {
        startsAt: startOfLocalMonth(now, timezone),
        endsAt: startOfNextLocalMonth(now, timezone),
      };

    case MissionPeriodPreset.NEXT_N_DAYS: {
      const days = options.periodDays ?? 0;
      if (
        !Number.isInteger(days) ||
        days < MIN_PERIOD_DAYS ||
        days > MAX_PERIOD_DAYS
      ) {
        throw new MissionPeriodError(
          `periodDays debe ser un entero entre ${MIN_PERIOD_DAYS} y ${MAX_PERIOD_DAYS}`,
        );
      }
      // Arranca HOY a medianoche local, no en este instante: una visita de
      // esta mañana tiene que contar para una misión creada a la tarde.
      const startsAt = startOfLocalDay(now, timezone);
      return {
        startsAt,
        endsAt: startOfLocalDayPlus(startsAt, timezone, days),
      };
    }

    case MissionPeriodPreset.CUSTOM: {
      const { startsAt, endsAt } = options;
      if (!startsAt || !endsAt) {
        throw new MissionPeriodError(
          'Un período personalizado necesita fecha de inicio y de fin',
        );
      }
      if (endsAt.getTime() <= startsAt.getTime()) {
        throw new MissionPeriodError(
          'La fecha de fin tiene que ser posterior a la de inicio',
        );
      }
      return { startsAt, endsAt };
    }
  }
}

/** Una misión ya terminó cuando `now` cae fuera (o justo en) su fin. */
export function isWindowClosed(window: MissionWindow, now: Date): boolean {
  return now.getTime() >= window.endsAt.getTime();
}

/** `now` cae dentro de `[startsAt, endsAt)`. */
export function isWindowOpen(window: MissionWindow, now: Date): boolean {
  return (
    now.getTime() >= window.startsAt.getTime() &&
    now.getTime() < window.endsAt.getTime()
  );
}
