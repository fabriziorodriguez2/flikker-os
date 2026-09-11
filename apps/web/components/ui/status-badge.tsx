import Badge, { type BadgeTone } from "./badge";

type StatusVariant = "activo" | "inactivo" | "pendiente" | "error" | "pausa";

const VARIANT_TONE: Record<StatusVariant, BadgeTone> = {
  activo: "success",
  inactivo: "neutral",
  pendiente: "warning",
  error: "danger",
  pausa: "warning",
};

interface StatusBadgeProps {
  variant: StatusVariant;
  label: string;
}

export default function StatusBadge({ variant, label }: StatusBadgeProps) {
  return <Badge tone={VARIANT_TONE[variant]}>{label}</Badge>;
}
