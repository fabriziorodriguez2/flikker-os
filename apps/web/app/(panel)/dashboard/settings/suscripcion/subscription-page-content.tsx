"use client";

import SettingsTabs from "@/components/panel/settings-tabs";
import PageHeader from "@/components/ui/page-header";
import { useIsCheckinV2 } from "../../../experience-context";
import CheckinV2SubscriptionClient from "./checkin-v2-subscription-client";
import SubscriptionClient from "./subscription-client";

/** Mantiene la ruta LEGACY intacta y aplica el pricing nuevo solo a CHECKIN_V2. */
export default function SubscriptionPageContent() {
  const isCheckinV2 = useIsCheckinV2();

  if (!isCheckinV2) {
    return (
      <div className="space-y-6">
        <SettingsTabs />
        <SubscriptionClient />
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
      <CheckinV2SubscriptionClient />
    </div>
  );
}
