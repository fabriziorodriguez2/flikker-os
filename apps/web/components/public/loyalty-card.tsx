"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, Gift } from "lucide-react";
import QRCode from "qrcode";
import {
  bestContrastOn,
  buildLoyaltyCardTheme,
  contrastRatio,
  normalizeHex,
  resolveLoyaltyStampAreaColor,
} from "@/lib/loyalty-card-theme";
import {
  automaticPatternIntensity,
  buildStampPatternDataUri,
  effectivePatternOpacity,
  isStampPatternKey,
  tileSizeFor,
} from "@/lib/loyalty-stamp-patterns";
import PoweredByFlikker from "@/components/ui/powered-by-flikker";
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
  stampBackgroundPattern?: string | null;
  stampBackgroundOpacity?: number | null;
}

/** Navigation stays identical in the live experience and inert panel preview. */
export function LoyaltyCardActions({
  onSwitchAccount,
  loggingOut = false,
}: {
  onSwitchAccount?: () => void;
  loggingOut?: boolean;
}) {
  return (
    <>
      <Link
        href="/mi-flikker"
        className="inline-flex w-full items-center justify-center rounded-[14px] py-3 text-sm font-bold"
        style={{
          backgroundColor: "var(--pub-accent, #6A5DF0)",
          color: "var(--pub-on-accent, #FFFFFF)",
        }}
      >
        Mis lugares y premios
      </Link>
      <div className="mt-2 text-center">
        <button
          type="button"
          onClick={onSwitchAccount}
          disabled={loggingOut}
          className="rounded-full px-4 py-2 text-xs font-semibold text-[#5A5A6E] disabled:opacity-60"
        >
          {loggingOut ? "Cerrando…" : "Cambiar de cuenta"}
        </button>
      </div>
    </>
  );
}

/** Shared composition for the customer experience, saved card and live editor.
 * Slots contain existing benefits/challenges/actions; this component never
 * creates a goal, grants stamps or decides which benefits are available.
 */
