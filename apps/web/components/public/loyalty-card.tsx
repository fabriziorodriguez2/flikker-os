"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
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
  qrValue,
  appearance,
}: {
  rewardName: string;
  progress: number;
  target: number;
  bonusStamps?: number;
  qrValue?: string;
  appearance: LoyaltyCardAppearance;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
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
  const qrContent = qrValue ?? "https://flikker.site";

  useEffect(() => {
    let cancelled = false;
    const value = qrContent.startsWith("/")
      ? `${window.location.origin}${qrContent}`
      : qrContent;
    void QRCode.toDataURL(value, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#111318", light: "#FFFFFF" },
    }).then((dataUrl) => {
      if (!cancelled) setQrDataUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [qrContent]);

  return (
    <div
      className="relative w-full overflow-hidden rounded-[20px] shadow-[0_14px_32px_rgba(4,8,22,0.22)]"
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

      <header className="relative z-[1] flex min-h-[68px] items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {appearance.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={appearance.logoUrl}
              alt=""
              className="h-10 w-14 shrink-0 object-contain object-left"
            />
          ) : (
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-black uppercase"
              style={{ borderColor: `${textColor}66` }}
              aria-hidden="true"
            >
              {(appearance.businessName ?? "F").slice(0, 1)}
            </span>
          )}
          {appearance.showBusinessName !== false ? (
            <p className="truncate text-sm font-extrabold leading-tight">
              {appearance.businessName ?? "Tu negocio"}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] opacity-65">
            Sellos
          </p>
          <p className="mt-0.5 text-xl font-black leading-none">
            {Math.min(progress, target)}
            <span className="text-[11px] font-bold opacity-65">/{target}</span>
          </p>
        </div>
      </header>

      <div
        className="relative z-[1] px-4 py-3.5"
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

      <div className="relative z-[1] flex min-h-[112px] items-center justify-between gap-4 px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] opacity-65">
            Tu premio
          </p>
          <p className="mt-1 text-[19px] font-extrabold leading-[1.08]">
            {rewardName}
          </p>
        </div>

        <div className="shrink-0 rounded-[12px] bg-white p-1.5 shadow-[0_8px_20px_rgba(4,8,22,0.16)]">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="QR de acceso al programa"
              className="h-20 w-20"
            />
          ) : (
            <div className="h-20 w-20 animate-pulse rounded-[7px] bg-[#F0F1F5]" />
          )}
        </div>
      </div>
    </div>
  );
}
