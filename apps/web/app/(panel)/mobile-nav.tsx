"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Inicio" },
  { href: "/dashboard/customers", label: "Pacientes" },
  { href: "/dashboard/campaigns", label: "Campañas" },
  { href: "/dashboard/reviews", label: "Reseñas" },
  { href: "/dashboard/widgets", label: "Prueba social" },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2.5 lg:hidden">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 rounded-full px-3 py-2 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-[color:var(--brand-primary)] text-white"
                  : "border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text-muted)]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
