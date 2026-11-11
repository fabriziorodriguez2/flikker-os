function dayKey(date: Date, timeZone?: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** "14:05" hoy, "Ayer" ayer, "3 nov" este año, "3 nov 2025" antes. */
export function formatConversationDate(
  iso: string,
  now: Date = new Date(),
  timeZone?: string,
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  if (dayKey(date, timeZone) === dayKey(now, timeZone)) {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date);
  }

  const yesterday = new Date(now.getTime() - 86_400_000);
  if (dayKey(date, timeZone) === dayKey(yesterday, timeZone)) return "Ayer";

  const sameYear =
    dayKey(date, timeZone).slice(0, 4) === dayKey(now, timeZone).slice(0, 4);
  return new Intl.DateTimeFormat("es-AR", {
    timeZone,
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  })
    .format(date)
    .replace(".", "");
}

/** Fecha completa para el encabezado del chat. */
export function formatConversationLongDate(iso: string, timeZone?: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}
