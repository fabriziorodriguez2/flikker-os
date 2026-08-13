import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import SettingsTabs from "@/components/panel/settings-tabs";
import SettingsClient from "./settings-client";

/**
 * Configuración — el único lugar visible de ajustes generales.
 *
 * La pestaña por defecto es el perfil del negocio, que hasta ahora vivía en
 * `settings-client.tsx` sin que ninguna ruta lo renderizara. Equipo,
 * Sucursales e Integraciones siguen en sus rutas y comparten esta barra.
 */
export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="space-y-6">
      <SettingsTabs />
      <SettingsClient />
    </div>
  );
}
