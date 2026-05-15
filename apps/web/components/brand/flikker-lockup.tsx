import { useId } from "react";

interface FlikkerLockupProps {
  compact?: boolean;
  tone?: "default" | "inverse";
  subtitle?: string | null;
  variant?: "horizontal" | "stacked" | "mark";
}

function FlikkerMark({
  tone = "default",
  compact = false,
}: {
  tone?: "default" | "inverse";
  compact?: boolean;
}) {
  const maskId = useId();
  const fill = tone === "inverse"  "#F4F6FF" : "#9188F5";
  const sizeClass = compact  "h-8 w-10" : "h-11 w-14";

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 108 78"
      className={`${sizeClass} shrink-0`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <mask id={maskId}>
        <rect width="108" height="78" fill="white" />
        <path d="M44 26 56 38 44 50 32 38 44 26Z" fill="black" />
      </mask>
      <g mask={`url(#${maskId})`} fill={fill}>
        <path d="M32 8 58 34 44 48 18 22 32 8Z" />
        <path d="M18 22 44 48 30 62 4 36 18 22Z" />
        <path d="M44 48 58 62 44 76 30 62 44 48Z" />
        <path d="M76 0 104 28 90 42 62 14 76 0Z" />
      </g>
    </svg>
  );
}

export default function FlikkerLockup({
  compact = false,
  tone = "default",
  subtitle = null,
  variant = "horizontal",
}: FlikkerLockupProps) {
  const titleColor =
    tone === "inverse"  "text-[#F4F6FF]" : "text-[color:var(--brand-primary)]";
  const subtitleColor =
    tone === "inverse"  "text-[#F4F6FF]/75" : "text-[color:var(--text-muted)]";

  if (variant === "mark") {
    return <FlikkerMark tone={tone} compact={compact} />;
  }

  if (variant === "stacked") {
    return (
      <div className="flex flex-col items-center text-center">
        <FlikkerMark tone={tone} compact={false} />
        <div
          className={`flikker-brand-text mt-3 ${compact  "text-3xl" : "text-5xl"} font-semibold leading-none ${titleColor}`}
        >
          Flikker
        </div>
        {subtitle  (
          <div className={`mt-2 text-xs leading-5 ${subtitleColor}`}>{subtitle}</div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`flex items-center ${compact  "gap-2.5" : "gap-3"}`}>
      <FlikkerMark tone={tone} compact={compact} />
      <div className="min-w-0">
        <div
          className={`flikker-brand-text ${compact  "text-2xl" : "text-4xl"} font-semibold leading-none ${titleColor}`}
        >
          Flikker
        </div>
        {subtitle  (
          <div className={`mt-1 text-xs leading-5 ${subtitleColor}`}>{subtitle}</div>
        ) : null}
      </div>
    </div>
  );
}
