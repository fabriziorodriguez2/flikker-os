import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import SubscriptionPageContent from "./subscription-page-content";

/** Configuración → Suscripción — plan actual, límites y upgrade a Pro. */
export default async function SubscriptionSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <SubscriptionPageContent />;
}
