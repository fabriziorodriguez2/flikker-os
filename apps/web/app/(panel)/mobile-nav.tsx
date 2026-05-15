"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MAIN_NAV_ITEMS = [
  { href: "/dashboard", label: "Panel" },
  { href: "/dashboard/customers", label: "Clientes" },
  { href: "/dashboard/campaigns", label: "Campañas" },
  { href: "/dashboard/reviews", label: "Reseñas" },
  { href: "/dashboard/widgets", label: "Widget" },
];

export default function MobileNav() {
  const pathname = usePathname();
  const items = MAIN_NAV_ITEMS;

  return (
    <nav className="border-b border-[#E8EAF0] bg-white px-4 py-2.5 lg:hidden">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {items.map((item) => {
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
                  ? "bg-[#5C6BC0] text-white"
                  : "border border-[#E8EAF0] bg-white text-[#8891A4]"
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
