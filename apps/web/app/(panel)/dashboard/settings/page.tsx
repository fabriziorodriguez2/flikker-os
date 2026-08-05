import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import ChangePasswordForm from "./change-password-form";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#1A202C]">
          Cuenta y seguridad
        </h1>
        <p className="mt-1 text-sm text-[#8891A4]">
          Sesión iniciada como{" "}
          <span className="font-medium text-[#1A202C]">
            {session.user.email}
          </span>
          .
        </p>
      </div>

      <ChangePasswordForm />
    </div>
  );
}
