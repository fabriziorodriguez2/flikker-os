import { apiFetch } from "@/lib/api";
import { getEffectiveApiContext, getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Sidebar from "./sidebar";
import MobileNav from "./mobile-nav";
import LogoutButton from "./logout-button";
import SelectBusiness from "./select-business";
import { RoleProvider } from "./role-context";
import BrandLogo from "@/components/brand/brand-logo";
import BusinessLogo from "@/components/business/business-logo";
import SessionExpiryHandler from "@/components/auth/session-expiry-handler";
import ImpersonationBanner from "./impersonation-banner";

interface CurrentBusiness {
  name: string;
  logoUrl: string | null;
}

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { user, memberships, activeBusinessId } = session;

  if (user.isPlatformAdmin && !session.impersonation) {
    redirect("/platform");
  }

  const activeMembership = memberships.find(
    (membership) => membership.businessId === activeBusinessId,
  );

  if (!activeBusinessId || (!session.impersonation && !activeMembership)) {
    return (
      <>
        <SessionExpiryHandler />
        <SelectBusiness memberships={memberships} userName={user.firstName} />
      </>
    );
  }

  const currentRole = session.impersonation
    ? "OWNER"
    : (activeMembership?.role ?? null);
  const effectiveApiContext = getEffectiveApiContext(session);
  let currentBusiness: CurrentBusiness | null = null;

  try {
    if (effectiveApiContext.businessId) {
      currentBusiness = await apiFetch<CurrentBusiness>(
        "/businesses/current",
        effectiveApiContext.accessToken,
        { businessId: effectiveApiContext.businessId },
      );
    }
  } catch {
    currentBusiness = null;
  }

  const businessDisplayName =
    currentBusiness?.name ??
    session.impersonation?.businessName ??
    activeMembership?.business?.name;
  const businessLogoUrl =
    currentBusiness?.logoUrl ?? activeMembership?.business?.logoUrl ?? null;

  return (
    <div className="flikker-app-shell min-h-screen lg:flex">
      <SessionExpiryHandler />
      <Sidebar
        memberships={memberships}
        activeBusinessId={activeBusinessId}
        userName={`${user.firstName} ${user.lastName}`}
        isPlatformAdmin={user.isPlatformAdmin}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {session.impersonation ? (
          <ImpersonationBanner impersonation={session.impersonation} />
        ) : null}
        <header className="sticky top-0 z-10 bg-[color:var(--background)]/96 backdrop-blur supports-[backdrop-filter]:bg-[color:var(--background)]/92">
          <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-6">
            <div className="lg:hidden">
              <BrandLogo
                width={126}
                height={107}
                className="h-auto w-[108px]"
              />
            </div>

            <div className="ml-auto flex items-center gap-2.5">
              {businessDisplayName ? (
                <div className="hidden items-center gap-2 text-sm font-medium text-[#1A202C] sm:flex">
                  {businessLogoUrl ? (
                    <BusinessLogo
                      logoUrl={businessLogoUrl}
                      name={businessDisplayName}
                      size="sm"
                    />
                  ) : null}
                  <span className="max-w-[200px] truncate">{businessDisplayName}</span>
                </div>
              ) : null}
              <LogoutButton />
            </div>
          </div>
        </header>

        <MobileNav />

        <main className="flex-1 overflow-auto px-4 py-5 md:px-6 md:py-6">
          <RoleProvider role={currentRole}>{children}</RoleProvider>
        </main>
      </div>
    </div>
  );
}
