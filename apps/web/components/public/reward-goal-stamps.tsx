"use client";

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

  const theme = buildLoyaltyCardTheme(stampAreaColor ?? cardColor, stampColor);
  const Icon = isStampIconKey(icon) ? ICONS[icon] : Gift;
  const customIcon = typeof icon === "string" && icon.startsWith("data:image/");
  const stamps = Array.from({ length: target }, (_, i) => i < progress);
  const columns = Math.min(target, 5);

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
          className={`flex aspect-square min-w-0 items-center justify-center transition-colors duration-300 ${
            filled ? "border-0" : "rounded-full border-[1.5px]"
          }`}
          style={
            filled
              ? {
                  color: theme.accent,
                }
              : {
                  borderColor: theme.emptyBorder,
                  backgroundColor: theme.emptyFill,
                  color: theme.emptyContent,
                }
          }
        >
          {!filled ? (
            <span className="text-[11px] font-semibold tabular-nums opacity-75">
              {String(i + 1).padStart(2, "0")}
            </span>
          ) : customIcon ? (
            <span
              className="h-[70%] w-[70%]"
              aria-hidden="true"
              style={{
                backgroundColor: theme.accent,
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
              className="h-[70%] w-[70%]"
              strokeWidth={2.6}
              aria-hidden="true"
            />
          )}
        </span>
      ))}
    </div>
  );
}
