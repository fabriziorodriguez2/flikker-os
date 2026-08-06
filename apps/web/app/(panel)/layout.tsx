import { apiFetch, isUnauthorizedApiError } from "@/lib/api";
import { getEffectiveApiContext, getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Sidebar from "./sidebar";
import MobileNav from "./mobile-nav";
import LogoutButton from "./logout-button";
import SelectBusiness from "./select-business";
import BusinessSelector from "./business-selector";
import { RoleProvider } from "./role-context";
import {
  ExperienceProvider,
  type ExperienceVersion,
} from "./experience-context";
import BrandLogo from "@/components/brand/brand-logo";
import BusinessLogo from "@/components/business/business-logo";
import SessionExpiryHandler from "@/components/auth/session-expiry-handler";
import ImpersonationBanner from "./impersonation-banner";
import QueryProvider from "@/components/providers/query-provider";
import MobileMenuButton from "./mobile-menu-button";
import ElasticScrollBoundary from "@/components/ui/elastic-scroll-boundary";

interface CurrentBusiness {
  name: string;
  logoUrl: string | null;
  /** Per-business rollout flags. Absent on older API builds → treated as LEGACY. */
  experienceVersion?: ExperienceVersion;
  retentionEngineV2Enabled?: boolean;
}

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { user, memberships, activeBusinessId } = session;

  if (!user || !memberships) redirect("/login");

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
  let sessionExpired = false;

  try {
    if (effectiveApiContext.businessId) {
      currentBusiness = await apiFetch<CurrentBusiness>(
        "/businesses/current",
        effectiveApiContext.accessToken,
        { businessId: effectiveApiContext.businessId },
      );
    }
  } catch (error) {
    if (isUnauthorizedApiError(error)) sessionExpired = true;
    // else: currentBusiness stays null (API unreachable, render without business data)
  }

  if (sessionExpired) redirect("/session-expired");

  const businessDisplayName =
    currentBusiness?.name ??
    session.impersonation?.businessName ??
    activeMembership?.business?.name;
  const businessLogoUrl =
    currentBusiness?.logoUrl ?? activeMembership?.business?.logoUrl ?? null;
  // Default to LEGACY: if /businesses/current could not be reached we must not
  // light up V2 surfaces on a guess.
  const experienceVersion: ExperienceVersion =
    currentBusiness?.experienceVersion === "CHECKIN_V2"
      ? "CHECKIN_V2"
      : "LEGACY";
  const retentionEngineV2Enabled =
    currentBusiness?.retentionEngineV2Enabled ?? false;
  const isCheckinV2 = experienceVersion === "CHECKIN_V2";

  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
        }}
      >
        {/* top-right purple — center at ~(vw-150px, 100px) */}
        <div
          style={{
            position: "absolute",
            top: "-150px",
            right: "-100px",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            background: "rgba(145, 136, 245, 0.28)",
            filter: "blur(80px)",
          }}
        />
        {/* bottom-left orange */}
        <div
          style={{
            position: "absolute",
            bottom: "-100px",
            left: "-80px",
            width: "450px",
            height: "450px",
            borderRadius: "50%",
            background: "rgba(250, 171, 75, 0.18)",
            filter: "blur(70px)",
          }}
        />
        {/* center-right soft purple */}
        <div
          style={{
            position: "absolute",
            top: "25%",
            right: "15%",
            width: "350px",
            height: "350px",
            borderRadius: "50%",
            background: "rgba(145, 136, 245, 0.15)",
            filter: "blur(100px)",
          }}
        />
      </div>
    <div className="flikker-app-shell relative z-[1] min-h-screen lg:flex">
      <SessionExpiryHandler />
      <Sidebar
        memberships={memberships}
        activeBusinessId={activeBusinessId}
        userName={`${user.firstName} ${user.lastName}`}
        isImpersonating={!!session.impersonation}
        isCheckinV2={isCheckinV2}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {session.impersonation ? (
          <ImpersonationBanner impersonation={session.impersonation} />
        ) : null}
        <header
          className={`sticky z-30 mx-3 mt-3 rounded-[20px] border border-white/75 bg-white/58 shadow-[0_12px_36px_rgba(56,45,125,0.11),inset_0_1px_0_rgba(255,255,255,0.88)] backdrop-blur-[26px] backdrop-saturate-[175%] ${
            session.impersonation ? "top-14" : "top-3"
          }`}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent"
          />
          <div className="relative flex items-center justify-between gap-4 px-3 py-2.5 md:px-4">
            <div className="flex items-center gap-1 lg:hidden">
              <MobileMenuButton />
              <BrandLogo
                width={126}
                height={107}
                className="h-auto w-[96px]"
              />
            </div>

            <div className="ml-auto flex items-center gap-2.5">
              {businessDisplayName ? (
                <div className="hidden min-h-10 items-center gap-2.5 rounded-[13px] border border-white/80 bg-white/48 px-3 text-sm font-semibold text-[#29243D] shadow-[0_4px_14px_rgba(56,45,125,0.07)] sm:flex">
                  {businessLogoUrl ? (
                    <BusinessLogo
                      logoUrl={businessLogoUrl}
                      name={businessDisplayName}
                      size="sm"
                    />
                  ) : null}
                  {session.impersonation ? (
                    // Impersonating: keep the business name fixed — switching
                    // is disabled while an admin is operating as a business.
                    <span className="max-w-[200px] truncate">{businessDisplayName}</span>
                  ) : (
                    <BusinessSelector
                      memberships={memberships}
                      activeBusinessId={activeBusinessId}
                      activeBusinessName={businessDisplayName}
                    />
                  )}
                </div>
              ) : null}
              <Link
                href="/dashboard/settings"
                aria-label="Cuenta y seguridad"
                title="Cuenta y seguridad"
                className="inline-flex h-10 items-center rounded-[13px] border border-white/80 bg-white/48 px-3.5 text-sm font-semibold text-[#4A445C] shadow-[0_4px_14px_rgba(56,45,125,0.07)] transition-all hover:-translate-y-px hover:bg-white/80 hover:text-[#5C6BC0]"
              >
                Cuenta
              </Link>
              <LogoutButton />
            </div>
          </div>
        </header>

        <MobileNav isImpersonating={!!session.impersonation} isCheckinV2={isCheckinV2} />

        <main className="flex-1 overflow-auto px-4 py-6 md:px-6 md:py-8">
          <ElasticScrollBoundary>
            <QueryProvider>
              <RoleProvider role={currentRole}>
                <ExperienceProvider
                  experienceVersion={experienceVersion}
                  retentionEngineV2Enabled={retentionEngineV2Enabled}
                >
                  {children}
                </ExperienceProvider>
              </RoleProvider>
            </QueryProvider>
          </ElasticScrollBoundary>
        </main>
      </div>
    </div>
    </>
  );
}
