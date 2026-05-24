"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { SessionMembership } from "@/lib/auth";

interface SidebarProps {
  memberships: SessionMembership[];
  activeBusinessId: string | null;
  userName: string;
}

const SIDEBAR_STORAGE_KEY = "flikker-panel-sidebar-collapsed";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-[18px] w-[18px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const HomeIcon = () => (
  <Icon>
    <path d="M3 10.5 12 4l9 6.5" />
    <path d="M5 9.5V20h14V9.5" />
  </Icon>
);

const CustomersIcon = () => (
  <Icon>
    <circle cx="9" cy="8" r="3" />
    <path d="M4.5 20a4.5 4.5 0 0 1 9 0" />
    <path d="M16 11a2.5 2.5 0 1 0 0-5" />
    <path d="M14.5 20a3.5 3.5 0 0 1 5.5 0" />
  </Icon>
);

const CampaignsIcon = () => (
  <Icon>
    <path d="M4 15.5V8.5" />
    <path d="M4 9h8l5-3v12l-5-3H4" />
  </Icon>
);

const ReviewsIcon = () => (
  <Icon>
    <path d="M12 17.3 6.1 20l1.1-6.3L2.5 9.1l6.4-.9L12 2.5l3.1 5.7 6.4.9-4.7 4.6 1.1 6.3z" />
  </Icon>
);

const WidgetIcon = () => (
  <Icon>
    <path d="m8 9-4 3 4 3" />
    <path d="m16 9 4 3-4 3" />
  </Icon>
);

const IntegrationsIcon = () => (
  <Icon>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </Icon>
);

const MAIN_NAV_ITEMS = [
  { href: "/dashboard", label: "Panel", icon: <HomeIcon /> },
  { href: "/dashboard/customers", label: "Clientes", icon: <CustomersIcon /> },
  { href: "/dashboard/campaigns", label: "Campañas", icon: <CampaignsIcon /> },
  { href: "/dashboard/reviews", label: "Reseñas", icon: <ReviewsIcon /> },
  { href: "/dashboard/widgets", label: "Widget", icon: <WidgetIcon /> },
  { href: "/dashboard/integrations", label: "Integraciones", icon: <IntegrationsIcon /> },
];

function isItemActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
}

function SidebarTooltip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-40 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-[8px] border border-[#E8EAF0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1A202C] opacity-0 shadow-[0_10px_24px_rgba(13,27,42,0.14)] transition-all group-hover:translate-x-0 group-hover:opacity-100">
      {label}
    </span>
  );
}

export default function Sidebar(props: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
  });
  const activeBusiness = props.memberships.find(
    (membership) => membership.businessId === props.activeBusinessId,
  );
  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  return (
    <aside
      aria-label={`Navegación del panel${activeBusiness ? ` de ${activeBusiness.business.name}` : ""}`}
      className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-[#223247] bg-[#0D1B2A] transition-[width] duration-200 lg:flex ${
        collapsed ? "w-[88px]" : "w-[250px]"
      }`}
    >
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        aria-label={collapsed ? "Abrir sidebar" : "Cerrar sidebar"}
        className="absolute right-0 top-1/2 z-30 inline-flex h-9 w-9 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[10px] border border-[#223247] bg-[#0D1B2A] text-[#A7B0C1] transition-colors hover:bg-[#16263A] hover:text-white"
      >
        {collapsed ? (
          <ChevronRight aria-hidden="true" className="h-[18px] w-[18px]" />
        ) : (
          <ChevronLeft aria-hidden="true" className="h-[18px] w-[18px]" />
        )}
      </button>

      <div className={collapsed ? "px-5 pt-6" : "px-7 pt-6"}>
        <div className={`flex items-center ${collapsed ? "justify-center" : "justify-start"}`}>
          <Link
            href="/dashboard"
            aria-label="Ir al panel"
            className="inline-flex min-w-0 items-center"
          >
            <Image
              src={collapsed ? "/flikker-mark-white.svg" : "/flikker-wordmark-white.svg"}
              alt="Flikker"
              width={collapsed ? 44 : 148}
              height={collapsed ? 44 : 44}
              priority
              className={`h-auto ${collapsed ? "w-[34px]" : "w-[122px]"}`}
            />
          </Link>
        </div>
      </div>

      <nav className={`mt-8 flex flex-col gap-2 ${collapsed ? "px-4" : "px-5"}`}>
        {MAIN_NAV_ITEMS.map((item) => {
          const active = isItemActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex min-h-11 items-center rounded-[8px] py-3 text-[15px] font-semibold transition-colors ${
                collapsed ? "justify-center px-2" : "gap-3.5 px-4"
              } ${
                active
                  ? "bg-[#EEF0FB] text-[#5C6BC0]"
                  : "text-[#A7B0C1] hover:bg-[#16263A] hover:text-white"
              }`}
            >
              <span className={active ? "text-[#5C6BC0]" : "text-[#A7B0C1]"}>
                {item.icon}
              </span>
              {!collapsed ? item.label : null}
              {collapsed ? <SidebarTooltip label={item.label} /> : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto" />
    </aside>
  );
}
