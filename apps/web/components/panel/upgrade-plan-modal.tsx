"use client";

import { useEffect, useRef } from "react";
import { Check, X } from "lucide-react";
import {
  formatPrice,
  PRO_MONTHLY_CHECKOUT_URL,
  PRO_YEARLY_CHECKOUT_URL,
  YEARLY_MONTHS_CHARGED,
  YEARLY_MONTHS_FREE,
  YEARLY_MONTHS_GRANTED,
  yearlyPriceFrom,
} from "@/lib/checkout-urls";

/**
 * El único lugar del producto que manda a pagar.
 *
 * Todo CTA de upgrade abre esto primero. Nunca se salta al checkout: elegir
 * entre mensual y anual es una decisión del dueño, y llevarlo directo a
 * Mercado Pago sin habérsela ofrecido le esconde la opción que más le
 * conviene.
 *
 * El anual tiene más jerarquía visual porque objetivamente vale más — 12
 * meses por el precio de 10. Eso se consigue con borde violeta, badge y CTA
 * primario. NO se consigue escondiendo el mensual: sigue siendo una card
 * completa, con su precio y su botón legible. Un mensual gris ilegible sería
 * exactamente el dark pattern que este modal no quiere ser.
 *
 * Sin countdown, sin "última oportunidad", sin descuento inventado. El único
 * argumento es el real: pagás 10, usás 12.
 */

export interface UpgradePlanModalProps {
  /** Desde dónde se abrió — para el `data-pro-feature` de los CTAs. */
  feature: string;
  /**
   * Precio mensual REAL del plan Pro self-service, tal como lo devuelve el
   * backend. `null` cuando no se pudo leer: las cards se muestran igual,
   * sin precio. Nunca se inventa un número que no coincida con el checkout.
   */
  monthlyPrice: { currency: string; amount: number } | null;
  onClose: () => void;
}

export default function UpgradePlanModal({
  feature,
  monthlyPrice,
  onClose,
}: UpgradePlanModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // ESC cierra. Un modal de venta del que no se sale con el teclado es
  // exactamente la clase de fricción que no queremos.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // El foco entra al modal al abrirse, en el botón de cerrar: la salida es
  // lo primero que encuentra quien navega con teclado.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const yearlyAmount = yearlyPriceFrom(monthlyPrice?.amount);
  const savings =
    monthlyPrice && yearlyAmount !== null
      ? monthlyPrice.amount * YEARLY_MONTHS_GRANTED - yearlyAmount
      : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center overflow-y-auto bg-[#151833]/45 p-4 sm:items-center"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-modal-title"
        aria-describedby="upgrade-modal-subtitle"
        className="my-auto w-full max-w-2xl rounded-[20px] bg-white p-6 shadow-[0_24px_64px_rgba(17,22,59,0.18)] sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2
              id="upgrade-modal-title"
              className="font-display text-[22px] font-bold leading-tight tracking-[-0.02em] text-[#1A202C] sm:text-[26px]"
            >
              Pasate a Flikker Pro
            </h2>
            <p
              id="upgrade-modal-subtitle"
              className="mt-2 text-sm leading-6 text-[#5C6478]"
            >
              Desbloqueá todo el potencial de Flikker para hacer volver más
              clientes.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-1 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[#8891A4] hover:bg-[#F5F6FA] hover:text-[#202333] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6D4AFF]"
          >
            <X className="h-4.5 w-4.5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          {/* ── Mensual ─────────────────────────────────────────────────
              Card neutra y COMPLETA. Menos jerarquía que la anual, pero
              perfectamente legible: es una opción real, no un señuelo. */}
          <section className="flex flex-col rounded-[16px] border border-[#E4E6EF] bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
              Mensual
            </p>
            <p className="mt-1.5 font-display text-base font-bold text-[#1A202C]">
              Flikker Pro
            </p>

            {monthlyPrice ? (
              <p className="mt-4 text-[26px] font-bold leading-none text-[#1A202C]">
                {formatPrice(monthlyPrice.currency, monthlyPrice.amount)}
                <span className="ml-1 text-sm font-medium text-[#8891A4]">
                  /mes
                </span>
              </p>
            ) : null}

            <p className="mt-3 text-sm leading-6 text-[#5C6478]">
              Pagás mes a mes.
            </p>

            {/* `mt-auto` lo pega abajo: las dos cards tienen alturas
                distintas (la anual lista beneficios) y los CTAs alineados
                se leen como un par de opciones, no como una escalera. */}
            <a
              href={PRO_MONTHLY_CHECKOUT_URL}
              data-pro-feature={feature}
              data-plan="monthly"
              className="mt-auto inline-flex h-11 items-center justify-center rounded-[10px] border border-[#D9DCEA] bg-white px-4 pt-0 text-sm font-semibold text-[#1A202C] hover:border-[#6D4AFF] hover:text-[#6D4AFF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6D4AFF]"
            >
              Elegir mensual
            </a>
          </section>

          {/* ── Anual ───────────────────────────────────────────────────
              Más jerarquía: borde violeta, badge, CTA primario. Todo
              justificado por el valor real, ninguno por presión. */}
          <section className="relative flex flex-col rounded-[16px] border-2 border-[#6D4AFF] bg-[#FBFAFF] p-5">
            <span className="absolute -top-2.5 left-5 rounded-full bg-[#6D4AFF] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
              Mejor opción
            </span>

            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7258D6]">
              Anual
            </p>
            <p className="mt-1.5 font-display text-base font-bold text-[#1A202C]">
              Flikker Pro
            </p>

            {yearlyAmount !== null && monthlyPrice ? (
              <p className="mt-4 text-[26px] font-bold leading-none text-[#1A202C]">
                {formatPrice(monthlyPrice.currency, yearlyAmount)}
                <span className="ml-1 text-sm font-medium text-[#8891A4]">
                  /año
                </span>
              </p>
            ) : null}

            <p className="mt-3 text-sm font-semibold leading-6 text-[#1A202C]">
              Pagás {YEARLY_MONTHS_CHARGED} meses y usás{" "}
              {YEARLY_MONTHS_GRANTED}
            </p>

            <ul className="mt-2.5 space-y-1.5">
              <li className="flex items-start gap-2 text-sm leading-6 text-[#5C6478]">
                <Check
                  className="mt-1 h-3.5 w-3.5 shrink-0 text-[#6D4AFF]"
                  aria-hidden="true"
                />
                {YEARLY_MONTHS_FREE} meses incluidos
              </li>
              {savings !== null && monthlyPrice ? (
                <li className="flex items-start gap-2 text-sm leading-6 text-[#5C6478]">
                  <Check
                    className="mt-1 h-3.5 w-3.5 shrink-0 text-[#6D4AFF]"
                    aria-hidden="true"
                  />
                  Ahorrás {formatPrice(monthlyPrice.currency, savings)} al año
                </li>
              ) : null}
            </ul>

            <a
              href={PRO_YEARLY_CHECKOUT_URL}
              data-pro-feature={feature}
              data-plan="yearly"
              className="flk-glossy mt-5 inline-flex h-11 items-center justify-center rounded-[10px] bg-[#6D4AFF] px-4 text-sm font-semibold text-white hover:bg-[#5c3ee0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6D4AFF] focus-visible:ring-offset-2"
            >
              Elegir anual
            </a>
          </section>
        </div>

        <p className="mt-5 text-center text-xs leading-5 text-[#8891A4]">
          El pago se procesa en Mercado Pago. Podés cancelar cuando quieras.
        </p>
      </div>
    </div>
  );
}
