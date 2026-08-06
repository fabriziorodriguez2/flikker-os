"use client";

import { Menu } from "lucide-react";

export default function MobileMenuButton() {
  return (
    <button
      type="button"
      aria-label="Abrir menú"
      onClick={() =>
        window.dispatchEvent(new CustomEvent("flikker:mobile-menu-toggle"))
      }
      className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-white/75 bg-white/42 text-[#4A445C] shadow-[0_4px_12px_rgba(56,45,125,0.07)] hover:bg-white/75 hover:text-[#5C6BC0] lg:hidden"
    >
      <Menu aria-hidden="true" className="h-5 w-5" />
    </button>
  );
}
