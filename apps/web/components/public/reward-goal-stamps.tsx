"use client";

import { Gift } from "lucide-react";

/**
 * Compact punch-card grid. It intentionally has no QR: visits are added when
 * the customer scans at the business, so this card only communicates progress.
 * Large goals stay textual because a dense stamp grid stops being useful.
 */
export default function RewardGoalStamps({
  progress,
  target,
  brand,
}: {
  progress: number;
  target: number;
  brand: string;
}) {
  if (target <= 0 || target > 12) return null;

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
                  borderColor: "rgba(255,255,255,0.32)",
                  backgroundColor: "rgba(255,255,255,0.92)",
                  color: brand,
                }
              : {
                  borderColor: "rgba(255,255,255,0.18)",
                  backgroundColor: "rgba(0,0,0,0.12)",
                  color: "rgba(255,255,255,0.34)",
                }
          }
        >
          <Gift className="h-6 w-6" strokeWidth={filled ? 2.4 : 1.8} aria-hidden="true" />
        </span>
      ))}
    </div>
  );
}
