import type { ReactNode } from "react";

interface SectionCardProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  tone?: "default" | "tinted";
  interactive?: boolean;
}

export default function SectionCard({
  title,
  description,
  action,
  children,
  tone = "default",
  interactive = false,
}: SectionCardProps) {
  return (
    <section
      className={`rounded-[16px] border p-5 md:p-6 ${
        tone === "tinted"
          ? "border-[#5C6BC0]/18 bg-white/82 shadow-[0_10px_28px_rgba(92,107,192,0.07)] backdrop-blur-sm"
          : "flikker-card"
      } ${
        interactive
          ? "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_38px_rgba(56,45,125,0.11)]"
          : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="text-xl font-semibold text-[color:var(--foreground)]">
            {title}
          </h2>
          {description ? (
            <p className="mt-1.5 text-sm leading-5 text-[color:var(--text-muted)]">
              {description}
            </p>
          ) : null}
        </div>

        {action ? <div className="flex items-center gap-2">{action}</div> : null}
      </div>

      <div className="mt-5">{children}</div>
    </section>
  );
}
