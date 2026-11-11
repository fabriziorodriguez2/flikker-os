"use client";

import { useId } from "react";

import {
  Check,
  Coffee,
  Crown,
  Flame,
  Gift,
  Heart,
  Leaf,
  Scissors,
  ShoppingBag,
  Sparkles,
  Star,
  Tag,
  Utensils,
  Wine,
  Zap,
} from "lucide-react";
import {
  buildLoyaltyCardTheme,
  bestContrastOn,
  normalizeHex,
  isStampIconKey,
  type StampIconKey,
} from "@/lib/loyalty-card-theme";

const ICONS: Record<StampIconKey, typeof Gift> = {
  gift: Gift,
  star: Star,
  coffee: Coffee,
  heart: Heart,
  check: Check,
  sparkles: Sparkles,
  flame: Flame,
  leaf: Leaf,
  wine: Wine,
  scissors: Scissors,
  bag: ShoppingBag,
  utensils: Utensils,
  zap: Zap,
  tag: Tag,
  crown: Crown,
};

/**
 * Grilla de sellos de la tarjeta. El QR y el resto de la composición viven en
 * `LoyaltyCard`; este componente se ocupa únicamente del progreso visual.
 *
 * Ningún color está fijo acá. Todos salen de `buildLoyaltyCardTheme`, que
 * mide la luminancia del fondo real de la tarjeta y elige el lado legible —
 * por eso funciona igual sobre una tarjeta oscura que sobre una clara. El
 * panel usa este mismo componente para la preview, así que lo que el dueño
 * ve mientras configura es exactamente lo que verá su cliente.
 */
export default function RewardGoalStamps({
  progress,
  target,
  /** Fondo real sobre el que se dibujan los sellos. */
  cardColor,
  stampAreaColor,
  /** Acento elegido por el dueño. Se ignora si no contrasta lo suficiente. */
  stampColor,
  icon,
}: {
  progress: number;
  target: number;
  cardColor?: string | null;
  stampAreaColor?: string | null;
  stampColor?: string | null;
  icon?: string | null;
}) {
  if (target <= 0 || target > 12) return null;

  const base = buildLoyaltyCardTheme(stampAreaColor ?? cardColor, stampColor);
  // A filled circle carries the exact configured color; its icon gets contrast
  // against that circle. Low contrast against the outer surface is harmless:
  // the circle outline and contrasting icon keep the stamp identifiable.
  const accent =
    normalizeHex(stampColor) ?? normalizeHex(cardColor) ?? base.accent;
  const theme = { ...base, accent, onAccent: bestContrastOn(accent) };
  const Icon = isStampIconKey(icon) ? ICONS[icon] : Gift;
  const customIcon = typeof icon === "string" && icon.startsWith("data:image/");
  const stamps = Array.from({ length: target }, (_, i) => i < progress);
  const columns = target <= 6 ? target : Math.ceil(target / 2);

  return (
    <div
      className="grid gap-x-2 gap-y-2.5"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      role="img"
      aria-label={`${Math.min(progress, target)} de ${target} sellos`}
    >
      {stamps.map((filled, i) => (
        <span
          key={i}
          data-stamp-state={filled ? "completed" : "empty"}
          /*
            `rounded-full` en LOS DOS estados: el círculo es el SLOT, no una
            decoración del sello conseguido. Antes el vacío era circular y el
            completado perdía el contenedor (`border-0`, sin fondo), así que
            la grilla mezclaba círculos con íconos sueltos flotando. Ahora
            cada posición es siempre el mismo círculo y lo único que cambia
            es qué hay adentro.
          */
          className="flex aspect-square min-w-0 items-center justify-center rounded-full transition-colors duration-300"
          style={
            filled
              ? {
                  // El círculo se pinta con el acento del NEGOCIO y el sello
                  // va encima en el color legible sobre ese acento. Un solo
                  // círculo: nunca círculo dentro de círculo.
                  backgroundColor: theme.accent,
                  color: theme.onAccent,
                  border: `1px solid ${theme.isDarkCard ? "#B7B9C233" : "#73768122"}`,
                }
              : {
                  borderWidth: 1.5,
                  borderStyle: "solid",
                  borderColor: theme.isDarkCard ? "#B7B9C2" : "#737681",
                  backgroundColor: "transparent",
                  color: theme.text,
                }
          }
        >
          {customIcon && !filled ? (
            <CustomStampOutline source={icon!} color={theme.text} />
          ) : customIcon ? (
            /*
              Sello propio del negocio (data:image). Mismo renderer de
              máscara de siempre — no hay un segundo camino de render para
              esto. Lo único que cambió es el color de la máscara: ahora va
              en `onAccent`, porque el círculo de abajo es `accent` y pintar
              la máscara del mismo color la haría desaparecer.
            */
            <span
              className="h-[56%] w-[56%]"
              aria-hidden="true"
              style={{
                backgroundColor: theme.onAccent,
                WebkitMaskImage: `url(${JSON.stringify(icon)})`,
                maskImage: `url(${JSON.stringify(icon)})`,
                WebkitMaskPosition: "center",
                maskPosition: "center",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
                WebkitMaskSize: "contain",
                maskSize: "contain",
              }}
            />
          ) : (
            <Icon
              className="h-[56%] w-[56%]"
              strokeWidth={filled ? 2.4 : 1.5}
              aria-hidden="true"
            />
          )}
        </span>
      ))}
    </div>
  );
}

/** The custom image remains the source. Morphological edges outline its alpha
 * silhouette, including interior holes, without replacing it with a stock icon.
 * SVG images cannot run embedded scripts in this image context.
 */
function CustomStampOutline({
  source,
  color,
}: {
  source: string;
  color: string;
}) {
  const filterId = `stamp-outline-${useId().replaceAll(":", "")}`;
  return (
    <svg
      viewBox="-2 -2 68 68"
      className="h-[56%] w-[56%]"
      aria-hidden="true"
      data-custom-stamp="outline"
    >
      <defs>
        <filter id={filterId} x="-10%" y="-10%" width="120%" height="120%">
          <feMorphology
            in="SourceAlpha"
            operator="dilate"
            radius="0.8"
            result="outer"
          />
          <feMorphology
            in="SourceAlpha"
            operator="erode"
            radius="0.6"
            result="inner"
          />
          <feComposite in="outer" in2="inner" operator="out" result="edge" />
          <feFlood floodColor={color} />
          <feComposite in2="edge" operator="in" />
        </filter>
      </defs>
      <image
        href={source}
        width="64"
        height="64"
        preserveAspectRatio="xMidYMid meet"
        filter={`url(#${filterId})`}
      />
    </svg>
  );
}
