import { MessageCircle } from "lucide-react";
import PublicState from "@/components/public/public-state";
import CustomerShell from "@/components/public/customer-shell";

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
    <CustomerShell showWordmark>
      <PublicState
        icon={MessageCircle}
        title="Este link ya no está disponible"
        description="Puede que haya vencido o que el mensaje sea viejo. Podés ver tus tarjetas y premios entrando con tu número."
        action={{ label: "Entrar a Mi Flikker", href: "/mi-flikker" }}
      />
    </CustomerShell>
  );
}
