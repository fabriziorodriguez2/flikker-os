/**
 * Rachas — aritmética pura. Sin Prisma, sin `new Date()` escondido.
 *
 * **Por qué esto no toca timezones.**
 *
 * La entrada son `visitDayKey` ("2026-08-31"), no timestamps. Esa columna ya
 * guarda el día de CALENDARIO LOCAL del negocio, resuelto por
 * `VisitsRepository.registerVisit` en el momento de escribir la visita, con
 * el timezone que el negocio tenía entonces. Es la misma verdad que usa el
 * dedupe de visitas ("¿cuántas visitas lleva hoy?").
 *
 * Entonces acá no hay ninguna conversión que hacer: se agrupan días locales
 * en semanas locales con aritmética de calendario pura. No hay UTC que
 * malinterpretar, no hay horario de verano que corra una semana, y una
 * visita del domingo 23:59 y otra del lunes 00:01 caen en semanas distintas
 * por construcción, porque ya llegaron acá como días distintos.
 */

const MS_PER_DAY = 86_400_000;

/**
 * Tope de semanas que una racha puede reportar.
 *
 * Es un **límite de producto del read-model, no una equivalencia matemática**:
 * alguien con 60 semanas reales ve 52. Se acepta a conciencia en este MVP —
 * más allá de un año el número deja de ser información útil y empieza a ser
 * un costo de query — y se aplica ACÁ, explícitamente, en vez de emerger como
 * efecto secundario de cuántos datos trajo la consulta. Así el tope es
 * determinístico y testeable, y no cambia si mañana se toca la ventana de la
 * query.
 */
export const MAX_STREAK_LOOKBACK_WEEKS = 52;

export type StreakState = 'ACTIVE' | 'AT_RISK' | 'BROKEN';

export interface Streak {
  /** Semanas consecutivas. 0 solo cuando el estado es BROKEN. */
  currentWeeks: number;
  state: StreakState;
  /** Lunes de la semana local en curso ("2026-08-31"). */
  currentWeekStart: string;
  /**
   * Último día para mantener la racha: el domingo de la semana en curso.
   * Solo tiene sentido leerlo cuando el estado es AT_RISK.
   */
  deadlineDayKey: string;
}

/** "2026-08-31" → partes numéricas. Formato garantizado por `localDayKey`. */
function parseDayKey(dayKey: string): { y: number; m: number; d: number } {
  const [y, m, d] = dayKey.split('-').map(Number);
  return { y, m, d };
}

function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Un día de calendario tratado como fecha UTC pura. NO es "ese día en UTC":
 * es la fecha desnuda, sin zona, que es todo lo que hace falta para contar
 * días y semanas entre dos días de calendario.
 */
function asCalendarDate(dayKey: string): Date {
  const { y, m, d } = parseDayKey(dayKey);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * El lunes de la semana que contiene `dayKey`. Semana ISO: lunes 00:00 local
 * hasta el lunes siguiente 00:00 local.
 */
export function weekStartOf(dayKey: string): string {
  const date = asCalendarDate(dayKey);
  const weekday = date.getUTCDay(); // 0 = domingo
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  return toDayKey(new Date(date.getTime() - daysSinceMonday * MS_PER_DAY));
}

/** El domingo de esa misma semana — el último día para mantener la racha. */
export function weekEndOf(weekStart: string): string {
  return toDayKey(
    new Date(asCalendarDate(weekStart).getTime() + 6 * MS_PER_DAY),
  );
}

/** La semana anterior a `weekStart`. */
export function previousWeek(weekStart: string): string {
  return toDayKey(
    new Date(asCalendarDate(weekStart).getTime() - 7 * MS_PER_DAY),
  );
}

/**
 * Calcula la racha a partir de los días en que el cliente visitó.
 *
 * **La semántica del corte, que es la decisión de producto real:** una racha
 * NO se rompe el lunes a las 00:01. Se rompe cuando termina una semana
 * entera sin ninguna visita. Mientras la semana en curso siga abierta, quien
 * vino la semana pasada conserva su racha y todavía está a tiempo — eso es
 * AT_RISK. Romperla al primer minuto del lunes castigaría a alguien que
 * todavía tiene seis días para volver.
 *
 * @param visitDayKeys días locales con al menos una visita. Duplicados y
 *   desorden dan igual: solo importa qué semanas aparecen.
 * @param todayKey el día local de HOY en el negocio.
 */
export function computeStreak(
  visitDayKeys: readonly string[],
  todayKey: string,
): Streak {
  const currentWeekStart = weekStartOf(todayKey);
  const base: Omit<Streak, 'currentWeeks' | 'state'> = {
    currentWeekStart,
    deadlineDayKey: weekEndOf(currentWeekStart),
  };

  // Varias visitas en la misma semana colapsan acá: el Set es toda la regla
  // de "5 visitas esta semana siguen siendo una semana".
  const weeks = new Set(visitDayKeys.map(weekStartOf));
  if (weeks.size === 0) {
    return { ...base, currentWeeks: 0, state: 'BROKEN' };
  }

  const lastWeekStart = previousWeek(currentWeekStart);

  // Desde dónde contar hacia atrás: si ya vino esta semana, la racha está
  // asegurada e incluye la semana en curso. Si no vino pero sí la pasada,
  // la racha sigue viva y se cuenta hasta la semana pasada.
  let anchor: string;
  let state: StreakState;
  if (weeks.has(currentWeekStart)) {
    anchor = currentWeekStart;
    state = 'ACTIVE';
  } else if (weeks.has(lastWeekStart)) {
    anchor = lastWeekStart;
    state = 'AT_RISK';
  } else {
    // Pasó una semana completa sin visitas. La racha vieja no se muestra
    // como si siguiera viva.
    return { ...base, currentWeeks: 0, state: 'BROKEN' };
  }

  let currentWeeks = 0;
  let cursor = anchor;
  // El tope corta acá, no en la query: ver `MAX_STREAK_LOOKBACK_WEEKS`.
  while (weeks.has(cursor) && currentWeeks < MAX_STREAK_LOOKBACK_WEEKS) {
    currentWeeks += 1;
    cursor = previousWeek(cursor);
  }

  return { ...base, currentWeeks, state };
}

/**
 * Cuántas semanas hacen falta para que valga la pena mostrar la tarjeta.
 *
 * Una sola semana no es una racha: es una visita. Mostrar "🔥 Racha actual: 1
 * semana" a alguien que vino una vez le pone un nombre grande a algo que
 * todavía no pasó, y aparecería para TODO cliente nuevo — que es justo el
 * ruido que hay que evitar. Con dos semanas consecutivas ya hay un patrón
 * real que sostener, y la palabra "racha" significa algo.
 *
 * Regla única, sin condiciones compuestas: si no hay dos semanas, no hay
 * tarjeta. También hace imposible por construcción mostrar un "0 semanas".
 */
export const MIN_WEEKS_TO_SHOW = 2;

export function isWorthShowing(streak: Streak): boolean {
  return streak.state !== 'BROKEN' && streak.currentWeeks >= MIN_WEEKS_TO_SHOW;
}
