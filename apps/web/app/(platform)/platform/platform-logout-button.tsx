"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

export default function PlatformLogoutButton() {
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }

  return (
    <button
      type="button"
      onClick={() => void logout()}
      disabled={loading}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 px-3 text-sm font-semibold text-[#DCE2F0] hover:bg-white/10 disabled:opacity-60"
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">{loading ? "Saliendo..." : "Salir"}</span>
    </button>
  );
}