export default function LoyaltyCard({
  rewardName,
  progress,
  target,
  qrValue,
  appearance,
  experience = false,
  compact = false,
  fill = true,
  visitStatus,
  customerName,
  visits,
  secondaryMessage,
  children,
  actions,
}: {
  rewardName: string | null;
  progress: number;
  target: number;
  bonusStamps?: number;
  qrValue?: string;
  appearance: LoyaltyCardAppearance;
  experience?: boolean;
  compact?: boolean;
  fill?: boolean;
  visitStatus?: string;
  customerName?: string;
  visits?: number;
  secondaryMessage?: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const theme = buildLoyaltyCardTheme(
    appearance.cardColor,
    appearance.stampColor,
  );
  const requestedText = normalizeHex(appearance.textColor);
  const headerText =
    requestedText && contrastRatio(requestedText, theme.card) >= 4.5
      ? requestedText
      : theme.text;
  // The page stays white. Explicit stamp-area/pattern settings remain scoped
  // to the stamps, never recolor the whole customer surface.
  const stampAreaColor = resolveLoyaltyStampAreaColor(
    appearance.cardColor,
    appearance.stampAreaColor,
  );
  const stampText = bestContrastOn(stampAreaColor);
  const stampAccent = normalizeHex(appearance.stampColor) ?? theme.card;
  const pattern = isStampPatternKey(appearance.stampBackgroundPattern)
    ? appearance.stampBackgroundPattern
    : "none";
  const patternIntensity =
    appearance.stampBackgroundOpacity ??
    automaticPatternIntensity(buildLoyaltyCardTheme(stampAreaColor).isDarkCard);
  const patternDataUri = buildStampPatternDataUri(
    pattern,
    stampAccent,
    effectivePatternOpacity(patternIntensity),
  );
  const businessName = appearance.businessName?.trim() || "Tu negocio";

  useEffect(() => {
    if (!qrValue) return;
    let cancelled = false;
    const value = qrValue.startsWith("/")
      ? `${window.location.origin}${qrValue}`
      : qrValue;
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
  }, [qrValue]);

  if (compact)
    return (
      <section
        data-loyalty-layout="compact"
        className="mb-5 overflow-hidden rounded-[22px] border border-[#E7E8F1]"
      >
        <div
          className="relative flex items-center justify-between gap-3 overflow-hidden px-4 py-3"
          style={{ backgroundColor: theme.card, color: headerText }}
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
          <div className="relative min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.15em]">
              Tu premio
            </p>
            <h2 className="mt-1 break-words text-base font-extrabold leading-tight">
              {rewardName}
            </h2>
          </div>
          <p className="relative shrink-0 font-extrabold">
            <span className="text-2xl">{Math.min(progress, target)}</span>
            <span className="text-xs">/{target}</span>
          </p>
        </div>
        <div
          className="px-4 py-4"
          style={{
            backgroundColor: stampAreaColor,
            color: stampText,
            backgroundImage: patternDataUri
              ? `url(${JSON.stringify(patternDataUri)})`
              : undefined,
            backgroundSize: `${tileSizeFor(pattern)}px`,
          }}
        >
          <RewardGoalStamps
            progress={progress}
            target={target}
            cardColor={theme.card}
            stampAreaColor={stampAreaColor}
            stampColor={appearance.stampColor}
            icon={appearance.stampIcon}
          />
          <p className="mt-3 text-xs">
            {progress >= target
              ? "Completaste tu tarjeta"
              : `Te ${target - progress === 1 ? "falta 1 sello" : `faltan ${target - progress} sellos`} para tu premio`}
          </p>
        </div>
      </section>
    );

  return (
    <section
      data-loyalty-layout={experience ? "experience" : "card"}
      className={`flex w-full min-w-0 flex-col overflow-hidden ${experience ? (fill ? "min-h-[100dvh]" : "min-h-full") : "rounded-[24px] border border-[#E7E8F1]"}`}
      style={{ backgroundColor: theme.card, color: "#171A2B" }}
    >
      <header
        className="relative flex min-h-[112px] shrink-0 items-center gap-3 overflow-hidden px-5 pb-9 pt-6"
        style={{ color: headerText }}
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
        {appearance.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={appearance.logoUrl}
            alt={businessName}
            className={`relative h-14 w-16 shrink-0 object-contain ${contrastRatio("#171A2B", theme.card) < 4.5 ? "rounded-lg bg-white p-1" : "object-left"}`}
          />
        ) : (
          <span
            data-business-fallback
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-lg font-bold"
            style={{ borderColor: `${headerText}66` }}
            aria-hidden="true"
          >
            {businessName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="relative min-w-0">
          <p className="break-words text-[13px] font-extrabold uppercase leading-snug tracking-[0.12em]">
            {businessName}
          </p>
        </div>
      </header>

      <div
        className="relative flex flex-1 flex-col rounded-t-[28px] bg-white px-5 pb-5"
        style={{ paddingTop: visitStatus ? 34 : 22 }}
      >
        {visitStatus ? (
          <div
            role="status"
            className="absolute -top-4 left-4 right-4 flex justify-center"
          >
            <div className="inline-flex max-w-full items-center gap-2 rounded-full bg-white px-3 py-2 shadow-[0_3px_12px_rgba(23,26,43,0.10)]">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#15845C] text-white">
                <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
              </span>
              <p className="text-[11px] font-bold leading-snug">
                {visitStatus}
              </p>
            </div>
          </div>
        ) : null}

        {customerName || visits !== undefined ? (
          <div className="mb-4 flex items-start justify-between gap-3">
            <h1 className="min-w-0 break-words text-sm font-bold">
              {customerName ? `Hola, ${customerName}` : "Tu tarjeta"}
            </h1>
            {visits !== undefined ? (
              <p className="shrink-0 pt-0.5 text-[11px] text-[#767689]">
                {visits} {visits === 1 ? "visita" : "visitas"}
              </p>
            ) : null}
          </div>
        ) : null}

        {target > 0 ? (
          <div
            className="relative overflow-hidden rounded-[18px] border border-[#E7E8F1] p-3.5"
            style={{ backgroundColor: stampAreaColor, color: stampText }}
          >
            {patternDataUri ? (
              <div
                className="absolute inset-0"
                aria-hidden="true"
                style={{
                  backgroundImage: `url("${patternDataUri}")`,
                  backgroundRepeat: "repeat",
                  backgroundSize: `${tileSizeFor(pattern)}px ${tileSizeFor(pattern)}px`,
                }}
              />
            ) : null}
            <div className="relative">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.18em]">
                  Sellos
                </p>
                <p className="text-xs">
                  <strong className="text-lg font-extrabold">
                    {Math.min(Math.max(progress, 0), target)}
                  </strong>{" "}
                  de {target}
                </p>
              </div>
              <RewardGoalStamps
                progress={progress}
                target={target}
                cardColor={theme.card}
                stampAreaColor={stampAreaColor}
                stampColor={stampAccent}
                icon={appearance.stampIcon}
              />
              {secondaryMessage ? (
                <p className="mt-3 text-[11px] leading-relaxed opacity-70">
                  {secondaryMessage}
                </p>
              ) : null}
            </div>
          </div>
        ) : secondaryMessage ? (
          <p className="text-xs leading-relaxed text-[#767689]">
            {secondaryMessage}
          </p>
        ) : null}

        {rewardName ? (
          <div className="mt-6 flex items-start justify-between gap-4 pb-6">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[#5A5A6E]">
                <Gift className="h-3 w-3" aria-hidden="true" /> Tu premio
              </p>
              <p
                data-loyalty-reward
                className="mt-2 break-words text-[30px] font-extrabold leading-[1.05] tracking-[-0.04em]"
              >
                {rewardName}
              </p>
            </div>
            {qrValue ? (
              <div className="shrink-0 rounded-xl border border-[#E7E8F1] bg-white p-1.5">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrDataUrl}
                    alt="QR de acceso al programa"
                    className="h-16 w-16"
                  />
                ) : (
                  <div className="h-16 w-16 animate-pulse rounded-lg bg-[#F0F1F5]" />
                )}
              </div>
            ) : null}
          </div>
        ) : null}
        {children}
        {actions ? <div className="mt-auto pt-8">{actions}</div> : null}
        {experience ? (
          <PoweredByFlikker className="mt-5 justify-center text-[10px] text-[#767689]" />
        ) : null}
      </div>
    </section>
  );
}
