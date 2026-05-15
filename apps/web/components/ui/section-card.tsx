import type { ReactNode } from "react";

interface SectionCardProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  tone?: "default" | "tinted";
}

export default function SectionCard({
  title,
  description,
  action,
  children,
  tone = "default",
}: SectionCardProps) {
  return (
    <section
      className={`rounded-[16px] border p-5 md:p-6 ${
        tone === "tinted"
           "border-[color:rgba(145,136,245,0.14)] bg-[color:rgba(145,136,245,0.04)]"
          : "flikker-card"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="text-xl font-semibold text-[color:var(--foreground)]">
            {title}
          </h2>
          {description  (
            <p className="mt-1.5 text-sm leading-5 text-[color:var(--text-muted)]">
              {description}
            </p>
          ) : null}
        </div>

        {action  <div className="flex items-center gap-2">{action}</div> : null}
      </div>

      <div className="mt-5">{children}</div>
    </section>
  );
}
