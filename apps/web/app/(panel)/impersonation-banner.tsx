"use client";

import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Session } from "@/lib/auth";

interface ImpersonationBannerProps {
  impersonation: NonNullable<Session["impersonation"]>;
}

export default function ImpersonationBanner({
  impersonation,
}: ImpersonationBannerProps) {
  const router = useRouter();

  async function exitImpersonation() {
    await fetch("/api/platform/exit-impersonation", { method: "POST" });
    router.push("/platform");
    router.refresh();
  }

  return (
    <div className="sticky top-0 z-50 flex min-h-10 flex-wrap items-center justify-between gap-3 bg-[#C0392B] px-4 py-2 text-white md:px-6">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span>
          <span className="sm:hidden">Operando como </span>
          <span className="hidden sm:inline">Estás operando como </span>
          {impersonation.businessName}
          <span className="hidden font-normal sm:inline">
            {" "}
            · Cualquier acción queda registrada con tu usuario.
          </span>
        </span>
      </p>
      <button
        type="button"
        onClick={() => void exitImpersonation()}
        className="shrink-0 rounded-[8px] border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
      >
        Salir
      </button>
    </div>
  );
}
