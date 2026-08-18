"use client";

import SettingsTabs from "@/components/panel/settings-tabs";
import PageHeader from "@/components/ui/page-header";
import { useIsCheckinV2 } from "../../experience-context";
import CheckinV2BusinessSettings from "./checkin-v2-business-settings";
import SettingsClient from "./settings-client";

/** Mantiene Configuración LEGACY intacta y aplica el rediseño solo a CHECKIN_V2. */
export default function SettingsPageContent() {
  const isCheckinV2 = useIsCheckinV2();

  if (!isCheckinV2) {
    return (
      <div className="space-y-6">
        <SettingsTabs />
        <SettingsClient />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1230px] space-y-7">
      <PageHeader
        title="Configuración"
        subtitle="Administrá las preferencias de tu cuenta y negocio."
      />
      <SettingsTabs />
      <CheckinV2BusinessSettings />
    </div>
  );
}
