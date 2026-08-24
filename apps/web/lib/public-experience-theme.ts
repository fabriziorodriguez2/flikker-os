import {
  bestContrastOn,
  contrastRatio,
  normalizeHex,
  relativeLuminance,
} from "./loyalty-card-theme";

/**
 * Tema de la EXPERIENCIA PÚBLICA de un negocio.
 *
 * El color que el dueño elige en Programa → Configuración → Página de
 * inscripción (`Business.checkinBackgroundColor`) no es "el color de la
 * pantalla de registro": es el color de todo lo que el cliente ve después de
 * escanear el QR — registro, recuperación de perfil, check-in exitoso,
 * tarjeta de sellos, beneficios, premio desbloqueado y el detalle del
 * negocio en Mi Flikker. Antes solo lo aplicaba la primera pantalla, así que
 * el cliente pasaba del color de la marca al violeta genérico de Flikker en
 * el paso siguiente.
 *
 * El otro problema que resuelve: el texto sobre ese fondo estaba hardcodeado
 * en blanco. Sobre un fondo claro (que el selector permite elegir) quedaba
 * ilegible. Acá NO hay ningún color de texto fijo — todos salen de medir la
 * luminancia del fondo real, igual que ya hace `buildLoyaltyCardTheme` para
 * la tarjeta. El dueño elige su fondo; no puede volver ilegible su propia
 * pantalla.
 */

export const FLIKKER_FALLBACK_BRAND = "#5C6BC0";

const LIGHT = "#FFFFFF";
const DARK = "#171A2B";

export interface PublicExperienceTheme {
  /** Estilo listo para el contenedor raíz (color plano o degradado de marca). */
  background: React.CSSProperties;
  /** Texto principal sobre el fondo. */
  text: string;
  /** Texto secundario. */
  textMuted: string;
  /** Texto terciario (pie "Powered by Flikker"). */
  textSoft: string;
  /** Superficie de una card sobre el fondo. */
  surface: string;
  surfaceBorder: string;
  /** Relleno de un botón/acento primario y su contenido. */
  accent: string;
  onAccent: string;
  /** El color base efectivo del fondo — el que se mide para contrastar. */
  base: string;
  isDark: boolean;
}

function rgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * @param backgroundColor `Business.checkinBackgroundColor` — null = automático.
 * @param brandColor      `Business.primaryColor` (o la paleta extraída del logo).
 *
 * Con `backgroundColor` el fondo es plano y ese color manda. Sin él se
 * conserva exactamente el degradado de marca de siempre — ningún negocio que
 * no configuró nada cambia de aspecto.
 */
export function buildPublicExperienceTheme(
  backgroundColor?: string | null,
  brandColor?: string | null,
): PublicExperienceTheme {
  const custom = normalizeHex(backgroundColor);
  const brand = normalizeHex(brandColor) ?? FLIKKER_FALLBACK_BRAND;

  // Sin color propio, el fondo sigue siendo el degradado de marca. Para medir
  // contraste alcanza con el extremo más claro del degradado (el color de
  // marca): es el peor caso para texto claro.
  const base = custom ?? brand;
  const isDark = relativeLuminance(base) < 0.5;

  const background: React.CSSProperties = custom
    ? { backgroundColor: custom, backgroundImage: "none" }
    : {
        backgroundImage: `linear-gradient(145deg, ${brand} 0%, color-mix(in srgb, ${brand} 58%, #20233D) 100%)`,
      };

  const ink = bestContrastOn(base, [LIGHT, DARK]);
  const veil = isDark ? LIGHT : DARK;

  // El acento respeta la marca si de verdad se ve sobre este fondo; si no,
  // cae al extremo legible. 3:1 es el mínimo WCAG para un elemento gráfico.
  const accent =
    contrastRatio(brand, base) >= 3 ? brand : bestContrastOn(base, [LIGHT, DARK]);

  return {
    background,
    text: ink,
    textMuted: rgba(ink, 0.74),
    textSoft: rgba(ink, 0.5),
    surface: rgba(veil, isDark ? 0.1 : 0.06),
    surfaceBorder: rgba(veil, isDark ? 0.22 : 0.14),
    accent,
    onAccent: bestContrastOn(accent, [LIGHT, DARK]),
    base,
    isDark,
  };
}
