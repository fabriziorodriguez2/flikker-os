import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import SessionExpiryHandler from "@/components/auth/session-expiry-handler";
import PlatformLogoutButton from "./platform-logout-button";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.user.isPlatformAdmin) redirect("/dashboard");

  const fullName = `${session.user.firstName} ${session.user.lastName}`.trim();
  const initials = getInitials(session.user.firstName, session.user.lastName);

  return (
    <div className="min-h-screen bg-[#F5F6FA] font-sans text-[#1A202C]">
      <SessionExpiryHandler />
      <header className="sticky top-0 z-30 h-[60px] border-b border-[#E8EAF0] bg-[#0D1B2A]">
        <div className="flex h-full items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Image
              src="/flikker-wordmark-white.svg"
              alt="Flikker"
              width={110}
              height={34}
              priority
              className="h-auto w-[88px]"
            />
            <span className="rounded-full bg-[#5C6BC0]/20 px-3 py-1 text-xs font-semibold text-[#DCE2F0]">
              panel admin
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/platform/integrations"
              className="hidden h-9 items-center justify-center rounded-lg border border-[#DCE2F0]/20 px-4 text-sm font-semibold text-[#DCE2F0] transition-colors hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              Integraciones
            </Link>
            <Link
              href="/platform/test-lab"
              className="hidden h-9 items-center justify-center rounded-lg border border-[#DCE2F0]/20 px-4 text-sm font-semibold text-[#DCE2F0] transition-colors hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              Test Lab
            </Link>
            <Link
              href="/platform/simulations"
              className="hidden h-9 items-center justify-center rounded-lg border border-[#DCE2F0]/20 px-4 text-sm font-semibold text-[#DCE2F0] transition-colors hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              Simulaciones
            </Link>
            <span className="hidden text-sm font-semibold text-[#DCE2F0] sm:inline">
              {fullName || session.user.email}
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#5C6BC0]/20 text-xs font-bold text-white">
              {initials}
            </span>
            <PlatformLogoutButton />
          </div>
        </div>
      </header>
      <main className="px-6 py-7">{children}</main>
    </div>
  );
}

function getInitials(firstName?: string, lastName?: string) {
  const value = `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.trim();
  return value || "FA";
}
