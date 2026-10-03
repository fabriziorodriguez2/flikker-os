"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { resolveNavSections } from "./sidebar";
import ProBadge from "@/components/panel/pro-badge";
import { useUpgradeModal } from "@/components/panel/upgrade-modal-provider";

/**
 * Antes tenía su propia lista de ítems (`MAIN_NAV_ITEMS`), escrita a mano y
 * nunca actualizada cuando se rediseñó la navegación de Check-in V2: seguía
 * mostrando rutas absorbidas (Insights, Beneficios, Campañas...) sin filtrar
 * por rol, y directamente NO tenía entrada para `/dashboard/programa` — un
 * dueño en mobile no tenía forma de llegar ahí ni por accidente.
 *
 * Ahora se deriva de `resolveNavSections`, la MISMA fuente que usa el
 * sidebar de escritorio: una sola lista de navegación, no dos que pueden
 * desincronizarse.
 */
export default function MobileNav({
  isImpersonating,
  isCheckinV2,
  role,
  isPlatformAdmin,
}: {
  isImpersonating: boolean;
  isCheckinV2: boolean;
  role?: string | null;
  isPlatformAdmin: boolean;
}) {
  const pathname = usePathname();
  const { isPro, openUpgradeModal } = useUpgradeModal();
  const sections = resolveNavSections({
    isCheckinV2,
    isImpersonating,
    role: role ?? null,
    isPlatformAdmin,
  });
  const items = sections.flatMap((section) => section.items);

  return (
    <nav className="relative z-20 overflow-hidden rounded-[16px] border border-[#E4E5EB] bg-[#F8F8FA] px-2.5 py-2 shadow-[0_7px_20px_rgba(42,40,67,0.08)] lg:hidden">
      <div className="flikker-scrollbar-hidden relative flex gap-1.5 overflow-x-auto">
        {items.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          const isProLocked = Boolean(item.proFeature && !isPro);

          const className = `inline-flex shrink-0 items-center gap-2 rounded-[12px] border px-3.5 py-2 text-xs font-semibold transition-all ${
            isActive
              ? "border-[#5C6BC0]/25 bg-[#5C6BC0] text-white shadow-[0_5px_14px_rgba(92,107,192,0.22)]"
              : "border-transparent bg-transparent text-[#777187] hover:bg-[#ECECF2]"
          }`;

          if (isProLocked) {
            return (
              <button
                key={item.href}
                type="button"
                data-onboarding={item.onboardingKey}
                data-pro-feature={item.proFeature}
                aria-label={`${item.label}, disponible en Flikker Pro`}
                onClick={() =>
                  openUpgradeModal({
                    feature: item.proFeature!,
                    source: "mobile_nav",
                  })
                }
                className={className}
              >
                {item.label}
                <ProBadge />
              </button>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              data-onboarding={item.onboardingKey}
              className={className}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
