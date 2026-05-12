import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import SettingsClient from "./settings-client";

export default async function SettingsPage() {
  const session = await getSession();

  if (!session) redirect("/login");
  if (!session.user.isPlatformAdmin) redirect("/dashboard");

  return <SettingsClient />;
}
