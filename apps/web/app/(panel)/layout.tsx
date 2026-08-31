import { isUnauthorizedApiError } from "@/lib/api";
import { getEffectiveApiContext, getSession } from "@/lib/auth";
import {
  getCurrentBusiness,
  type CurrentBusiness,
} from "@/lib/current-business";
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
import { ToastProvider } from "@/components/ui/toast";
import BusinessLoadError from "@/components/ui/business-load-error";
import FlikkerChatbotLauncher from "@/components/panel/flikker-chatbot-launcher";

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
  // Distinto de "currentBusiness es null porque no hay businessId" (caso
  // defensivo, no debería pasar acá — ver el guard de arriba). Esto es
  // específicamente "pedimos el negocio real y la API respondió con un
  // error real" — nunca debe traducirse en silencio a "entonces es LEGACY".
  // Eso fue una causa real de bug: un 500 transitorio en
  // `/businesses/current` (columna nueva sin migrar) hacía caer el sidebar a
  // LEGACY sin ningún aviso.
  let businessLoadFailed = false;

  try {
    if (effectiveApiContext.businessId) {
      currentBusiness = await getCurrentBusiness(
        effectiveApiContext.accessToken,
        effectiveApiContext.businessId,
      );
    }
  } catch (error) {
    if (isUnauthorizedApiError(error)) {
      sessionExpired = true;
    } else {
      businessLoadFailed = true;
    }
  }

  if (sessionExpired) redirect("/session-expired");

  // Fallar seguro: sin el negocio real no sabemos si es LEGACY o CHECKIN_V2,
  // así que no se renderiza NINGUNA de las dos — nunca se sigue de largo con
  // un default adivinado. El dueño ve un error explícito con reintentar, no
  // un panel silenciosamente degradado a la experiencia equivocada.
  if (businessLoadFailed) {
    return (
      <>
        <SessionExpiryHandler />
        <BusinessLoadError />
      </>
    );
  }

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
  //
  // Bug real (auditado): `onboardingCompletedAt` nulo NO significa "está en
  // medio del onboarding self-service" para un negocio LEGACY — ese campo
  // solo lo escribe el flujo self-service, así que un negocio LEGACY (que
  // nunca pasó por ahí) lo tiene nulo PARA SIEMPRE. Sin el filtro de
  // `experienceVersion`, cualquier OWNER de un negocio LEGACY quedaba
  // atrapado: cada navegación al panel (incluido /dashboard/customers)
  // rebotaba a /comenzar en vez de abrir su pantalla real. El onboarding
  // self-service es exclusivamente CHECKIN_V2 (`OnboardingService#saveBusiness`
  // lo fuerza), así que un LEGACY jamás debe entrar acá.
  const needsOnboarding =
    !session.impersonation &&
    currentRole === "OWNER" &&
    currentBusiness !== null &&
    currentBusiness.experienceVersion === "CHECKIN_V2" &&
    !currentBusiness.onboardingCompletedAt;

  if (needsOnboarding) redirect("/comenzar");

  const businessDisplayName =
    currentBusiness?.name ??
    session.impersonation?.businessName ??
    activeMembership?.business?.name;
  const businessLogoUrl =
    currentBusiness?.logoUrl ?? activeMembership?.business?.logoUrl ?? null;
  // A esta altura `businessLoadFailed` ya cortó el render arriba, así que
  // `currentBusiness === null` acá NO es "la API falló" — es únicamente el
  // caso residual (no debería ocurrir dado el guard de más arriba) de que
  // `effectiveApiContext.businessId` viniera vacío. LEGACY sigue siendo el
  // default más seguro para ESE caso puntual, nunca para un fetch fallido.
  const experienceVersion: ExperienceVersion =
    currentBusiness?.experienceVersion === "CHECKIN_V2"
      ? "CHECKIN_V2"
      : "LEGACY";
  const retentionEngineV2Enabled =
    currentBusiness?.retentionEngineV2Enabled ?? false;
  const isCheckinV2 = experienceVersion === "CHECKIN_V2";

  return (
    <>
      <div className="flikker-app-shell min-h-screen lg:flex lg:h-screen lg:overflow-hidden">
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
          isPlatformAdmin={!!user.isPlatformAdmin}
        />

        <div className="flex min-w-0 flex-1 flex-col lg:min-h-0">
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
                isPlatformAdmin={!!user.isPlatformAdmin}
              />
            </div>
          </div>

          {/*
            `overscroll-contain`: este `<main>` es el scroller real del panel
            (no el documento). Sin esto, al llegar a su tope el gesto seguía
            encadenando hacia la página y el navegador sumaba su propio
            rubber-band.

            Acá vivía además `<ElasticScrollBoundary>`, un rebote artificial
            hecho a mano: escuchaba `wheel` en window y animaba un
            `translateY(±7px)` de 300 ms sobre TODO el contenido. Se quitó
            (auditoría de caso real: "rebota varias veces y se siente roto")
            porque su throttle era de 240 ms — MÁS CORTO que la animación de
            300 ms — así que un gesto de trackpad, que emite decenas de
            eventos con inercia, cancelaba y relanzaba el rebote una y otra
            vez, y de paso hacía "saltar" a los elementos sticky de adentro.
            El límite firme y natural que se pidió es el nativo, sin JS.
          */}
          <main className="min-h-0 flex-1 overflow-auto overscroll-contain px-4 py-6 md:px-6 md:py-8">
            <div className="min-h-full">
              <QueryProvider>
                <RoleProvider role={currentRole}>
                  <ExperienceProvider
                    experienceVersion={experienceVersion}
                    retentionEngineV2Enabled={retentionEngineV2Enabled}
                  >
                    {/* Montado UNA sola vez para todo el panel — ninguna
                        pantalla arma su propio cartel de "Guardado ✓". */}
                    <ToastProvider>{children}</ToastProvider>
                  </ExperienceProvider>
                </RoleProvider>
              </QueryProvider>
            </div>
          </main>
        </div>
      </div>
      {/* Flotante en todo Check-in V2, montado una sola vez acá — nunca en
          LEGACY. Hermano del shell, no hijo de `<main>`: así no lo tapa el
          `overflow-auto`/scroll del contenido ni queda atrapado por el
          `overflow-hidden` del shell en desktop. */}
      {isCheckinV2 && <FlikkerChatbotLauncher />}
    </>
  );
}
