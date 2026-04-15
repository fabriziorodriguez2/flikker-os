'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import BusinessSelector from './business-selector';
import type { SessionMembership } from '@/lib/auth';
import BrandMark from '@/components/brand/brand-mark';
import BrandWordmark from '@/components/brand/brand-wordmark';

interface SidebarProps {
  memberships: SessionMembership[];
  activeBusinessId: string | null;
  userName: string;
  isPlatformAdmin?: boolean;
}

const SIDEBAR_STORAGE_KEY = 'flikker-sidebar-collapsed';

function Icon({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-[18px] w-[18px] shrink-0 ${className}`}
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

const WidgetsIcon = () => (
  <Icon>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </Icon>
);

const SettingsIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7.6 7.6 0 0 0-1.7-1l-.3-2.6h-4l-.3 2.6a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7.6 7.6 0 0 0 1.7 1l.3 2.6h4l.3-2.6a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5c.1-.3.1-.7.1-1Z" />
  </Icon>
);

const BranchesIcon = () => (
  <Icon>
    <path d="M4 20V6l5-2v16" />
    <path d="M9 20V10l6-2v12" />
    <path d="M15 20v-7l5-2v9" />
    <path d="M4 20h16" />
  </Icon>
);

const TeamIcon = () => (
  <Icon>
    <circle cx="9" cy="8" r="2.5" />
    <circle cx="16.5" cy="9.5" r="2" />
    <path d="M4.5 19a4.5 4.5 0 0 1 9 0" />
    <path d="M13.5 19a3.5 3.5 0 0 1 6 0" />
  </Icon>
);

const PlatformIcon = () => (
  <Icon>
    <path d="M12 3 5 6v5c0 4.2 2.9 8 7 10 4.1-2 7-5.8 7-10V6l-7-3Z" />
    <path d="M9.5 12 11 13.5l3.5-4" />
  </Icon>
);

const PanelCollapseIcon = () => (
  <Icon>
    <path d="m14.5 6.5 5 5.5-5 5.5" />
    <path d="M4.5 4.5v15" />
  </Icon>
);

const PanelExpandIcon = () => (
  <Icon>
    <path d="m9.5 6.5-5 5.5 5 5.5" />
    <path d="M19.5 4.5v15" />
  </Icon>
);

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Inicio', icon: <HomeIcon /> },
  { href: '/dashboard/campaigns', label: 'Campañas', icon: <CampaignsIcon /> },
  { href: '/dashboard/reviews', label: 'Reseñas', icon: <ReviewsIcon /> },
  { href: '/dashboard/widgets', label: 'Widgets', icon: <WidgetsIcon /> },
  { href: '/dashboard/settings', label: 'Configuración', icon: <SettingsIcon /> },
];

const SECONDARY_ITEMS = [
  { href: '/dashboard/branches', label: 'Sucursales', icon: <BranchesIcon /> },
  { href: '/dashboard/members', label: 'Equipo', icon: <TeamIcon /> },
];

function SidebarTooltip({
  label,
}: {
  label: string;
}) {
  return (
    <span className="flikker-glass-tooltip pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-30 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium text-[color:var(--foreground)] opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100">
      {label}
    </span>
  );
}

function itemClass(isActive: boolean, collapsed: boolean) {
  return `group relative flex items-center rounded-xl transition-colors ${
    collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
  } ${
    isActive
      ? 'bg-[color:var(--brand-primary)] text-white'
      : 'text-[color:var(--text-muted)] hover:bg-[color:var(--surface)] hover:text-[color:var(--foreground)]'
  }`;
}

function NavItem({
  href,
  label,
  icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link href={href} className={itemClass(active, collapsed)}>
      <span
        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
          active
            ? 'bg-white/14 text-white'
            : 'bg-[color:var(--surface-muted)] text-[color:var(--text-soft)]'
        }`}
      >
        {icon}
      </span>
      {!collapsed ? <span className="truncate text-sm font-medium">{label}</span> : null}
      <SidebarTooltip label={label} />
    </Link>
  );
}

function SidebarActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="flikker-control-subtle inline-flex w-10 items-center justify-center px-0 hover:border-[color:var(--brand-accent)] hover:bg-[color:var(--surface-muted)] hover:text-[color:var(--brand-accent)]"
      >
        {children}
      </button>
      <SidebarTooltip label={label} />
    </div>
  );
}

export default function Sidebar({
  memberships,
  activeBusinessId,
  userName,
  isPlatformAdmin,
}: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
  });

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  const activeBusiness = memberships.find(
    (m) => m.businessId === activeBusinessId,
  );

  return (
    <aside
      className={`flikker-sidebar-glow sticky top-0 hidden h-screen shrink-0 overflow-hidden border-r border-[color:var(--border)] transition-[width] duration-200 lg:flex lg:flex-col ${
        collapsed ? 'w-[76px]' : 'w-[236px]'
      }`}
    >
      <div className={`${collapsed ? 'px-3 py-5' : 'px-5 py-5'}`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between gap-3'}`}>
          {collapsed ? (
            <BrandMark width={56} height={44} className="h-auto w-[28px]" />
          ) : (
            <BrandWordmark width={196} height={60} className="h-auto w-[136px]" />
          )}
          {!collapsed ? (
            <SidebarActionButton label="Colapsar menú" onClick={() => setCollapsed(true)}>
              <PanelCollapseIcon />
            </SidebarActionButton>
          ) : null}
        </div>

        {collapsed ? (
          <div className="mt-4 flex justify-center">
            <SidebarActionButton label="Expandir menú" onClick={() => setCollapsed(false)}>
              <PanelExpandIcon />
            </SidebarActionButton>
          </div>
        ) : (
          <div className="mt-5 rounded-[16px] border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-3">
            <BusinessSelector
              memberships={memberships}
              activeBusinessId={activeBusinessId}
              activeBusinessName={activeBusiness?.business.name ?? null}
            />
          </div>
        )}
      </div>

      <div className="flikker-scrollbar-hidden min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(item.href);

            return (
              <NavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActive}
                collapsed={collapsed}
              />
            );
          })}
        </nav>

        <nav className="mt-6 flex flex-col gap-1">
          {SECONDARY_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href);

            return (
              <NavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActive}
                collapsed={collapsed}
              />
            );
          })}
        </nav>

        {isPlatformAdmin ? (
          <div className="mt-6">
            <Link
              href="/platform"
              className={`group relative flex items-center rounded-xl border border-[color:rgba(250,171,75,0.22)] bg-[color:rgba(250,171,75,0.08)] text-[color:var(--warning-text)] transition-colors hover:bg-[color:rgba(250,171,75,0.14)] ${
                collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
              }`}
            >
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[color:rgba(250,171,75,0.14)]">
                <PlatformIcon />
              </span>
              {!collapsed ? <span className="truncate text-sm font-medium">Platform</span> : null}
              <SidebarTooltip label="Platform" />
            </Link>
          </div>
        ) : null}
      </div>

      <div className={`border-t border-[color:var(--border)] ${collapsed ? 'px-3 py-3' : 'px-5 py-4'}`}>
        {collapsed ? (
          <div
            title={userName}
            className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--surface-muted)] text-[11px] font-semibold tracking-[0.06em] text-[color:var(--text-muted)]"
          >
            {userName
              .split(' ')
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0])
              .join('')}
          </div>
        ) : (
          <p className="truncate text-sm font-medium text-[color:var(--foreground)]">{userName}</p>
        )}
      </div>
    </aside>
  );
}
