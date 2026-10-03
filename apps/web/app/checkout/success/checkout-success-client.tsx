"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  isCheckoutPaid,
  parsePreOnboardingCheckoutStatus,
  shouldKeepPolling,
  type CheckoutLeadStatus,
} from "@/lib/checkout-lead-status";

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_MS = 20000;

/**
 * Nunca dice "Pago confirmado" ni "Ya sos Pro" de entrada — ni siquiera
 * sabe si de verdad se pagó hasta consultar al backend. `GET
 * /auth/me/checkout` reconcilia contra Mercado Pago cuando hace falta (la
 * misma lógica del webhook, nunca una heurística propia), así que esta
 * pantalla no depende exclusivamente de que el webhook ya haya llegado.
 *
 * El polling tiene un techo (`MAX_POLL_MS`) — nunca espera para siempre.
 * Agotado el tiempo sin PAID, se ofrece reintentar a mano; NUNCA se manda
 * a `/comenzar` como si fuera gratis solo porque se acabó el tiempo: puede
 * haber pagado de verdad y el webhook estar demorado.
 */
export default function CheckoutSuccessClient() {
  const router = useRouter();
  const [phase, setPhase] = useState<"polling" | "timeout">("polling");
  const startRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const checkOnce = useCallback(async (): Promise<CheckoutLeadStatus | null> => {
    try {
      const res = await fetch("/api/proxy/auth/me/checkout");
      const raw: unknown = await res.json().catch(() => null);
      return parsePreOnboardingCheckoutStatus(raw).status;
    } catch {
      return null;
    }
  }, []);

  const runPollLoop = useCallback(() => {
    setPhase("polling");
    startRef.current = Date.now();

    const tick = async () => {
      const status = await checkOnce();
      if (cancelledRef.current) return;

      if (isCheckoutPaid(status)) {
        router.replace("/comenzar");
        return;
      }

      const elapsed = Date.now() - startRef.current;
      if (shouldKeepPolling(status, elapsed, MAX_POLL_MS)) {
        timerRef.current = setTimeout(() => void tick(), POLL_INTERVAL_MS);
      } else {
        setPhase("timeout");
      }
    };
    void tick();
  }, [checkOnce, router]);

  useEffect(() => {
    cancelledRef.current = false;
    runPollLoop();
    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F6FA] px-4">
      <div className="w-full max-w-md rounded-[20px] bg-white p-8 text-center shadow-[0_24px_64px_rgba(17,22,59,0.10)]">
        {phase === "polling" ? (
          <>
            <Loader2
              className="mx-auto h-8 w-8 animate-spin text-[#6D4AFF]"
              aria-hidden="true"
            />
            <p className="mt-4 text-base font-semibold text-[#1A202C]">
              Estamos confirmando tu suscripción
            </p>
            <p className="mt-2 text-sm leading-6 text-[#5C6478]">
              Esto puede tardar unos segundos.
            </p>
          </>
        ) : (
          <>
            <p className="text-base font-semibold text-[#1A202C]">
              Tu suscripción todavía se está confirmando.
            </p>
            <p className="mt-2 text-sm leading-6 text-[#5C6478]">
              A veces Mercado Pago tarda un poco más. Podés volver a comprobar
              cuando quieras.
            </p>
            <button
              type="button"
              onClick={runPollLoop}
              className="mt-5 inline-flex h-11 items-center justify-center rounded-[10px] bg-[#6D4AFF] px-5 text-sm font-semibold text-white hover:bg-[#5c3ee0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6D4AFF] focus-visible:ring-offset-2"
            >
              Volver a comprobar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
