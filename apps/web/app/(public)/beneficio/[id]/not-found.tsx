import { Gift } from "lucide-react";
import PublicState from "@/components/public/public-state";
import CustomerShell from "@/components/public/customer-shell";

/**
 * La emisión no existe, o el negocio la dio de baja.
 *
 * No se distingue entre "nunca existió" y "ya no está": el id es un UUID que
 * funciona como bearer link, y confirmar cuáles existen le daría a cualquiera
 * una forma de sondearlos. El cliente igual tiene a dónde ir — sus premios
 * activos están en Mi Flikker.
 */
export default function BeneficioNotFound() {
  return (
    <CustomerShell showWordmark>
      <PublicState
        icon={Gift}
        title="No encontramos ese beneficio"
        description="Puede que ya lo hayas canjeado o que el local lo haya dado de baja. Tus premios activos están en Mi Flikker."
        action={{ label: "Ver mis premios", href: "/mi-flikker" }}
      />
    </CustomerShell>
  );
}
