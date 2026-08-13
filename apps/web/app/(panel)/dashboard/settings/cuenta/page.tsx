import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import SettingsTabs from "@/components/panel/settings-tabs";
import ChangePasswordForm from "../change-password-form";

/** Cuenta y seguridad — lo personal de cada miembro, no del negocio. */
export default async function AccountSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[27px] font-semibold leading-tight tracking-[-0.025em] text-[#202333] md:text-[30px]">
          Configuración
        </h1>
        <p className="mt-1.5 text-sm leading-5 text-[#7F879C]">
          Sesión iniciada como{" "}
          <span className="font-semibold text-[#202333]">
            {session.user.email}
          </span>
        </p>
      </div>

      <SettingsTabs />

      <div className="max-w-2xl">
        <ChangePasswordForm />
      </div>
    </div>
  );
}
