import { Hourglass } from "lucide-react";
import PublicState from "@/components/public/public-state";
import PoweredByFlikker from "@/components/ui/powered-by-flikker";

/**
 * El QR/link de check-in no resuelve: token inexistente, fuente desactivada,
 * negocio inactivo o — el caso más común de verdad — un link viejo que alguien
 * guardó y volvió a abrir días después.
 *
 * El mensaje es el mismo para todos esos casos a propósito. Distinguirlos le
 * diría a cualquiera que pruebe tokens al azar cuál existe y cuál no, y al
 * cliente no le cambia nada: la acción es la misma.
 */
export default function CheckinNotFound() {
  return (
    <main className="flk-customer flex min-h-dvh flex-col items-center justify-center bg-[#F5F6FB] px-5 py-10">
      <div className="w-full max-w-sm">
        <PublicState
          icon={Hourglass}
          tone="warning"
          title="Este link ya venció"
          description="Los links de check-in duran poco por seguridad. Volvé a escanear el QR del local o entrá con tu número."
          action={{ label: "Entrar a Mi Flikker", href: "/mi-flikker" }}
        />
      </div>
      <p className="mt-10 text-xs text-[#A0A8B8]">
        <PoweredByFlikker />
      </p>
    </main>
  );
}
