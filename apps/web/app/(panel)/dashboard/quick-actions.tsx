import Link from "next/link";
import { BarChart3, Gift, Megaphone, QrCode, Upload } from "lucide-react";

// Solo acciones que llevan a una pantalla real del producto — nada de
// atajos a features que no existen todavía.
const ACTIONS = [
  {
    href: "/dashboard/campaigns",
    label: "Nueva campaña",
    icon: Megaphone,
  },
  {
    href: "/dashboard/benefits",
    label: "Agregar beneficio",
    icon: Gift,
  },
  {
    href: "/dashboard/qr",
    label: "Generar/administrar QR",
    icon: QrCode,
  },
  {
    href: "/dashboard/customers",
    label: "Importar clientes",
    icon: Upload,
  },
  {
    href: "/dashboard/insights",
    label: "Ver insights",
    icon: BarChart3,
  },
] as const;

export default function QuickActions({
  hideCampaign = false,
}: {
  hideCampaign?: boolean;
}) {
  const visibleActions = hideCampaign
    ? ACTIONS.filter((action) => action.href !== "/dashboard/campaigns")
    : ACTIONS;

  return (
    <div
      className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${
        hideCampaign ? "lg:grid-cols-4" : "lg:grid-cols-5"
      }`}
    >
      {visibleActions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="flex flex-col items-center gap-2 rounded-[14px] border border-[#E8EAF0] bg-white p-4 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-[#5C6BC0]/30 hover:shadow-[0_10px_24px_rgba(92,107,192,0.1)]"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#EEF0FB] text-[#5C6BC0]">
            <action.icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-xs font-semibold leading-tight text-[#1A202C]">
            {action.label}
          </span>
        </Link>
      ))}
    </div>
  );
}
