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
      className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] text-[#1A202C] hover:bg-black/5 lg:hidden"
    >
      <Menu aria-hidden="true" className="h-5 w-5" />
    </button>
  );
}
