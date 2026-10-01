"use client";

import { useCallback, useRef, useState } from "react";
import {
  buildProCheckoutRequestBody,
  parseProCheckoutResponse,
  CHECKOUT_GENERIC_ERROR_MESSAGE,
  type CheckoutPlan,
} from "@/lib/pro-checkout";

/**
 * Único punto del panel que abre un checkout real. Pega al proxy
 * autenticado — ver `pro-checkout.ts` para el contrato del body/respuesta.
 *
 * Un `pendingRef` (no un simple booleano derivado de `pendingPlan`) evita
 * la carrera de un doble click: el segundo click puede llegar antes de que
 * el primer `setState` se haya aplicado, así que la guarda tiene que leer
 * un valor síncrono, no esperar al render.
 */
export interface UseProCheckoutResult {
  /** Plan cuyo checkout está en curso. `null` si no hay ninguno. */
  pendingPlan: CheckoutPlan | null;
  /** Último error, si lo hay. Nunca cierra nada por sí solo. */
  error: string | null;
  startCheckout: (plan: CheckoutPlan) => void;
}

export function useProCheckout(): UseProCheckoutResult {
  const [pendingPlan, setPendingPlan] = useState<CheckoutPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);

  const startCheckout = useCallback((plan: CheckoutPlan) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setError(null);
    setPendingPlan(plan);

    void (async () => {
      let response: Response;
      try {
        response = await fetch("/api/proxy/businesses/current/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildProCheckoutRequestBody(plan)),
        });
      } catch {
        pendingRef.current = false;
        setPendingPlan(null);
        setError(CHECKOUT_GENERIC_ERROR_MESSAGE);
        return;
      }

      const data: unknown = await response.json().catch(() => null);
      const result = parseProCheckoutResponse(response.ok, data);

      if ("checkoutUrl" in result) {
        // Navegación real en curso: no hay nada que limpiar, la página
        // se va. Dejar `pendingRef` en true mantiene los botones
        // bloqueados hasta que efectivamente se deje esta pantalla.
        window.location.assign(result.checkoutUrl);
        return;
      }

      pendingRef.current = false;
      setPendingPlan(null);
      setError(result.errorMessage);
    })();
  }, []);

  return { pendingPlan, error, startCheckout };
}
