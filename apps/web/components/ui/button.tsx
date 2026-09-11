import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-[color:var(--panel-accent)] text-white hover:bg-[color:var(--panel-accent-hover)]",
  secondary:
    "border-[color:var(--panel-border)] bg-[color:var(--panel-surface)] text-[color:var(--panel-text)] hover:border-[color:var(--panel-border-strong)] hover:bg-[color:var(--panel-surface-subtle)]",
  ghost:
    "border-transparent bg-transparent text-[color:var(--panel-text-secondary)] hover:bg-[color:var(--panel-surface-muted)] hover:text-[color:var(--panel-text)]",
  danger:
    "border-transparent bg-[color:var(--panel-danger-text)] text-white hover:opacity-90",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-xs",
  md: "h-9 gap-2 px-3.5 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  leadingIcon?: ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    loadingLabel,
    leadingIcon,
    disabled,
    className = "",
    children,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex shrink-0 items-center justify-center rounded-[var(--panel-radius-control)] border font-semibold outline-none transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-[color:var(--panel-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50 ${SIZE_CLASS[size]} ${VARIANT_CLASS[variant]} ${className}`}
    >
      {loading ? (
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        leadingIcon
      )}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
});

export default Button;
