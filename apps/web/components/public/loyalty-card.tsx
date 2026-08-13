"use client";

import { buildLoyaltyCardTheme } from "@/lib/loyalty-card-theme";
import RewardGoalStamps from "./reward-goal-stamps";

export interface LoyaltyCardAppearance {
  cardColor?: string | null;
  stampColor?: string | null;
  stampIcon?: string | null;
  logoUrl?: string | null;
  businessName?: string | null;
}

/**
 * La tarjeta de sellos, completa. Una sola implementación usada por las tres
 * superficies donde aparece: el check-in, Mi Flikker y la preview del panel.
 *
 * Que la preview sea literalmente este componente es lo que garantiza que el
 * dueño no pueda guardar una combinación que se vea distinta (o ilegible)
 * del lado del cliente.
 */
export default function LoyaltyCard({
  rewardName,
  progress,
  target,
  bonusStamps = 0,
  appearance,
}: {
  rewardName: string;
  progress: number;
  target: number;
  bonusStamps?: number;
  appearance: LoyaltyCardAppearance;
}) {
  const theme = buildLoyaltyCardTheme(
    appearance.cardColor,
    appearance.stampColor,
  );
  const remaining = Math.max(0, target - progress);
  const pct = Math.min(100, Math.round((progress / Math.max(1, target)) * 100));

  return (
    <div
      className="relative overflow-hidden rounded-[24px] p-5 shadow-[0_10px_24px_rgba(12,16,30,0.14)]"
      style={{ backgroundColor: theme.card, color: theme.text }}
    >
      <div className="flex items-center gap-3">
        {appearance.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={appearance.logoUrl}
            alt=""
            className="h-10 w-10 shrink-0 rounded-[10px] object-contain"
          />
        ) : null}
        <div className="min-w-0">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: theme.textMuted }}
          >
            Tu tarjeta
          </p>
          <p className="truncate text-sm font-bold" style={{ color: theme.text }}>
            {appearance.businessName ?? "Tu negocio"}
          </p>
        </div>
      </div>

      <p className="mt-4 text-sm font-semibold" style={{ color: theme.textMuted }}>
        {remaining === 0
          ? "¡Completaste tu tarjeta!"
          : remaining === 1
            ? "Te falta 1 sello para tu"
            : `Te faltan ${remaining} sellos para tu`}
      </p>
      <p
        className="mt-0.5 text-[20px] font-bold leading-tight"
        style={{ color: theme.text }}
      >
        {rewardName}
      </p>

      <div className="mt-4">
        <RewardGoalStamps
          progress={progress}
          target={target}
          cardColor={appearance.cardColor}
          stampColor={appearance.stampColor}
          icon={appearance.stampIcon}
        />
      </div>

      <div
        className="mt-4 h-2 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: theme.track }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: theme.accent }}
        />
      </div>
      <p className="mt-2 text-[11px] font-semibold" style={{ color: theme.textMuted }}>
        {progress} de {target} sellos
        {bonusStamps ? ` (incluye ${bonusStamps} por tu feedback)` : ""}
      </p>
    </div>
  );
}
