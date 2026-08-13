import {
  DEFAULT_CARD_COLOR,
  bestContrastOn,
  buildLoyaltyCardTheme,
  contrastRatio,
  isStampIconKey,
} from "./loyalty-card-theme";

/** Mínimo WCAG para elementos gráficos no textuales — que es lo que es un sello. */
const MIN_GRAPHIC_CONTRAST = 3;

const CARDS = [
  "#1A1040", // muy oscuro
  "#5C6BC0", // medio
  "#0F766E",
  "#B4530A",
  "#F5F6FB", // muy claro
  "#FFFFFF", // blanco puro
  "#000000", // negro puro
];

describe("contrastRatio", () => {
  it("da 21 entre blanco y negro, y 1 contra sí mismo", () => {
    expect(Math.round(contrastRatio("#FFFFFF", "#000000"))).toBe(21);
    expect(contrastRatio("#5C6BC0", "#5C6BC0")).toBeCloseTo(1);
  });

  it("es simétrico", () => {
    expect(contrastRatio("#1A1040", "#FFFFFF")).toBeCloseTo(
      contrastRatio("#FFFFFF", "#1A1040"),
    );
  });
});

describe("bestContrastOn", () => {
  it("elige claro sobre fondo oscuro y oscuro sobre fondo claro", () => {
    expect(bestContrastOn("#000000")).toBe("#FFFFFF");
    expect(bestContrastOn("#FFFFFF")).toBe("#171A2B");
  });
});

describe("buildLoyaltyCardTheme — el sello nunca queda ilegible", () => {
  it.each(CARDS)(
    "el sello conseguido contrasta contra la tarjeta %s",
    (card) => {
      const theme = buildLoyaltyCardTheme(card);
      expect(contrastRatio(theme.accent, theme.card)).toBeGreaterThanOrEqual(
        MIN_GRAPHIC_CONTRAST,
      );
    },
  );

  it.each(CARDS)("el contenido del sello contrasta contra su relleno (%s)", (card) => {
    const theme = buildLoyaltyCardTheme(card);
    expect(contrastRatio(theme.onAccent, theme.accent)).toBeGreaterThanOrEqual(
      MIN_GRAPHIC_CONTRAST,
    );
  });

  it.each(CARDS)("el texto principal es legible sobre la tarjeta %s", (card) => {
    const theme = buildLoyaltyCardTheme(card);
    // 4.5:1 es el mínimo WCAG AA para texto normal.
    expect(contrastRatio(theme.text, theme.card)).toBeGreaterThanOrEqual(4.5);
  });

  it("invierte el relleno según la luminancia de la tarjeta", () => {
    const dark = buildLoyaltyCardTheme("#1A1040");
    const light = buildLoyaltyCardTheme("#F5F6FB");

    expect(dark.isDarkCard).toBe(true);
    expect(light.isDarkCard).toBe(false);
    // Tarjeta oscura → sello claro; tarjeta clara → sello oscuro.
    expect(dark.accent).toBe("#FFFFFF");
    expect(light.accent).toBe("#171A2B");
  });
});

describe("buildLoyaltyCardTheme — acento elegido por el dueño", () => {
  it("respeta el acento cuando contrasta lo suficiente", () => {
    const theme = buildLoyaltyCardTheme("#1A1040", "#FFAB76");
    expect(theme.accent).toBe("#FFAB76");
  });

  it("descarta un acento que dejaría el sello ilegible", () => {
    // Acento casi idéntico a la tarjeta: invisible.
    const theme = buildLoyaltyCardTheme("#1A1040", "#1B1142");
    expect(theme.accent).not.toBe("#1B1142");
    expect(contrastRatio(theme.accent, theme.card)).toBeGreaterThanOrEqual(
      MIN_GRAPHIC_CONTRAST,
    );
  });

  it("ignora un acento con formato inválido en vez de romperse", () => {
    const theme = buildLoyaltyCardTheme("#1A1040", "no-es-un-color");
    expect(theme.accent).toBe("#FFFFFF");
  });
});

describe("buildLoyaltyCardTheme — entradas ausentes o raras", () => {
  it("usa el color por defecto cuando no hay tarjeta configurada", () => {
    expect(buildLoyaltyCardTheme(null).card).toBe(DEFAULT_CARD_COLOR);
    expect(buildLoyaltyCardTheme(undefined).card).toBe(DEFAULT_CARD_COLOR);
    expect(buildLoyaltyCardTheme("").card).toBe(DEFAULT_CARD_COLOR);
  });

  it("acepta hex corto y lo normaliza", () => {
    expect(buildLoyaltyCardTheme("#000").card).toBe("#000000");
  });

  it("el sello vacío siempre tiene borde visible, nunca transparente", () => {
    for (const card of CARDS) {
      const theme = buildLoyaltyCardTheme(card);
      expect(theme.emptyBorder).toMatch(/^rgba\(/);
      expect(theme.emptyBorder).not.toMatch(/, 0\)$/);
    }
  });
});

describe("isStampIconKey", () => {
  it("acepta las claves conocidas y rechaza el resto", () => {
    expect(isStampIconKey("gift")).toBe(true);
    expect(isStampIconKey("star")).toBe(true);
    expect(isStampIconKey("cualquier-cosa")).toBe(false);
    expect(isStampIconKey(null)).toBe(false);
    expect(isStampIconKey(undefined)).toBe(false);
  });
});
