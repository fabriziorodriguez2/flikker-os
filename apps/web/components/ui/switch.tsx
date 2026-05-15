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
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-60 ${
        checked  "bg-[#5A9E1B]" : "bg-[#E5E7EB]"
      } ${className}`}
    >
      <span
        aria-hidden="true"
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(13,27,42,0.22)] transition-transform duration-150 ease-out ${
          checked  "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}
