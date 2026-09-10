import { Hourglass } from "lucide-react";
import PublicState from "@/components/public/public-state";
import CustomerShell from "@/components/public/customer-shell";

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
    <CustomerShell showWordmark>
      <PublicState
        icon={Hourglass}
        tone="warning"
        title="Este link ya venció"
        description="Los links de check-in duran poco por seguridad. Volvé a escanear el QR del local o entrá con tu número."
        action={{ label: "Entrar a Mi Flikker", href: "/mi-flikker" }}
      />
    </CustomerShell>
  );
}
