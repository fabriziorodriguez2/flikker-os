"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIsOwnerOrAdmin } from "@/app/(panel)/role-context";
import { useIsCheckinV2 } from "@/app/(panel)/experience-context";
import { Building2, CreditCard } from "lucide-react";

/**
 * Barra de Configuración.
 *
 * Las cuatro pantallas que la componen ya existían y siguen viviendo en sus
 * rutas de siempre — Equipo, Sucursales e Integraciones no se reescribieron.
 * Lo único que se agregó es esta barra común, que las hace sentir una sola
 * sección y permite que el sidebar tenga una entrada en vez de cuatro.
 *
 * Los links que un OPERATOR no puede usar no se muestran: el backend los
 * rechaza igual, y ofrecer algo que después da 403 es peor que no ofrecerlo.
 * Esto es orientación, no seguridad — los guards siguen donde estaban.
 */

const TABS = [
  { href: "/dashboard/settings", label: "Negocio", managersOnly: true },
  { href: "/dashboard/members", label: "Equipo", managersOnly: true },
  { href: "/dashboard/branches", label: "Sucursales", managersOnly: true },
  {
    href: "/dashboard/integrations",
    label: "Integraciones",
    managersOnly: true,
  },
  {
    href: "/dashboard/settings/suscripcion",
    label: "Suscripción",
    managersOnly: true,
  },
  // La cuenta es de cada persona: cualquier miembro cambia su contraseña.
  { href: "/dashboard/settings/cuenta", label: "Cuenta", managersOnly: false },
];

export function resolveSettingsTabs(isCheckinV2: boolean, canManage: boolean) {
  const availableTabs = isCheckinV2
    ? TABS.filter((tab) =>
        ["/dashboard/settings", "/dashboard/settings/suscripcion"].includes(tab.href),
      )
    : TABS;

  return isCheckinV2
    ? availableTabs
    : availableTabs.filter((tab) => !tab.managersOnly || canManage);
}

export default function SettingsTabs() {
  const pathname = usePathname();
  const canManage = useIsOwnerOrAdmin();
  const isCheckinV2 = useIsCheckinV2();

  const visible = resolveSettingsTabs(isCheckinV2, canManage);

  return (
    <div
      role="tablist"
      aria-label="Secciones de configuración"
      className={
        isCheckinV2
          ? "flex w-fit rounded-[12px] bg-[#ECEEF4] p-1"
          : "-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      }
    >
      {visible.map((tab) => {
        // Exacto y no `startsWith`: si no, "Negocio" quedaría activo estando
        // en "Cuenta", que cuelga de la misma ruta.
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={active}
            className={
              isCheckinV2
                ? `inline-flex shrink-0 items-center gap-2 rounded-[9px] px-4 py-2 text-sm font-semibold ${
                    active
                      ? "bg-white text-[#4A56A6] shadow-[0_1px_4px_rgba(17,22,59,0.12)]"
                      : "text-[#7F879C] hover:bg-[#F5F3FF] hover:text-[#5C6BC0]"
                  }`
                : `shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                    active
                      ? "border-[#5C6BC0] bg-[#EEF0FB] text-[#4A56A6]"
                      : "border-[#E3E5F0] bg-white text-[#7F879C] hover:border-[#5C6BC0]"
                  }`
            }
          >
            {isCheckinV2 ? (
              tab.href === "/dashboard/settings" ? (
                <Building2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <CreditCard className="h-4 w-4" aria-hidden="true" />
              )
            ) : null}
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
