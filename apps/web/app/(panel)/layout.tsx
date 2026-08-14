import { apiFetch, isUnauthorizedApiError } from "@/lib/api";
import { getEffectiveApiContext, getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Sidebar from "./sidebar";
import MobileNav from "./mobile-nav";
import SelectBusiness from "./select-business";
import { RoleProvider } from "./role-context";
import {
  ExperienceProvider,
  type ExperienceVersion,
} from "./experience-context";
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
  /** Nulo = el dueño todavía no terminó `/comenzar`. Ver el guard más abajo. */
  onboardingCompletedAt?: string | null;
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

  // Guard de onboarding — la contracara del guard de `/comenzar`.
  //
  // Las dos rutas leen el MISMO campo con condiciones opuestas
  // (`onboardingCompletedAt` nulo manda acá → /comenzar; no nulo manda allá →
  // /dashboard), así que no puede haber rebote entre ambas.
  //
  // Solo aplica al OWNER: quien fue invitado a un negocio ajeno no configura
  // nada, y mandarlo al wizard sería mandarlo a reconfigurar el negocio de
  // otro. Tampoco aplica bajo impersonation (el operador de plataforma no está
  // haciendo el onboarding del cliente).
  //
  // `currentBusiness === null` (API caída) NO redirige: preferimos un panel
  // degradado antes que mandar a un negocio ya configurado a rehacer el alta.
  const needsOnboarding =
    !session.impersonation &&
    currentRole === "OWNER" &&
    currentBusiness !== null &&
    !currentBusiness.onboardingCompletedAt;

  if (needsOnboarding) redirect("/comenzar");

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
        businessDisplayName={businessDisplayName ?? null}
        businessLogoUrl={businessLogoUrl}
        isImpersonating={!!session.impersonation}
        isCheckinV2={isCheckinV2}
        role={currentRole}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {session.impersonation ? (
          <ImpersonationBanner impersonation={session.impersonation} />
        ) : null}
        <div className="relative z-20 flex items-center gap-2 px-3 pt-3 lg:hidden">
          <MobileMenuButton />
          <div className="min-w-0 flex-1">
            <MobileNav
              isImpersonating={!!session.impersonation}
              isCheckinV2={isCheckinV2}
              role={currentRole}
            />
          </div>
        </div>

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
