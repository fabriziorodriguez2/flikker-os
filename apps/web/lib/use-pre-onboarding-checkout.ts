"use client";

import { useCallback, useRef, useState } from "react";
import {
  buildProCheckoutRequestBody,
  parseProCheckoutResponse,
  CHECKOUT_GENERIC_ERROR_MESSAGE,
  type CheckoutPlan,
} from "@/lib/pro-checkout";

/**
 * Checkout Pro PRE-onboarding (Parte 5D) — el equivalente a
 * `useProCheckout`, pero para `/upgrade`: un usuario recién verificado que
 * todavía no tiene Business. Mismo contrato de body/respuesta (`lib/
 * pro-checkout.ts`, reusado tal cual), endpoint distinto: el Business sale
 * de la sesión en `useProCheckout` (`/businesses/current/checkout`), acá
 * directamente no existe todavía — el backend resuelve el User de la
 * sesión y valida ahí que el plan coincida con `pendingUpgradePlan`.
 */
export interface UsePreOnboardingCheckoutResult {
  pendingPlan: CheckoutPlan | null;
  error: string | null;
  startCheckout: (plan: CheckoutPlan) => void;
}

export function usePreOnboardingCheckout(): UsePreOnboardingCheckoutResult {
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
        response = await fetch("/api/proxy/auth/me/checkout", {
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
