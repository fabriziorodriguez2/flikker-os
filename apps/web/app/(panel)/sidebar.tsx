'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import BusinessSelector from './business-selector';
import type { SessionMembership } from '@/lib/auth';

interface SidebarProps {
  memberships: SessionMembership[];
  activeBusinessId: string | null;
  userName: string;
  isPlatformAdmin?: boolean;
}

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Inicio' },
  { href: '/dashboard/branches', label: 'Sucursales' },
  { href: '/dashboard/members', label: 'Equipo' },
  { href: '/dashboard/settings', label: 'Configuración' },
];

export default function Sidebar({ memberships, activeBusinessId, userName, isPlatformAdmin }: SidebarProps) {
  const pathname = usePathname();

  const activeBusiness = memberships.find((m) => m.businessId === activeBusinessId);

  return (
    <aside className="w-56 shrink-0 border-r border-zinc-200 bg-white flex flex-col">
      {/* Business selector */}
      <div className="px-4 py-4 border-b border-zinc-200">
        <BusinessSelector
          memberships={memberships}
          activeBusinessId={activeBusinessId}
          activeBusinessName={activeBusiness?.business.name ?? null}
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-zinc-100 text-zinc-900 font-medium'
                  : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
              }`}
            >
              {item.label}
            </Link>
          );
        })}

        {isPlatformAdmin && (
          <>
            <div className="my-2 border-t border-zinc-100" />
            <Link
              href="/platform"
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                pathname.startsWith('/platform')
                  ? 'bg-amber-50 text-amber-900 font-medium'
                  : 'text-amber-700 hover:bg-amber-50 hover:text-amber-900'
              }`}
            >
              Plataforma
            </Link>
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="px-4 py-3 border-t border-zinc-200">
        <p className="text-xs text-zinc-500 truncate">{userName}</p>
      </div>
    </aside>
  );
}
