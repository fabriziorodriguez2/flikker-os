import type { SVGProps } from "react";

function FlikkerMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 516.34 402.58"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <polygon
        fill="currentColor"
        points="169.64 200.96 214.33 149.16 173.32 101.62 0 302.58 86.22 402.58 173.32 301.6 260.42 402.58 346.69 302.58 300.58 249.13 255.86 300.95 169.64 200.96"
      />
      <polygon
        fill="currentColor"
        points="430.11 300.95 516.34 200.96 342.99 0 214.33 149.16 300.58 249.13 342.99 199.96 430.11 300.95"
      />
    </svg>
  );
}

interface PoweredByFlikkerProps {
  className?: string;
}

export default function PoweredByFlikker({ className }: PoweredByFlikkerProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 ${className ?? ""}`}
      aria-label="Powered by Flikker"
    >
      <span aria-hidden="true">Powered by</span>
      <FlikkerMark className="h-[0.85em] w-auto shrink-0 opacity-80" />
      <span aria-hidden="true" className="font-semibold tracking-tight">
        Flikker
      </span>
    </span>
  );
}
