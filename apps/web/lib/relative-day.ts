/**
 * Fechas relativas ("Hoy" / "Ayer" / "Hace N días") — una sola
 * implementación para todo el panel y la experiencia pública.
 *
 * Bug real que esto corrige (auditoría de caso real): la versión anterior en
 * `loyalty-ui.tsx` hacía `Math.floor((Date.now() - fecha) / 86_400_000)`, que
 * NO son días de calendario sino períodos de 24 horas transcurridos. Con eso,
 * a las 10:00 de hoy:
 *
 *   - una visita de AYER 23:30  → 10,5 h transcurridas → 0 → decía "Hoy"
 *   - una visita de ANTEAYER 23:00 → ~35 h            → 1 → decía "Ayer"
 *
 * Exactamente el corrimiento de un día que se reportó. La causa NO era el
 * huso horario: era comparar duración en vez de días de calendario.
 *
 * Acá se comparan días de calendario de verdad, y el día se resuelve con
 * `Intl.DateTimeFormat` + `timeZone` — nunca sumando/restando horas a mano,
 * que es lo que rompe con el horario de verano y con cualquier huso que no
 * sea el del servidor.
 */

const MS_PER_DAY = 86_400_000;

/**
 * Huso por defecto: el del dispositivo que está mirando la pantalla. Para el
 * dueño parado en su local en Uruguay eso ES `America/Montevideo`, y para un
 * negocio de otro país sigue siendo el correcto sin hardcodear nada. Se
 * puede pasar uno explícito (por ejemplo `Business.timezone`) cuando el
 * llamador lo tenga a mano.
 */
export function resolveDefaultTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** `YYYY-MM-DD` del instante, leído en `timeZone`. */
export function dayKeyInTimeZone(date: Date, timeZone: string): string {
  // `en-CA` produce exactamente YYYY-MM-DD, sin depender del locale del
  // usuario ni de parsear un string con formato variable.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Días de calendario entre dos claves `YYYY-MM-DD`. Se reconstruyen con
 * `Date.UTC` a propósito: sobre componentes puros de fecha, UTC no tiene
 * horario de verano, así que la resta es exacta por definición.
 */
export function calendarDaysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / MS_PER_DAY,
  );
}

/** Cuántos días de calendario pasaron desde `value` hasta `now`, en `timeZone`. */
export function calendarDaysAgo(
  value: Date,
  { now = new Date(), timeZone = resolveDefaultTimeZone() } = {},
): number {
  return calendarDaysBetween(
    dayKeyInTimeZone(value, timeZone),
    dayKeyInTimeZone(now, timeZone),
  );
}

export interface RelativeDayOptions {
  now?: Date;
  timeZone?: string;
  /** Qué mostrar cuando no hay fecha. */
  emptyLabel?: string;
  /** A partir de cuántos días se muestra la fecha en vez de "Hace N días". */
  absoluteAfterDays?: number;
}

/** Fecha corta (`3 sep`) en el huso indicado. */
export function shortDateInTimeZone(
  value: Date,
  timeZone = resolveDefaultTimeZone(),
): string {
  return value.toLocaleDateString("es-UY", {
    timeZone,
    day: "numeric",
    month: "short",
  });
}

/**
 * "Hoy" / "Ayer" / "Hace N días" / fecha corta. Una fecha futura (por reloj
 * desfasado, por ejemplo) cae en "Hoy" en vez de decir un absurdo.
 */
export function relativeDayLabel(
  value: string | Date | null | undefined,
  {
    now = new Date(),
    timeZone = resolveDefaultTimeZone(),
    emptyLabel = "Nunca",
    absoluteAfterDays = 30,
  }: RelativeDayOptions = {},
): string {
  if (!value) return emptyLabel;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return emptyLabel;

  const days = calendarDaysAgo(date, { now, timeZone });
  if (days <= 0) return "Hoy";
  if (days === 1) return "Ayer";
  if (days < absoluteAfterDays) return `Hace ${days} días`;
  return shortDateInTimeZone(date, timeZone);
}
