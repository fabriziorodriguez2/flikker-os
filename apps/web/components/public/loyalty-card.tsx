"use client";

import {
  bestContrastOn,
  buildLoyaltyCardTheme,
  contrastRatio,
  normalizeHex,
  resolveLoyaltyStampAreaColor,
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
  const stampAreaColor = resolveLoyaltyStampAreaColor(
    appearance.cardColor,
    appearance.stampAreaColor,
  );
  const stampAreaText = bestContrastOn(stampAreaColor);
  const remaining = Math.max(0, target - progress);
  const pct = Math.min(100, Math.round((progress / Math.max(1, target)) * 100));
  const progressLabel = bonusStamps
    ? `${progress} de ${target} · incluye ${bonusStamps} extra`
    : `${progress} de ${target} sellos`;

  return (
    <div
      className="relative flex aspect-[3/5] min-h-[440px] w-full flex-col overflow-hidden rounded-[22px] shadow-[0_18px_42px_rgba(4,8,22,0.28)]"
      style={{ backgroundColor: theme.card, color: textColor }}
    >
      {appearance.backgroundImage ? (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{
            backgroundImage: `url(${JSON.stringify(appearance.backgroundImage)})`,
          }}
          aria-hidden="true"
        />
      ) : null}

      <header className="relative z-[1] flex min-h-[92px] items-center justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          {appearance.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={appearance.logoUrl}
              alt=""
              className="h-12 w-16 shrink-0 object-contain object-left"
            />
          ) : (
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-sm font-black uppercase"
              style={{ borderColor: `${textColor}66` }}
              aria-hidden="true"
            >
              {(appearance.businessName ?? "F").slice(0, 1)}
            </span>
          )}
          {appearance.showBusinessName !== false ? (
            <p className="truncate text-[15px] font-extrabold leading-tight">
              {appearance.businessName ?? "Tu negocio"}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] opacity-65">
            Sellos
          </p>
          <p className="mt-0.5 text-[23px] font-black leading-none">
            {Math.min(progress, target)}
            <span className="text-[11px] font-bold opacity-65">/{target}</span>
          </p>
        </div>
      </header>

      <div
        className="relative z-[1] shrink-0 px-4 py-5"
        style={{ backgroundColor: stampAreaColor, color: stampAreaText }}
      >
        <RewardGoalStamps
          progress={progress}
          target={target}
          cardColor={appearance.cardColor}
          stampAreaColor={stampAreaColor}
          stampColor={appearance.stampColor}
          icon={appearance.stampIcon}
        />
      </div>

      <div className="relative z-[1] flex flex-1 flex-col px-5 pb-5 pt-5">
        <p className="text-[9px] font-bold uppercase tracking-[0.16em] opacity-65">
          Tu premio
        </p>
        <p className="mt-1 text-[22px] font-extrabold leading-[1.08]">
          {rewardName}
        </p>

        <div
          className="mt-auto rounded-[15px] border px-4 py-3"
          style={{
            borderColor: `${textColor}33`,
            backgroundColor: `${textColor}0D`,
          }}
        >
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] opacity-60">
                Estado
              </p>
              <p className="mt-1 text-xs font-bold">
                {remaining === 0
                  ? "Recompensa desbloqueada"
                  : remaining === 1
                    ? "Falta 1 visita"
                    : `Faltan ${remaining} visitas`}
              </p>
            </div>
            <p className="text-right text-[11px] font-semibold opacity-70">
              {progressLabel}
            </p>
          </div>
          <div
            className="mt-3 h-1.5 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: theme.track }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, backgroundColor: theme.accent }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
