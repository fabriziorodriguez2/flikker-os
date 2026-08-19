/**
 * Tokens de la tarjeta de sellos, derivados por contraste.
 *
 * El problema que resuelve: los sellos se dibujan SOBRE la tarjeta, y la
 * tarjeta la elige el dueño. Cualquier color fijo (blanco, por ejemplo)
 * funciona sobre un fondo y desaparece sobre el otro. Acá no hay ningún
 * color de sello hardcodeado: todos salen de medir la luminancia del fondo
 * real y elegir el lado legible.
 *
 * Una sola fuente de verdad, usada por igual en la experiencia del cliente
 * (`RewardGoalStamps`) y en la preview del panel — así lo que el dueño ve
 * mientras configura es literalmente el mismo cálculo que verá su cliente.
 */

export const DEFAULT_CARD_COLOR = "#5C6BC0";

/** Blanco y tinta base. No son "el color del sello": son los dos extremos
 *  entre los que el contraste elige. */
const LIGHT = "#FFFFFF";
const DARK = "#171A2B";

export interface LoyaltyCardTheme {
  /** Fondo de la tarjeta. */
  card: string;
  /** Acento (relleno del sello conseguido, barra de progreso). */
  accent: string;
  /** Color del contenido DENTRO de un sello conseguido. */
  onAccent: string;
  /** Texto principal sobre la tarjeta. */
  text: string;
  /** Texto secundario sobre la tarjeta. */
  textMuted: string;
  /** Relleno de un sello vacío. */
  emptyFill: string;
  /** Borde de un sello vacío — siempre visible, nunca transparente. */
  emptyBorder: string;
  /** Contenido de un sello vacío. */
  emptyContent: string;
  /** Carril de la barra de progreso. */
  track: string;
  /** True cuando la tarjeta es oscura — útil para decidir sombras. */
  isDarkCard: boolean;
}

export function normalizeHex(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const value = hex.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(value)) return value.toUpperCase();
  // Forma corta (#ABC) — se expande en vez de descartarse.
  if (/^#[0-9A-Fa-f]{3}$/.test(value)) {
    const [, r, g, b] = value.toUpperCase().match(/^#(.)(.)(.)$/)!;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
}

function toRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/** Luminancia relativa WCAG. */
export function relativeLuminance(hex: string): number {
  const channels = toRgb(hex).map((raw) => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Ratio de contraste WCAG entre dos colores (1 = idénticos, 21 = máximo). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** De los candidatos, el que más contraste da contra el fondo. */
export function bestContrastOn(
  background: string,
  candidates: readonly string[] = [LIGHT, DARK],
): string {
  return candidates.reduce((best, candidate) =>
    contrastRatio(candidate, background) > contrastRatio(best, background)
      ? candidate
      : best,
  );
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = toRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Construye el set completo de tokens.
 *
 * `stampColor` es el acento que el dueño eligió (opcional). Nunca se usa
 * crudo: si no contrasta lo suficiente contra la tarjeta, se descarta en
 * favor del extremo legible. Es decir, el dueño puede elegir el acento pero
 * no puede volver su propia tarjeta ilegible.
 */
export function buildLoyaltyCardTheme(
  cardColor?: string | null,
  stampColor?: string | null,
): LoyaltyCardTheme {
  const card = normalizeHex(cardColor) ?? DEFAULT_CARD_COLOR;
  const isDarkCard = relativeLuminance(card) < 0.5;

  // El acento por defecto es simplemente el extremo que más contrasta.
  const fallbackAccent = bestContrastOn(card);
  const requested = normalizeHex(stampColor);
  // 3:1 es el mínimo WCAG para elementos gráficos no textuales — que es
  // exactamente lo que es un sello.
  const accent =
    requested && contrastRatio(requested, card) >= 3
      ? requested
      : fallbackAccent;

  return {
    card,
    accent,
    onAccent: bestContrastOn(accent),
    text: bestContrastOn(card),
    textMuted: isDarkCard ? rgba(LIGHT, 0.72) : rgba(DARK, 0.64),
    // El sello vacío se dibuja como un hueco en la tarjeta: un velo del
    // color contrario, suave, que existe en ambos fondos.
    emptyFill: isDarkCard ? rgba(LIGHT, 0.08) : rgba(DARK, 0.05),
    emptyBorder: isDarkCard ? rgba(LIGHT, 0.28) : rgba(DARK, 0.18),
    emptyContent: isDarkCard ? rgba(LIGHT, 0.45) : rgba(DARK, 0.32),
    track: isDarkCard ? rgba(LIGHT, 0.16) : rgba(DARK, 0.1),
    isDarkCard,
  };
}

/** Íconos disponibles para el sello. La clave se guarda en `loyaltyStampIcon`. */
export const STAMP_ICONS = [
  { key: "gift", label: "Regalo" },
  { key: "star", label: "Estrella" },
  { key: "coffee", label: "Café" },
  { key: "heart", label: "Corazón" },
  { key: "check", label: "Tilde" },
  { key: "sparkles", label: "Brillos" },
  { key: "flame", label: "Fuego" },
  { key: "leaf", label: "Hoja" },
  { key: "wine", label: "Copa" },
  { key: "scissors", label: "Tijera" },
  { key: "bag", label: "Bolsa" },
  { key: "utensils", label: "Comida" },
  { key: "zap", label: "Rayo" },
  { key: "tag", label: "Etiqueta" },
  { key: "crown", label: "Corona" },
] as const;

export type StampIconKey = (typeof STAMP_ICONS)[number]["key"];

export function isStampIconKey(value: unknown): value is StampIconKey {
  return STAMP_ICONS.some((icon) => icon.key === value);
}
