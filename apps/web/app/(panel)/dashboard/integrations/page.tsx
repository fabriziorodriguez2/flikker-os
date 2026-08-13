import SettingsTabs from "@/components/panel/settings-tabs";
import ManagersOnly from "@/components/panel/managers-only";
import IntegrationsClient from "./shopify-settings-client";

/**
 * Integraciones es OWNER/ADMIN incluso para LEER: cada endpoint bajo
 * `/integrations/*` exige ese rol, sin excepción para el GET. Por eso va
 * envuelta en `ManagersOnly` — no tiene sentido un modo lectura para un
 * OPERATOR cuando ni siquiera el fetch inicial le va a responder.
 */
export default function IntegrationsPage() {
  return (
    <div className="space-y-6">
      {/* Barra común de Configuración: esta pantalla es una de sus pestañas. */}
      <SettingsTabs />
      <ManagersOnly what="las integraciones">
        <IntegrationsClient />
      </ManagersOnly>
    </div>
  );
}
