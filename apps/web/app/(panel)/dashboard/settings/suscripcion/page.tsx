import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import SettingsTabs from "@/components/panel/settings-tabs";
import SubscriptionClient from "./subscription-client";

/** Configuración → Suscripción — plan actual, límites y upgrade a Pro. */
export default async function SubscriptionSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="space-y-6">
      <SettingsTabs />
      <SubscriptionClient />
    </div>
  );
}
