import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/brand/brand-logo";
import ThemeToggle from "@/components/theme/theme-toggle";
import SessionExpiryHandler from "@/components/auth/session-expiry-handler";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.user.isPlatformAdmin) redirect("/dashboard");

  return (
    <div className="flikker-app-shell min-h-screen">
      <SessionExpiryHandler />
      <header className="sticky top-0 z-20 border-b border-[color:var(--border)] bg-[color:var(--background)]/95 backdrop-blur supports-[backdrop-filter]:bg-[color:var(--background)]/88">
        <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <BrandLogo width={126} height={107} className="h-auto w-[96px]" />
            <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--brand-warm)]">
              Administrador
            </span>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <span className="flikker-control-subtle hidden h-9 items-center rounded-full px-4 text-sm font-medium sm:inline-flex">
              {session.user.firstName} {session.user.lastName}
            </span>
          </div>
        </div>
      </header>
      <main className="px-4 py-5 md:px-6 md:py-6">{children}</main>
    </div>
  );
}
