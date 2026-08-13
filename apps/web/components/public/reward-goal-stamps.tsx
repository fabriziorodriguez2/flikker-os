"use client";

import { Check, Coffee, Gift, Heart, Star } from "lucide-react";
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
  /** Acento elegido por el dueño. Se ignora si no contrasta lo suficiente. */
  stampColor,
  icon,
}: {
  progress: number;
  target: number;
  cardColor?: string | null;
  stampColor?: string | null;
  icon?: string | null;
}) {
  if (target <= 0 || target > 12) return null;

  const theme = buildLoyaltyCardTheme(cardColor, stampColor);
  const Icon = isStampIconKey(icon) ? ICONS[icon] : Gift;
  const stamps = Array.from({ length: target }, (_, i) => i < progress);

  return (
    <div
      className="grid grid-cols-3 gap-2.5 sm:grid-cols-4"
      role="img"
      aria-label={`${Math.min(progress, target)} de ${target} sellos`}
    >
      {stamps.map((filled, i) => (
        <span
          key={i}
          className="flex h-14 min-w-0 items-center justify-center rounded-[14px] border transition-colors duration-300"
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
          <Icon
            className="h-6 w-6"
            strokeWidth={filled ? 2.4 : 1.8}
            aria-hidden="true"
          />
        </span>
      ))}
    </div>
  );
}
