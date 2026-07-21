"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { SessionMembership } from "@/lib/auth";

interface SidebarProps {
  memberships: SessionMembership[];
  activeBusinessId: string | null;
  userName: string;
  isImpersonating: boolean;
}

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

const RetentionIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
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
  { href: "/dashboard/retention", label: "Retención", icon: <RetentionIcon /> },
  { href: "/dashboard/widgets", label: "Widget", icon: <WidgetIcon />, impersonatorOnly: true },
  { href: "/dashboard/qr", label: "QR", icon: <QrIcon />, onboardingKey: "qr", impersonatorOnly: true },
];

function isItemActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
}

export default function Sidebar(props: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Desktop: collapsed rail by default, expands to full width on hover.
  const [hovered, setHovered] = useState(false);
  const activeBusiness = props.memberships.find(
    (membership) => membership.businessId === props.activeBusinessId,
  );
  // Show labels/wordmark when the mobile drawer is open or the desktop rail is
  // hovered. On desktop mobileOpen is always false, so this equals `hovered`.
  const showFull = mobileOpen || hovered;

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

      {/* Desktop spacer — reserves the collapsed rail width so the fixed,
          hover-expanding sidebar overlays the content instead of pushing it. */}
      <div aria-hidden="true" className="hidden shrink-0 lg:block lg:w-[88px]" />

    <aside
      aria-label={`Navegación del panel${activeBusiness ? ` de ${activeBusiness.business.name}` : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`
        fixed top-0 left-0 z-50 flex h-full w-[min(280px,80vw)] flex-col
        border-r border-[#223247] bg-[#0D1B2A]
        transition-transform duration-[250ms] ease-in-out
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:z-40 lg:h-screen lg:translate-x-0 lg:transition-[width] lg:duration-200
        ${hovered ? "lg:w-[250px] lg:shadow-[8px_0_30px_rgba(0,0,0,0.35)]" : "lg:w-[88px]"}
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

      <div className={showFull ? "px-7 pt-4 lg:pt-6" : "px-5 pt-4 lg:pt-6"}>
        <div className={`flex items-center ${showFull ? "justify-start" : "justify-center"}`}>
          <Link
            href="/dashboard"
            aria-label="Ir al panel"
            className="inline-flex min-w-0 items-center"
          >
            <Image
              src={showFull ? "/flikker-wordmark-white.svg" : "/flikker-mark-white.svg"}
              alt="Flikker"
              width={showFull ? 148 : 44}
              height={44}
              priority
              className={`h-auto ${showFull ? "w-[122px]" : "w-[34px]"}`}
            />
          </Link>
        </div>
      </div>

      <nav className={`mt-8 flex flex-col gap-2 ${showFull ? "px-5" : "px-4"}`}>
        {MAIN_NAV_ITEMS.filter((item) => !item.impersonatorOnly || props.isImpersonating).map((item) => {
          const active = isItemActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              data-onboarding={item.onboardingKey}
              onMouseEnter={() => router.prefetch(item.href)}
              className={`flex min-h-11 items-center rounded-[8px] py-3 text-[15px] font-semibold transition-colors ${
                showFull ? "gap-3.5 px-4" : "justify-center px-2"
              } ${
                active
                  ? "bg-[#EEF0FB] text-[#5C6BC0]"
                  : "text-[#A7B0C1] hover:bg-[#16263A] hover:text-white"
              }`}
            >
              <span className={active ? "text-[#5C6BC0]" : "text-[#A7B0C1]"}>
                {item.icon}
              </span>
              {showFull ? (
                <span className="whitespace-nowrap">{item.label}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </aside>
    </>
  );
}
