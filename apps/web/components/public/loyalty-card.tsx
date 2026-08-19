"use client";

import {
  buildLoyaltyCardTheme,
  contrastRatio,
  normalizeHex,
} from "@/lib/loyalty-card-theme";
import RewardGoalStamps from "./reward-goal-stamps";

export interface LoyaltyCardAppearance {
  cardColor?: string | null;
  textColor?: string | null;
  backgroundImage?: string | null;
  stampAreaColor?: string | null;
  stampColor?: string | null;
  stampIcon?: string | null;
  logoUrl?: string | null;
  businessName?: string | null;
  showBusinessName?: boolean;
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
  const requestedText = normalizeHex(appearance.textColor);
  const textColor =
    requestedText && contrastRatio(requestedText, theme.card) >= 4.5
      ? requestedText
      : theme.text;
  const remaining = Math.max(0, target - progress);
  const pct = Math.min(100, Math.round((progress / Math.max(1, target)) * 100));

  return (
    <div
      className="relative overflow-hidden rounded-[24px] p-5 shadow-[0_10px_24px_rgba(12,16,30,0.14)]"
      style={{ backgroundColor: theme.card, color: textColor }}
    >
      {appearance.backgroundImage ? (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-25"
          style={{
            backgroundImage: `url(${JSON.stringify(appearance.backgroundImage)})`,
          }}
          aria-hidden="true"
        />
      ) : null}
      <div className="relative z-[1] flex items-center gap-3">
        {appearance.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={appearance.logoUrl}
            alt=""
            className="h-10 w-10 shrink-0 rounded-[10px] object-contain"
          />
        ) : null}
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-70">
            Tu tarjeta
          </p>
          {appearance.showBusinessName !== false ? (
            <p className="truncate text-sm font-bold">
              {appearance.businessName ?? "Tu negocio"}
            </p>
          ) : null}
        </div>
      </div>

      <p className="relative z-[1] mt-4 text-sm font-semibold opacity-75">
        {remaining === 0
          ? "¡Completaste tu tarjeta!"
          : remaining === 1
            ? "Te falta 1 sello para tu"
            : `Te faltan ${remaining} sellos para tu`}
      </p>
      <p className="mt-0.5 text-[20px] font-bold leading-tight">{rewardName}</p>

      <div
        className={`relative z-[1] mt-4 ${appearance.stampAreaColor ? "rounded-[18px] p-3" : ""}`}
        style={{ backgroundColor: appearance.stampAreaColor ?? undefined }}
      >
        <RewardGoalStamps
          progress={progress}
          target={target}
          cardColor={appearance.cardColor}
          stampAreaColor={appearance.stampAreaColor}
          stampColor={appearance.stampColor}
          icon={appearance.stampIcon}
        />
      </div>

      <div
        className="relative z-[1] mt-4 h-2 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: theme.track }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: theme.accent }}
        />
      </div>
      <p className="relative z-[1] mt-2 text-[11px] font-semibold opacity-70">
        {progress} de {target} sellos
        {bonusStamps ? ` (incluye ${bonusStamps} por tu feedback)` : ""}
      </p>
    </div>
  );
}
