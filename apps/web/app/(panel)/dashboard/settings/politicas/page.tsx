import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import SettingsTabs from "@/components/panel/settings-tabs";
import PageHeader from "@/components/ui/page-header";
import PolicyClient from "./policy-client";
import ConsentAuditCard from "./consent-audit-card";

/** Configuración → Políticas: topes de envíos y costos, y el kill switch. */
export default async function PolicySettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="mx-auto w-full max-w-[1230px] space-y-7">
      <PageHeader
        title="Configuración"
        subtitle="Reglas de envíos, consentimiento y costos de tu negocio."
      />
      <SettingsTabs />
      <PolicyClient />
      <ConsentAuditCard />
    </div>
  );
}
