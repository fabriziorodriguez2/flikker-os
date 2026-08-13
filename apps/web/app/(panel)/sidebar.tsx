"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { SessionMembership } from "@/lib/auth";
import BusinessLogo from "@/components/business/business-logo";
import GoogleLogo from "@/components/icons/google-logo";
import BusinessSelector from "./business-selector";
import LogoutButton from "./logout-button";

interface SidebarProps {
  memberships: SessionMembership[];
  activeBusinessId: string | null;
  userName: string;
  businessDisplayName: string | null;
  businessLogoUrl: string | null;
  isImpersonating: boolean;
  isCheckinV2: boolean;
  /** Rol en el negocio activo. Gobierna qué ítems se muestran. */
  role?: string | null;
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

const RetentionV2Icon = () => (
  <Icon>
    <path d="M9 3h6" />
    <path d="M10 3v5.2L5.5 16a2 2 0 0 0 1.7 3h9.6a2 2 0 0 0 1.7-3L14 8.2V3" />
    <path d="M8.5 14h7" />
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

const SettingsIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </Icon>
);

const CheckinIcon = () => (
  <Icon>
    <path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />
    <path d="m9 11 3 3 8-8" />
  </Icon>
);

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  onboardingKey?: string;
  impersonatorOnly?: boolean;
  checkinV2Only?: boolean;
  legacyOnly?: boolean;
  /** Solo para roles que pueden usarla. Omitido = la ve cualquier miembro. */
  roles?: string[];
}

export interface NavSection {
  /** `null` = sin encabezado (Inicio va suelto arriba de todo). */
  title: string | null;
  items: NavItem[];
}

const MANAGERS = ["OWNER", "ADMIN"];

/**
 * Navegación de un negocio en Check-in V2 — el producto tal como lo entiende
 * el dueño, agrupado por lo que quiere hacer y no por cómo está construido.
 *
 * Lo que NO está acá desapareció de la vista, no del código: Insights,
 * Beneficios, Campañas, Retención, Check-ins y Widget siguen existiendo como
 * rutas y responden con un redirect version-aware (ver
 * `components/panel/absorbed-route.tsx`). Un link viejo guardado en el
 * navegador sigue llevando a algún lado útil en vez de dar 404, y Platform
 * Admin conserva acceso durante impersonation.
 *
 * Cada superficie absorbida y dónde vive ahora:
 *   Insights      → Inicio (actividad) + Reseñas (reputación)
 *   Beneficios    → Programa
 *   Campañas      → Notificaciones · Promociones
 *   Retención V2  → Notificaciones
 *   Check-ins     → Clientes (actividad) + QR y NFC (puntos de acceso)
 */
const CHECKIN_V2_NAV: NavSection[] = [
  {
    title: null,
    items: [
      {
        href: "/dashboard",
        label: "Inicio",
        icon: <HomeIcon />,
        onboardingKey: "panel",
      },
    ],
  },
  {
    title: "Fidelización",
    items: [
      {
        href: "/dashboard/programa",
        label: "Programa",
        icon: <BenefitsIcon />,
        // Configurar el programa (sellos, recompensa, beneficios) es de quien
        // manda: el backend ya rechaza a OPERATOR, así que tampoco se muestra.
        roles: MANAGERS,
      },
      {
        href: "/dashboard/customers",
        label: "Clientes",
        icon: <CustomersIcon />,
        onboardingKey: "clientes",
      },
    ],
  },
  {
    title: "Comunicación",
    items: [
      {
        href: "/dashboard/notificaciones",
        label: "Notificaciones",
        icon: <RetentionV2Icon />,
        onboardingKey: "notificaciones",
      },
    ],
  },
  {
    title: "Reseñas",
    items: [
      {
        href: "/dashboard/reviews",
        label: "Reseñas",
        icon: <GoogleLogo className="h-[18px] w-[18px]" />,
      },
    ],
  },
  {
    title: "Negocio",
    items: [
      {
        href: "/dashboard/qr",
        label: "QR y NFC",
        icon: <QrIcon />,
        onboardingKey: "qr",
      },
      {
        href: "/dashboard/settings",
        label: "Configuración",
        icon: <SettingsIcon />,
      },
    ],
  },
];

/**
 * Navegación LEGACY — intacta a propósito.
 *
 * Estos negocios no tienen Programa, ni puntos de acceso, ni Retention V2, y
 * su operación diaria pasa por Campañas, Beneficios y la retención V1. La
 * limpieza fuerte es para Check-in V2; acá reordenar por reordenar solo
 * rompería la costumbre de gente que ya usa el panel.
 */
