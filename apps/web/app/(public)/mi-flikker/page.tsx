import { Suspense } from "react";
import { getFlikkerAccountToken } from "@/lib/flikker-account-cookie";
import MiFlikkerClient from "./mi-flikker-client";

export default async function MiFlikkerPage() {
  // Presence of the cookie only tells the client whether to attempt a
  // recognized load first — the GET render itself stays side-effect free,
  // same convention as the check-in page.
  const hasSession = Boolean(await getFlikkerAccountToken());
  return (
    // `MiFlikkerClient` lee la pestaña activa de `?tab=` con
    // `useSearchParams`, que Next exige tener detrás de un límite de
    // Suspense. El fallback es `null` a propósito: la pantalla real aparece
    // en el mismo tick, y un esqueleto intermedio solo agregaría un parpadeo.
    <Suspense fallback={null}>
      <MiFlikkerClient hasSession={hasSession} />
    </Suspense>
  );
}
