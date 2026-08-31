import {
  calendarDaysAgo,
  calendarDaysBetween,
  dayKeyInTimeZone,
  relativeDayLabel,
} from "./relative-day";

const UY = "America/Montevideo";

/**
 * Los casos que reportó el usuario, con datos reales de Uruguay (UTC-3).
 * El bug viejo (`Math.floor(elapsed / 24h)`) fallaba EXACTAMENTE en estos
 * tres: una visita de ayer 23:30 vista hoy a las 10:00 son 10,5 horas → 0 →
 * decía "Hoy"; anteayer 23:00 son ~35 h → 1 → decía "Ayer".
 */
describe("relativeDayLabel — alrededor de medianoche en America/Montevideo", () => {
  // Hoy = 2026-08-31 10:00 Uruguay = 13:00 UTC
  const now = new Date("2026-08-31T13:00:00.000Z");

  it("visita de HOY 00:30 Uruguay → 'Hoy'", () => {
    // 00:30 UY = 03:30 UTC del mismo día
    const visit = new Date("2026-08-31T03:30:00.000Z");
    expect(relativeDayLabel(visit, { now, timeZone: UY })).toBe("Hoy");
  });

  it("visita de AYER 23:30 Uruguay → 'Ayer' (antes decía 'Hoy')", () => {
    // 30/08 23:30 UY = 31/08 02:30 UTC — el día UTC ya cambió, el uruguayo no
    const visit = new Date("2026-08-31T02:30:00.000Z");
    expect(relativeDayLabel(visit, { now, timeZone: UY })).toBe("Ayer");
  });

  it("visita de ANTEAYER 23:00 Uruguay → 'Hace 2 días' (antes decía 'Ayer')", () => {
    // 29/08 23:00 UY = 30/08 02:00 UTC
    const visit = new Date("2026-08-30T02:00:00.000Z");
    expect(relativeDayLabel(visit, { now, timeZone: UY })).toBe("Hace 2 días");
  });

  it("visita de hoy a las 23:59 Uruguay, mirada a las 00:05 del día siguiente → 'Ayer'", () => {
    const lateNight = new Date("2026-08-31T02:59:00.000Z"); // 30/08 23:59 UY
    const justAfterMidnight = new Date("2026-08-31T03:05:00.000Z"); // 31/08 00:05 UY
    expect(
      relativeDayLabel(lateNight, { now: justAfterMidnight, timeZone: UY }),
    ).toBe("Ayer");
  });

  it("un instante 6 minutos antes, dentro del mismo día uruguayo → 'Hoy'", () => {
    const early = new Date("2026-08-31T03:01:00.000Z"); // 31/08 00:01 UY
    const now2 = new Date("2026-08-31T03:07:00.000Z"); // 31/08 00:07 UY
    expect(relativeDayLabel(early, { now: now2, timeZone: UY })).toBe("Hoy");
  });
});

describe("relativeDayLabel — contrato de la etiqueta", () => {
  const now = new Date("2026-08-31T13:00:00.000Z");

  it("sin fecha devuelve 'Nunca' (contrato que ya usaban Clientes/Inicio)", () => {
    expect(relativeDayLabel(null, { now, timeZone: UY })).toBe("Nunca");
    expect(relativeDayLabel(undefined, { now, timeZone: UY })).toBe("Nunca");
    expect(relativeDayLabel("", { now, timeZone: UY })).toBe("Nunca");
  });

  it("una fecha inválida no rompe la pantalla", () => {
    expect(relativeDayLabel("no-es-fecha", { now, timeZone: UY })).toBe(
      "Nunca",
    );
  });

  it("a partir de 30 días muestra la fecha, no 'Hace N días'", () => {
    const old = new Date("2026-06-15T13:00:00.000Z");
    const label = relativeDayLabel(old, { now, timeZone: UY });
    expect(label).not.toMatch(/Hace/);
    expect(label).toMatch(/jun/i);
  });

  it("una fecha futura (reloj desfasado) cae en 'Hoy', nunca en un absurdo", () => {
    const future = new Date("2026-09-05T13:00:00.000Z");
    expect(relativeDayLabel(future, { now, timeZone: UY })).toBe("Hoy");
  });

  it("`absoluteAfterDays` recorta antes cuando el llamador lo pide (Historial de Programa)", () => {
    const twoDaysAgo = new Date("2026-08-29T13:00:00.000Z");
    expect(
      relativeDayLabel(twoDaysAgo, { now, timeZone: UY, absoluteAfterDays: 2 }),
    ).toMatch(/ago/i);
  });
});

describe("dayKeyInTimeZone / calendarDaysBetween", () => {
  it("lee el día en el huso pedido, no en UTC", () => {
    // 31/08 02:30 UTC es todavía 30/08 en Uruguay
    const d = new Date("2026-08-31T02:30:00.000Z");
    expect(dayKeyInTimeZone(d, UY)).toBe("2026-08-30");
    expect(dayKeyInTimeZone(d, "UTC")).toBe("2026-08-31");
  });

  it("cuenta días de calendario, no períodos de 24 horas", () => {
    expect(calendarDaysBetween("2026-08-30", "2026-08-31")).toBe(1);
    expect(calendarDaysBetween("2026-08-31", "2026-08-31")).toBe(0);
    expect(calendarDaysBetween("2026-08-29", "2026-08-31")).toBe(2);
  });

  it("cruza fin de mes y fin de año sin sumar horas a mano", () => {
    expect(calendarDaysBetween("2026-08-31", "2026-09-01")).toBe(1);
    expect(calendarDaysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("calendarDaysAgo usa el huso indicado", () => {
    const now = new Date("2026-08-31T13:00:00.000Z");
    const yesterdayLateUy = new Date("2026-08-31T02:30:00.000Z");
    expect(calendarDaysAgo(yesterdayLateUy, { now, timeZone: UY })).toBe(1);
    // El mismo instante, leído en UTC, cae el mismo día → 0. Es justamente
    // la diferencia que hacía que el panel se corriera un día.
    expect(calendarDaysAgo(yesterdayLateUy, { now, timeZone: "UTC" })).toBe(0);
  });
});
