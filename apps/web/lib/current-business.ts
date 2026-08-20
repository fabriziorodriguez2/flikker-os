import { cache } from "react";
import { apiFetch } from "./api";

export interface CurrentBusiness {
  name: string;
  logoUrl: string | null;
  /** Per-business rollout flags. Absent on older API builds → treated as LEGACY. */
  experienceVersion?: "LEGACY" | "CHECKIN_V2";
  retentionEngineV2Enabled?: boolean;
  /** Nulo = el dueño todavía no terminó `/comenzar`. */
  onboardingCompletedAt?: string | null;
}

/**
 * PERF: `GET /businesses/current` es un `findUnique` sin `select` (fila
 * entera) y se llamaba una vez por cada Server Component que lo necesitaba
 * en el mismo request — medido: layout + `dashboard/page.tsx` disparaban
 * DOS requests reales idénticos al backend por cada navegación a Inicio
 * (confirmado con logging de requests, no solo lectura de código: la
 * memoización automática de `fetch` de Next no los estaba deduplicando acá).
 * `cache()` de React memoiza por argumentos durante un mismo render — con
 * los mismos `accessToken`/`businessId`, todo caller dentro del mismo
 * request recibe la misma promesa ya resuelta en vez de disparar un nuevo
 * fetch. Mismo dato, mismo contrato — solo se pide una vez.
 */
export const getCurrentBusiness = cache(
  (
    accessToken: string | null,
    businessId: string,
  ): Promise<CurrentBusiness> =>
    apiFetch<CurrentBusiness>("/businesses/current", accessToken, {
      businessId,
    }),
);
