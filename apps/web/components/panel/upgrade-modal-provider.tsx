"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import UpgradePlanModal from "./upgrade-plan-modal";
import { parseFreePlanUsage, type FreePlanUsage } from "@/lib/free-plan-usage";

/**
 * Un solo host de modal para todo el panel, y un solo lugar que sabe el
 * estado del plan.
 *
 * La alternativa —`useState` + `<UpgradePlanModal/>` en cada pantalla— ya
 * empezaba a pasar (Automatizaciones tenía el suyo). Con quince pantallas
 * eso son quince estados, quince fetches del plan y quince oportunidades de
 * que una quede desactualizada.
 *
 * El estado del plan se lee UNA vez por sesión de panel y se comparte. Dos
 * consecuencias buenas: los nudges de distintas pantallas nunca se
 * contradicen, y un negocio Pro no paga un round-trip por pantalla para
 * confirmar que no hay que venderle nada.
 *
 * ## La regla del "ante la duda, no vender"
 *
 * `isPro` arranca en `true` y solo baja a `false` cuando el backend lo
 * confirma. Si la llamada falla, el panel se comporta como si fuera Pro: sin
 * nudges, sin meter, sin badges. Mostrarle "pasate a Pro" a alguien que ya
 * paga es peor que no mostrarle nada a alguien que podría pagar.
 *
 * Este provider es exclusivamente para el upgrade de un Business FREE ya
 * creado (dashboard adentro). Pagar ANTES de tener Business es otro flujo
 * por completo (Parte 5D — `/upgrade`, pre-onboarding) y no pasa por acá.
 */

interface UpgradeModalContextValue {
  /** Abre el modal. `feature` viaja al `data-pro-feature` de los CTAs. */
  openUpgradeModal: (options: { feature: string; source?: string }) => void;
  /** `false` solo cuando el backend confirmó que NO es Pro. */
  isPro: boolean;
  /** Evita montar contenido sensible mientras todavía no conocemos el plan. */
  isSubscriptionLoading: boolean;
  /** Uso del tope Free. `null` para Pro, sin tope, o si no se pudo leer. */
  freePlanUsage: FreePlanUsage | null;
  /** ¿Corresponde mostrarle upsell a este negocio? */
  showUpsell: boolean;
  /**
   * Vuelve a pedir el plan al backend. Pensado para después de un checkout
   * (al volver de Mercado Pago) o de cualquier acción que pueda haber
   * cambiado el plan — nunca se llama solo ni en un intervalo.
   */
  refreshSubscription: () => void;
}

const UpgradeModalContext = createContext<UpgradeModalContextValue>({
  openUpgradeModal: () => undefined,
  isPro: true,
  isSubscriptionLoading: true,
  freePlanUsage: null,
  showUpsell: false,
  refreshSubscription: () => undefined,
});

/**
 * Todo componente de upsell pregunta acá antes de dibujarse. Fuera del
 * provider devuelve el default conservador (`isPro: true`), así que un
 * componente montado por error en una superficie sin provider no vende nada.
 */
export function useUpgradeModal(): UpgradeModalContextValue {
  return useContext(UpgradeModalContext);
}

export default function UpgradeModalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState<{ feature: string } | null>(null);
  const [isPro, setIsPro] = useState(true);
  const [isSubscriptionLoading, setIsSubscriptionLoading] = useState(true);
  const [freePlanUsage, setFreePlanUsage] = useState<FreePlanUsage | null>(
    null,
  );
  const [monthlyPrice, setMonthlyPrice] = useState<{
    currency: string;
    amount: number;
  } | null>(null);
  const [notificationWhatsapp, setNotificationWhatsapp] = useState<
    string | null
  >(null);

  /**
   * Parte 5E: el modal necesita saber si este User ya dejó un WhatsApp
   * antes de decidir si se lo pide. `null` cubre tanto "todavía no sabemos"
   * (fetch en curso o caído) como "nunca lo dejó" — en los dos casos pedirlo
   * de nuevo es seguro (como mucho, redundante); lo inseguro sería asumir
   * que existe y no pedirlo.
   */
  const loadNotificationWhatsapp = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/proxy/auth/me");
      if (!res.ok) return;
      const raw: unknown = await res.json();
      if (typeof raw !== "object" || raw === null) return;
      const v = raw as Record<string, unknown>;
      setNotificationWhatsapp(
        typeof v.notificationWhatsapp === "string"
          ? v.notificationWhatsapp
          : null,
      );
    } catch {
      // Silencio deliberado — ver comentario de arriba.
    }
  }, []);

  const loadSubscription = useCallback(async (): Promise<void> => {
    setIsSubscriptionLoading(true);
    try {
      const res = await fetch("/api/proxy/businesses/current/subscription");
      if (!res.ok) return;
      const raw: unknown = await res.json();
      if (typeof raw !== "object" || raw === null) return;
      const v = raw as Record<string, unknown>;

      setIsPro(v.isPro !== false);
      setFreePlanUsage(parseFreePlanUsage(v.freePlanUsage));

      /*
        El precio del modal sale de `selfServicePro`, que es lo que el
        checkout cobra — NO de `priceAmount`, que es lo que este negocio
        paga hoy (0 en Free, o USD 129 en un Pro histórico).
      */
      const pro = v.selfServicePro;
      if (pro && typeof pro === "object") {
        const p = pro as Record<string, unknown>;
        if (typeof p.priceAmount === "number" && p.priceAmount > 0) {
          setMonthlyPrice({
            currency: typeof p.currency === "string" ? p.currency : "UYU",
            amount: p.priceAmount,
          });
        }
      }
    } catch {
      // Silencio deliberado: `isPro` queda en true y no se vende nada.
    } finally {
      setIsSubscriptionLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await Promise.all([loadSubscription(), loadNotificationWhatsapp()]);
    })();
  }, [loadSubscription, loadNotificationWhatsapp]);

  const openUpgradeModal = useCallback(
    ({ feature }: { feature: string; source?: string }) => {
      setOpen({ feature });
    },
    [],
  );

  const refreshSubscription = useCallback(() => {
    void loadSubscription();
  }, [loadSubscription]);

  const value = useMemo<UpgradeModalContextValue>(
    () => ({
      openUpgradeModal,
      isPro,
      isSubscriptionLoading,
      freePlanUsage,
      showUpsell: !isPro,
      refreshSubscription,
    }),
    [
      openUpgradeModal,
      isPro,
      isSubscriptionLoading,
      freePlanUsage,
      refreshSubscription,
    ],
  );

  return (
    <UpgradeModalContext.Provider value={value}>
      {children}
      {open ? (
        <UpgradePlanModal
          feature={open.feature}
          monthlyPrice={monthlyPrice}
          notificationWhatsapp={notificationWhatsapp}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </UpgradeModalContext.Provider>
  );
}
