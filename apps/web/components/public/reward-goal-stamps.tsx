"use client";

/**
 * Generic circular stamps — one per visit needed toward the active reward
 * goal. Deliberately plain circles, no per-business logo: that was
 * explicitly optional in the pilot ask, and doing it well (fetching/cropping
 * a logo into a stamp shape) is real extra work for a visual the bar below
 * already conveys precisely. Only rendered for reasonably small targets —
 * beyond ~10, individual dots stop being a legible "collect them" visual
 * and the existing progress bar communicates it better on its own.
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
  if (target <= 0 || target > 10) return null;

  const stamps = Array.from({ length: target }, (_, i) => i < progress);

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="img"
      aria-label={`${Math.min(progress, target)} de ${target} sellos`}
    >
      {stamps.map((filled, i) => (
        <span
          key={i}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors duration-300"
          style={
            filled
              ? { borderColor: brand, backgroundColor: brand, color: "#fff" }
              : { borderColor: "#E3E5F0", backgroundColor: "transparent", color: "#B0B8C9" }
          }
        >
          {filled ? "✓" : ""}
        </span>
      ))}
    </div>
  );
}