const LEGACY_NAV: NavSection[] = [
  {
    title: null,
    items: [
      {
        href: "/dashboard",
        label: "Panel",
        icon: <HomeIcon />,
        onboardingKey: "panel",
      },
      { href: "/dashboard/insights", label: "Insights", icon: <InsightsIcon /> },
      {
        href: "/dashboard/customers",
        label: "Clientes",
        icon: <CustomersIcon />,
        onboardingKey: "clientes",
      },
      {
        href: "/dashboard/campaigns",
        label: "Campañas",
        icon: <CampaignsIcon />,
        onboardingKey: "campaigns",
      },
      {
        href: "/dashboard/reviews",
        label: "Reseñas",
        icon: <GoogleLogo className="h-[18px] w-[18px]" />,
      },
      { href: "/dashboard/benefits", label: "Beneficios", icon: <BenefitsIcon /> },
      {
        href: "/dashboard/retention",
        label: "Retención",
        icon: <RetentionIcon />,
      },
      {
        href: "/dashboard/widgets",
        label: "Widget",
        icon: <WidgetIcon />,
        impersonatorOnly: true,
      },
      // Configuración se sacó del nav LEGACY a pedido explícito: no aporta
      // hoy a la operación diaria de esos negocios. La ruta sigue viva y
      // funciona por URL directa — solo dejó de tener una entrada visible.
      //
      // QR (el estudio de impresión mesa/mostrador/sticker/A4) sigue oculto
      // para el dueño LEGACY normal, pero vuelve durante impersonation: un
      // operador de Flikker sí lo necesita para soporte y demos con el
      // cliente. Mismo mecanismo que ya usa "Widget" un poco más arriba.
      {
        href: "/dashboard/qr",
        label: "QR",
        icon: <QrIcon />,
        impersonatorOnly: true,
      },
    ],
  },
];

/**
 * Herramientas internas. Solo aparecen durante impersonation, que es la única
 * forma en que un operador de Flikker entra a un negocio: el dueño nunca las
 * ve, y nosotros no perdemos acceso a nada.
 */
const OPERATOR_TOOLS: NavSection = {
  title: "Herramientas Flikker",
  items: [
    { href: "/dashboard/retention-v2", label: "Retention V2", icon: <RetentionV2Icon /> },
    { href: "/dashboard/checkins", label: "Check-ins", icon: <CheckinIcon /> },
    { href: "/dashboard/insights", label: "Insights", icon: <InsightsIcon /> },
    { href: "/dashboard/benefits", label: "Beneficios", icon: <BenefitsIcon /> },
    { href: "/dashboard/widgets", label: "Widget", icon: <WidgetIcon /> },
  ],
};

