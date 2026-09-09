import { MessageCircle } from "lucide-react";
import PublicState from "@/components/public/public-state";
import PoweredByFlikker from "@/components/ui/powered-by-flikker";

/**
 * El link del recordatorio no resuelve.
 *
 * Ojo con el alcance: en Check-in V2 este 404 ya casi no ocurre — abrir dos
 * veces el mismo WhatsApp muestra "ya recibimos tu opinión", no un error (ver
 * `FeedbackService.getByToken`). Queda para el token inválido de verdad y
 * para los negocios LEGACY, que conservan sus 404 de siempre.
 */
export default function FeedbackNotFound() {
  return (
    <main className="flk-customer flex min-h-dvh flex-col items-center justify-center bg-[#f8fafc] px-5 py-10">
      <div className="w-full max-w-sm">
        <PublicState
          icon={MessageCircle}
          title="Este link ya no está disponible"
          description="Puede que haya vencido o que el mensaje sea viejo. Podés ver tus tarjetas y premios entrando con tu número."
          action={{ label: "Entrar a Mi Flikker", href: "/mi-flikker" }}
        />
      </div>
      <p className="mt-10 text-xs text-[#A0A8B8]">
        <PoweredByFlikker />
      </p>
    </main>
  );
}
