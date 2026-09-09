import { MapPin } from "lucide-react";
import PublicState from "@/components/public/public-state";

/**
 * El lugar no está en la cuenta de quien lo abrió.
 *
 * El backend ya devuelve el MISMO 404 para "el negocio no existe" y para "no
 * es tuyo" (ver `MyFlikkerService.placeDetail`), justamente para no confirmar
 * si una cuenta tiene relación con un negocio. Esta pantalla mantiene esa
 * decisión: un solo mensaje, sin nombrar al negocio ni decir por qué.
 */
export default function PlaceNotFound() {
  return (
    <main className="flk-customer flex min-h-dvh flex-col items-center justify-center bg-[#F5F6FB] px-5 py-10">
      <div className="w-full max-w-sm">
        <PublicState
          icon={MapPin}
          title="No encontramos ese lugar"
          description="Puede que el link no sea el correcto. Estos son los lugares donde tenés tarjetas y premios."
          action={{ label: "Ver mis lugares", href: "/mi-flikker" }}
        />
      </div>
    </main>
  );
}
