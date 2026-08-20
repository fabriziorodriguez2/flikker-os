"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import FlikkerChatbotPanel from "./flikker-chatbot-panel";

/**
 * Botón flotante de "Preguntale a Flikker" — montado una sola vez en
 * `apps/web/app/(panel)/layout.tsx`, visible en todo Check-in V2. Chico
 * cuando está cerrado; el panel abierto nunca tapa el sidebar y en mobile
 * deja libre la franja superior (nunca pantalla completa).
 */
export default function FlikkerChatbotLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && (
        <div className="fixed inset-x-3 bottom-3 top-20 z-50 sm:inset-x-auto sm:top-auto sm:right-5 sm:bottom-[5.5rem] sm:h-[min(560px,calc(100vh-8rem))] sm:w-[380px]">
          <FlikkerChatbotPanel onClose={() => setOpen(false)} />
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          open ? "Cerrar el asistente de Flikker" : "Preguntale a Flikker"
        }
        className={`fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-[#5C6BC0] px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(92,107,192,0.35)] transition-all hover:-translate-y-0.5 hover:bg-[#4f5eb0] ${
          open ? "pointer-events-none opacity-0" : ""
        }`}
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Preguntale a Flikker</span>
      </button>
    </>
  );
}
