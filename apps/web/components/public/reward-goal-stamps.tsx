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
 * Tarjeta de sellos. No tiene QR a propósito: los sellos se suman cuando el
 * cliente escanea en el local, así que esto solo comunica progreso.
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
      className="grid gap-2.5"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      role="img"
      aria-label={`${Math.min(progress, target)} de ${target} sellos`}
    >
      {stamps.map((filled, i) => (
        <span
          key={i}
          className="flex aspect-square min-w-0 items-center justify-center rounded-full border transition-colors duration-300"
          style={
            filled
              ? {
                  borderColor: theme.accent,
                  backgroundColor: theme.accent,
                  color: theme.onAccent,
                }
              : {
                  borderColor: theme.emptyBorder,
                  backgroundColor: theme.emptyFill,
                  color: theme.emptyContent,
                }
          }
        >
          {customIcon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={icon}
              alt=""
              className={`h-[52%] w-[52%] object-contain ${filled ? "" : "opacity-55"}`}
            />
          ) : (
            <Icon
              className="h-[48%] w-[48%]"
              strokeWidth={filled ? 2.4 : 1.8}
              aria-hidden="true"
            />
          )}
        </span>
      ))}
    </div>
  );
}
