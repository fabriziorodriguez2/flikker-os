"use client";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: () => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export default function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  label,
  className = "",
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onCheckedChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full outline-none transition-colors duration-150 ease-out focus-visible:ring-[3px] focus-visible:ring-[color:var(--panel-focus-ring)] disabled:cursor-not-allowed disabled:opacity-60 ${
        checked
          ? "bg-[color:var(--panel-success-text)]"
          : "bg-[color:var(--panel-border-strong)]"
      } ${className}`}
    >
      <span
        aria-hidden="true"
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-[color:var(--panel-surface)] shadow-sm transition-transform duration-150 ease-out ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}
