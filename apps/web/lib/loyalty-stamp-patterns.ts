/**
 * Fondo decorativo del área de sellos — CSS/SVG liviano, nunca una imagen.
 * Cada patrón es un tile chico (SVG como data URI) que CSS repite con
 * `background-repeat`, así que es responsive por construcción: no importa
 * el ancho/alto real del área ni la cantidad de sellos.
 *
 * El color SIEMPRE es el acento ya calculado por `buildLoyaltyCardTheme`
 * (nunca un color propio) — así el patrón arma automáticamente una variante
 * armoniosa con cualquier color de tarjeta que el dueño elija. La opacidad
 * efectiva nunca pasa `MAX_EFFECTIVE_OPACITY`: el patrón nunca puede volverse
 * tan intenso como para competir con la legibilidad de los sellos, aunque el
 * dueño suba la intensidad al máximo.
 */

export interface StampPatternOption {
  key: StampPatternKey;
  label: string;
}

export type StampPatternKey =
  | "none"
  | "waves"
  | "bubbles"
  | "arcs"
  | "curved-lines"
  | "organic"
  | "geometric"
  | "confetti";

export const STAMP_BACKGROUND_PATTERNS: StampPatternOption[] = [
  { key: "none", label: "Sin patrón" },
  { key: "waves", label: "Ondas suaves" },
  { key: "bubbles", label: "Círculos / burbujas" },
  { key: "arcs", label: "Arcos" },
  { key: "curved-lines", label: "Líneas curvas" },
  { key: "organic", label: "Formas orgánicas" },
  { key: "geometric", label: "Geométrico sutil" },
  { key: "confetti", label: "Confetti minimal" },
];

export function isStampPatternKey(value: unknown): value is StampPatternKey {
  return STAMP_BACKGROUND_PATTERNS.some((option) => option.key === value);
}

const MIN_EFFECTIVE_OPACITY = 0.04;
const MAX_EFFECTIVE_OPACITY = 0.34;

/**
 * `intensity` es 0-100 (lo que mueve el slider). Se mapea SIEMPRE dentro del
 * rango seguro — nunca puede llegar a un valor que dificulte leer el sello,
 * ni en el extremo 100.
 */
export function effectivePatternOpacity(intensity: number): number {
  const clamped = Math.min(100, Math.max(0, intensity));
  return (
    MIN_EFFECTIVE_OPACITY +
    (clamped / 100) * (MAX_EFFECTIVE_OPACITY - MIN_EFFECTIVE_OPACITY)
  );
}

/** Intensidad por defecto en modo "Automático" — un poco más visible sobre fondos oscuros. */
export function automaticPatternIntensity(isDarkCard: boolean): number {
  return isDarkCard ? 46 : 30;
}

function tile(
  size: number,
  colorHex: string,
  opacity: number,
  shapes: string,
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><g fill="none" stroke="${colorHex}" stroke-opacity="${opacity}">${shapes}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function filledTile(
  size: number,
  colorHex: string,
  opacity: number,
  shapes: string,
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><g fill="${colorHex}" fill-opacity="${opacity}">${shapes}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Data URI del tile (o `null` para `"none"`) — se usa tal cual como
 * `backgroundImage` CSS, con `backgroundRepeat: "repeat"` y
 * `backgroundSize: "<tileSize>px <tileSize>px"` (`tileSizeFor`).
 */
export function buildStampPatternDataUri(
  pattern: StampPatternKey,
  colorHex: string,
  opacity: number,
): string | null {
  switch (pattern) {
    case "none":
      return null;
    case "waves":
      return tile(
        64,
        colorHex,
        opacity,
        '<path d="M-8 12 Q8 -4 24 12 T56 12 T88 12" stroke-width="2.5"/>' +
          '<path d="M-8 40 Q8 24 24 40 T56 40 T88 40" stroke-width="2.5"/>',
      );
    case "bubbles":
      return filledTile(
        48,
        colorHex,
        opacity,
        '<circle cx="10" cy="12" r="5"/>' +
          '<circle cx="34" cy="8" r="3"/>' +
          '<circle cx="30" cy="34" r="7"/>' +
          '<circle cx="6" cy="38" r="2.5"/>',
      );
    case "arcs":
      return tile(
        56,
        colorHex,
        opacity,
        '<path d="M4 52 A48 48 0 0 1 52 4" stroke-width="2.5"/>' +
          '<path d="M-12 36 A48 48 0 0 1 36 -12" stroke-width="2"/>',
      );
    case "curved-lines":
      return tile(
        60,
        colorHex,
        opacity,
        '<path d="M-4 18 C 12 4, 42 32, 58 18" stroke-width="2"/>' +
          '<path d="M-4 46 C 12 32, 42 60, 58 46" stroke-width="2"/>',
      );
    case "organic":
      return filledTile(
        56,
        colorHex,
        opacity,
        '<path d="M14 4 C24 0 34 4 36 14 C40 24 34 34 24 36 C12 38 2 30 2 18 C2 10 6 6 14 4Z"/>',
      );
    case "geometric":
      return tile(
        32,
        colorHex,
        opacity,
        '<rect x="10" y="2" width="12" height="12" transform="rotate(45 16 8)" stroke-width="1.5"/>',
      );
    case "confetti":
      return filledTile(
        40,
        colorHex,
        opacity,
        '<rect x="4" y="6" width="4" height="2" transform="rotate(20 6 7)"/>' +
          '<circle cx="26" cy="10" r="1.6"/>' +
          '<rect x="18" y="26" width="4" height="2" transform="rotate(-30 20 27)"/>' +
          '<circle cx="34" cy="32" r="1.4"/>' +
          '<rect x="8" y="30" width="3" height="2" transform="rotate(60 9 31)"/>',
      );
  }
}

const TILE_SIZE: Record<StampPatternKey, number> = {
  none: 0,
  waves: 64,
  bubbles: 48,
  arcs: 56,
  "curved-lines": 60,
  organic: 56,
  geometric: 32,
  confetti: 40,
};

export function tileSizeFor(pattern: StampPatternKey): number {
  return TILE_SIZE[pattern];
}
