import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import SessionExpiryHandler from "@/components/auth/session-expiry-handler";

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
            <span className="text-[25px] font-bold leading-none text-[#5C6BC0]">
              Flikker
            </span>
            <span className="rounded-full bg-[#5C6BC0]/20 px-3 py-1 text-xs font-semibold text-[#DCE2F0]">
              panel admin
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm font-semibold text-[#DCE2F0] sm:inline">
              {fullName || session.user.email}
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#5C6BC0]/20 text-xs font-bold text-white">
              {initials}
            </span>
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
