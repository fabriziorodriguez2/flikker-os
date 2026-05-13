type StatusVariant = "activo" | "inactivo" | "pendiente" | "error" | "pausa";

const VARIANT_CLASS: Record<StatusVariant, string> = {
  activo: "bg-[color:var(--success-bg)] text-[color:var(--success-text)]",
  inactivo: "bg-[color:var(--surface-muted)] text-[color:var(--text-muted)]",
  pendiente: "bg-[color:var(--warning-bg)] text-[color:var(--warning-text)]",
  error: "bg-[color:var(--danger-bg)] text-[color:var(--danger-text)]",
  pausa: "bg-[color:var(--warning-bg)] text-[color:var(--warning-text)]",
};

interface StatusBadgeProps {
  variant: StatusVariant;
  label: string;
}

export default function StatusBadge({ variant, label }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${VARIANT_CLASS[variant]}`}
    >
      {label}
    </span>
  );
}
