import Link, { type LinkProps } from "next/link";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

type TabsVariant = "underline" | "segmented";

export function TabsList({
  variant = "underline",
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: TabsVariant }) {
  return (
    <div
      {...props}
      role="tablist"
      data-variant={variant}
      className={`flex max-w-full overflow-x-auto ${
        variant === "underline"
          ? "gap-5 border-b border-[color:var(--panel-border)]"
          : "w-fit gap-1 rounded-[var(--panel-radius-card)] bg-[color:var(--panel-surface-muted)] p-1"
      } ${className}`}
    />
  );
}

function tabClass(active: boolean, variant: TabsVariant) {
  if (variant === "segmented") {
    return `h-8 rounded-[var(--panel-radius-control)] px-3 text-sm font-medium ${
      active
        ? "bg-[color:var(--panel-surface)] text-[color:var(--panel-text)] ring-1 ring-[color:var(--panel-border)]"
        : "text-[color:var(--panel-text-muted)] hover:text-[color:var(--panel-text)]"
    }`;
  }

  return `relative h-10 shrink-0 border-b-2 px-0.5 text-sm font-medium ${
    active
      ? "border-[color:var(--panel-accent)] text-[color:var(--panel-text)]"
      : "border-transparent text-[color:var(--panel-text-muted)] hover:text-[color:var(--panel-text)]"
  }`;
}

export function TabButton({
  active,
  variant = "underline",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active: boolean;
  variant?: TabsVariant;
}) {
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      role="tab"
      aria-selected={active}
      className={`outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[color:var(--panel-focus-ring)] ${tabClass(active, variant)} ${className}`}
    />
  );
}

export function TabLink({
  active,
  variant = "underline",
  className = "",
  children,
  ...props
}: LinkProps & {
  active: boolean;
  variant?: TabsVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      {...props}
      role="tab"
      aria-selected={active}
      className={`inline-flex items-center outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[color:var(--panel-focus-ring)] ${tabClass(active, variant)} ${className}`}
    >
      {children}
    </Link>
  );
}
