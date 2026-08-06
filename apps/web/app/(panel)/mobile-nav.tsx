"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MAIN_NAV_ITEMS: Array<{
  href: string;
  label: string;
  onboardingKey?: string;
  impersonatorOnly?: boolean;
  checkinV2Only?: boolean;
}> = [
  { href: "/dashboard", label: "Panel", onboardingKey: "panel" },
  { href: "/dashboard/insights", label: "Insights" },
  { href: "/dashboard/customers", label: "Clientes", onboardingKey: "clientes" },
  { href: "/dashboard/campaigns", label: "Campañas", onboardingKey: "campaigns" },
  { href: "/dashboard/reviews", label: "Reseñas" },
  { href: "/dashboard/benefits", label: "Beneficios" },
  { href: "/dashboard/retention", label: "Retención" },
  { href: "/dashboard/retention-v2", label: "Retención V2", checkinV2Only: true },
  { href: "/dashboard/checkins", label: "Check-ins", checkinV2Only: true },
  { href: "/dashboard/widgets", label: "Widget", impersonatorOnly: true },
  { href: "/dashboard/qr", label: "QR", onboardingKey: "qr", impersonatorOnly: true },
];

export default function MobileNav({ isImpersonating, isCheckinV2 }: { isImpersonating: boolean; isCheckinV2: boolean }) {
  const pathname = usePathname();
  const items = MAIN_NAV_ITEMS.filter((item) => (!item.impersonatorOnly || isImpersonating) && (!item.checkinV2Only || isCheckinV2));

  return (
    <nav className="relative z-20 overflow-hidden rounded-[18px] border border-white/75 bg-white/58 px-2.5 py-2 shadow-[0_10px_28px_rgba(56,45,125,0.10),inset_0_1px_0_rgba(255,255,255,0.86)] backdrop-blur-[24px] backdrop-saturate-[175%] lg:hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent"
      />
      <div className="flikker-scrollbar-hidden relative flex gap-1.5 overflow-x-auto">
        {items.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              data-onboarding={item.onboardingKey}
              className={`shrink-0 rounded-[12px] border px-3.5 py-2 text-xs font-semibold transition-all ${
                isActive
                  ? "border-[#5C6BC0]/25 bg-[#5C6BC0] text-white shadow-[0_5px_14px_rgba(92,107,192,0.22)]"
                  : "border-white/80 bg-white/45 text-[#777187] hover:bg-white/75"
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
