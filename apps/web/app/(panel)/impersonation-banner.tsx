"use client";

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
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 bg-[#b42318] px-4 py-3 text-white shadow-[0_10px_24px_rgba(180,35,24,0.25)] md:px-6">
      <p className="text-sm font-semibold">
        ⚠️ Operando como {impersonation.businessName}
        <span className="ml-2 font-normal opacity-85">
          /{impersonation.businessSlug}
        </span>
      </p>
      <button
        type="button"
        onClick={() => void exitImpersonation()}
        className="rounded-full border border-white/30 bg-white/12 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white hover:bg-white/20"
      >
        Salir
      </button>
    </div>
  );
}
