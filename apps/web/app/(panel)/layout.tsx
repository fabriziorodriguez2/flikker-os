import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Sidebar from "./sidebar";
import MobileNav from "./mobile-nav";
import LogoutButton from "./logout-button";
import SelectBusiness from "./select-business";
import { RoleProvider } from "./role-context";
import ThemeToggle from "@/components/theme/theme-toggle";
import BrandLogo from "@/components/brand/brand-logo";
import SessionExpiryHandler from "@/components/auth/session-expiry-handler";
import ImpersonationBanner from "./impersonation-banner";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { user, memberships, activeBusinessId } = session;

  if (!activeBusinessId) {
    return (
      <>
        <SessionExpiryHandler />
        <SelectBusiness memberships={memberships} userName={user.firstName} />
      </>
    );
  }

  const currentRole = session.impersonation
    ? "OWNER"
    : (memberships.find((m) => m.businessId === activeBusinessId)?.role ??
      null);

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

            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              <div className="flikker-control-subtle hidden h-9 items-center rounded-full px-4 text-sm font-medium sm:inline-flex">
                {user.firstName} {user.lastName}
              </div>
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