/** Secciones visibles según versión, rol e impersonation. */
export function resolveNavSections(options: {
  isCheckinV2: boolean;
  isImpersonating: boolean;
  role: string | null;
}): NavSection[] {
  const base = options.isCheckinV2 ? CHECKIN_V2_NAV : LEGACY_NAV;

  const sections = base
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          (!item.impersonatorOnly || options.isImpersonating) &&
          (!item.roles || (options.role !== null && item.roles.includes(options.role))),
      ),
    }))
    .filter((section) => section.items.length > 0);

  return options.isImpersonating ? [...sections, OPERATOR_TOOLS] : sections;
}

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
  const sections = resolveNavSections({
    isCheckinV2: props.isCheckinV2,
    isImpersonating: props.isImpersonating,
    role: props.role ?? null,
  });
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

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-[#18142E]/25 backdrop-blur-sm lg:hidden"
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
        fixed top-0 left-0 z-50 flex h-full w-[min(280px,80vw)] flex-col overflow-hidden
        border-r border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.78),rgba(235,237,255,0.52))]
        shadow-[12px_0_45px_rgba(56,45,125,0.16),inset_-1px_0_0_rgba(255,255,255,0.65)]
        backdrop-blur-[30px] backdrop-saturate-[175%]
        transition-transform duration-[250ms] ease-in-out
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:z-40 lg:h-screen lg:translate-x-0 lg:transition-[width] lg:duration-200
        ${hovered ? "lg:w-[250px] lg:shadow-[16px_0_55px_rgba(56,45,125,0.22),inset_-1px_0_0_rgba(255,255,255,0.72)]" : "lg:w-[88px]"}
      `}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-[#BDEEFF]/55 blur-[52px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-28 -right-24 h-72 w-72 rounded-full bg-[#BCAEFF]/45 blur-[58px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-3 top-2 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-90"
      />

      {/* Mobile close button */}
      <div className="relative flex items-center justify-end px-4 pt-4 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Cerrar menú"
          className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-[#716C82] hover:bg-white/55 hover:text-[#252037]"
        >
          <X aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>

      <div className={`relative ${showFull ? "px-7 pt-4 lg:pt-6" : "px-5 pt-4 lg:pt-6"}`}>
        <div className={`flex items-center ${showFull ? "justify-start" : "justify-center"}`}>
          <Link
            href="/dashboard"
            aria-label="Ir al panel"
            onClick={() => setMobileOpen(false)}
            className="inline-flex min-w-0 items-center"
          >
            <Image
              src={showFull ? "/flikker-wordmark.svg" : "/flikker-mark.svg"}
              alt="Flikker"
              width={showFull ? 148 : 44}
              height={44}
              priority
              className={`h-auto ${showFull ? "w-[122px]" : "w-[34px]"}`}
            />
          </Link>
        </div>
      </div>

      <nav className={`relative mt-8 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-3 ${showFull ? "px-5" : "px-4"}`}>
        {sections.map((section) => (
          <div key={section.title ?? "principal"} className="flex flex-col gap-2">
            {/*
              El encabezado solo existe con el rail expandido. Colapsado se
              convierte en un separador: un texto de 9px cortado no orienta a
              nadie, pero la agrupación sí se sigue leyendo.
            */}
            {section.title ? (
              showFull ? (
                <p className="mt-3 px-4 pb-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#9690A5]">
                  {section.title}
                </p>
              ) : (
                <span
                  aria-hidden="true"
                  className="mx-auto my-2 h-px w-6 bg-[#CFC9DD]"
                />
              )
            ) : null}

            {section.items.map((item) => {
              const active = isItemActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-onboarding={item.onboardingKey}
                  onClick={() => setMobileOpen(false)}
                  onMouseEnter={() => router.prefetch(item.href)}
                  className={`flex min-h-11 items-center rounded-[12px] border py-3 text-[15px] font-semibold transition-all duration-200 ${
                    showFull ? "gap-3.5 px-4" : "justify-center px-2"
                  } ${
                    active
                      ? "border-[#5C6BC0]/25 bg-[#5C6BC0] text-white shadow-[0_8px_22px_rgba(92,107,192,0.25),inset_0_1px_0_rgba(255,255,255,0.24)]"
                      : "border-transparent text-[#6F6A80] hover:border-white/70 hover:bg-white/55 hover:text-[#302A48] hover:shadow-[0_6px_18px_rgba(69,57,128,0.08)]"
                  }`}
                >
                  <span className={active ? "text-white" : "text-[#817B94]"}>
                    {item.icon}
                  </span>
                  {showFull ? (
                    <span className="whitespace-nowrap">{item.label}</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div
        className={`relative mt-auto border-t border-white/65 pb-5 pt-4 ${
          showFull ? "px-4" : "px-3"
        }`}
      >
        {props.businessDisplayName ? (
          <div
            className={`mb-2.5 flex min-h-12 items-center ${
              showFull ? "gap-3 px-3 py-2" : "justify-center px-1 py-2"
            }`}
          >
            <BusinessLogo
              logoUrl={props.businessLogoUrl}
              name={props.businessDisplayName}
              size="sm"
              className="border-white/80 bg-white/75"
            />
            {showFull ? (
              <div className="min-w-0 flex-1">
                {props.isImpersonating ? (
                  <p className="truncate text-sm font-semibold text-[#29243D]">
                    {props.businessDisplayName}
                  </p>
                ) : (
                  <BusinessSelector
                    memberships={props.memberships}
                    activeBusinessId={props.activeBusinessId}
                    activeBusinessName={props.businessDisplayName}
                    placement="top"
                  />
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {/*
          El link a Configuración vivía acá abajo como "Cuenta". Ahora es un
          ítem más de la sección Negocio, así que dejarlo duplicado daría dos
          entradas al mismo lugar.
        */}
        <div className="flex flex-col gap-1.5">
          <LogoutButton compact={!showFull} sidebar />
        </div>

        {showFull ? (
          <p className="mt-3 truncate px-3 text-[11px] text-[#9690A5]">
            {props.userName}
          </p>
        ) : null}
      </div>
    </aside>
    </>
  );
}
