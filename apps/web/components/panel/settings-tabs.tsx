"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIsOwnerOrAdmin } from "@/app/(panel)/role-context";

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

export default function SettingsTabs() {
  const pathname = usePathname();
  const canManage = useIsOwnerOrAdmin();

  const visible = TABS.filter((tab) => !tab.managersOnly || canManage);

  return (
    <div
      role="tablist"
      aria-label="Secciones de configuración"
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
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
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
              active
                ? "border-[#5C6BC0] bg-[#EEF0FB] text-[#4A56A6]"
                : "border-[#E3E5F0] bg-white text-[#7F879C] hover:border-[#5C6BC0]"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
