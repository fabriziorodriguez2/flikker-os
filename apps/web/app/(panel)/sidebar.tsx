"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { SessionMembership } from "@/lib/auth";

interface SidebarProps {
  memberships: SessionMembership[];
  activeBusinessId: string | null;
  userName: string;
  isImpersonating: boolean;
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

const BenefitsIcon = () => (
  <Icon>
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M12 8v13" />
    <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
    <path d="M12 8S10.5 4 8 4a2 2 0 0 0 0 4h4Z" />
    <path d="M12 8s1.5-4 4-4a2 2 0 0 1 0 4h-4Z" />
  </Icon>
);

const QrIcon = () => (
  <Icon>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h2v2h-2z" />
    <path d="M18 14h3" />
    <path d="M14 18h2" />
    <path d="M18 18h3" />
    <path d="M14 21v-2" />
    <path d="M21 18v3" />
  </Icon>
);

const InsightsIcon = () => (
  <Icon>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </Icon>
);

const MAIN_NAV_ITEMS: Array<{
  href: string;
  label: string;
  icon: ReactNode;
  onboardingKey?: string;
  impersonatorOnly?: boolean;
}> = [
  { href: "/dashboard", label: "Panel", icon: <HomeIcon />, onboardingKey: "panel" },
  { href: "/dashboard/insights", label: "Insights", icon: <InsightsIcon /> },
  { href: "/dashboard/customers", label: "Clientes", icon: <CustomersIcon />, onboardingKey: "clientes" },
  { href: "/dashboard/campaigns", label: "Campañas", icon: <CampaignsIcon />, onboardingKey: "campaigns" },
  { href: "/dashboard/reviews", label: "Reseñas", icon: <ReviewsIcon /> },
  { href: "/dashboard/benefits", label: "Beneficios", icon: <BenefitsIcon /> },
  { href: "/dashboard/widgets", label: "Widget", icon: <WidgetIcon />, impersonatorOnly: true },
  { href: "/dashboard/qr", label: "QR", icon: <QrIcon />, onboardingKey: "qr", impersonatorOnly: true },
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
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeBusiness = props.memberships.find(
    (membership) => membership.businessId === props.activeBusinessId,
  );
  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  // Listen for hamburger toggle events from the header
  useEffect(() => {
    function handleToggle() {
      setMobileOpen((v) => !v);
    }
    window.addEventListener("flikker:mobile-menu-toggle", handleToggle);
    return () =>
      window.removeEventListener("flikker:mobile-menu-toggle", handleToggle);
  }, []);

  // Close drawer on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

    <aside
      aria-label={`Navegación del panel${activeBusiness ? ` de ${activeBusiness.business.name}` : ""}`}
      className={`
        fixed top-0 left-0 z-50 flex h-full w-[min(280px,80vw)] flex-col
        border-r border-[#223247] bg-[#0D1B2A]
        transition-transform duration-[250ms] ease-in-out
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:sticky lg:z-auto lg:h-screen lg:translate-x-0 lg:transition-[width] lg:duration-200
        ${collapsed ? "lg:w-[88px]" : "lg:w-[250px]"}
        shrink-0
      `}
    >
      {/* Mobile close button */}
      <div className="flex items-center justify-end px-4 pt-4 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Cerrar menú"
          className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#A7B0C1] hover:text-white"
        >
          <X aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>

      <div className={collapsed ? "px-5 pt-4 lg:pt-6" : "px-7 pt-4 lg:pt-6"}>
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
        {MAIN_NAV_ITEMS.filter((item) => !item.impersonatorOnly || props.isImpersonating).map((item) => {
          const active = isItemActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              data-onboarding={item.onboardingKey}
              onMouseEnter={() => router.prefetch(item.href)}
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

      {/* Collapse toggle — desktop only */}
      <div className={`mt-auto hidden lg:block ${collapsed ? "px-4" : "px-5"} pb-4`}>
        <div className="border-t border-[#223247]/60 pt-2">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
            className={`group relative flex min-h-11 w-full cursor-pointer items-center rounded-[8px] py-3 text-[#A7B0C1] transition-colors hover:text-white ${
              collapsed ? "justify-center px-2" : "gap-3.5 px-4"
            }`}
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
            ) : (
              <PanelLeftClose aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
            )}
            {!collapsed ? (
              <span className="text-[15px] font-semibold">Colapsar menú</span>
            ) : null}
            {collapsed ? <SidebarTooltip label="Expandir menú" /> : null}
          </button>
        </div>
      </div>
    </aside>
    </>
  );
}
