"use client";

import { useState } from "react";
import { CheckCircle2, Gift, Ticket, type LucideIcon } from "lucide-react";
import RedemptionReveal from "./redemption-reveal";
import SlideToReveal from "./slide-to-reveal";

/**
 * Un beneficio del cliente, en cualquiera de las superficies donde aparece:
 * el check-in (premio recién desbloqueado o beneficio activo), el detalle de
 * un lugar en Mi Flikker y el link directo de una emisión (`/beneficio/{id}`).
 *
 * Antes eran tres implementaciones — `BenefitRewardCard`, `GiftReveal` y
 * `beneficio-client` — con tres formas distintas de mostrar lo mismo. Las
 * diferencias reales son dos, y las dos son props: el rótulo (`eyebrow`) y
 * cómo se revela el código (`reveal`).
 *
 * Lo que NO hace, a propósito:
 *
 *  - No inventa datos. `meta` solo recibe lo que el read-model de esa
 *    superficie tenga de verdad: si un endpoint no devuelve vencimiento, esa
 *    fila simplemente no existe. Nada de "vence" ni "ganado en visita N"
 *    fabricados en el front.
 *  - No dibuja una tarjeta nueva 0/N cuando el beneficio ya está canjeado. El
 *    ciclo siguiente nace con la próxima visita válida; el copy de `footer`
 *    lo dice solo donde esa semántica aplica.
 *  - No esconde emisiones. Dos beneficios con el mismo título y códigos
 *    distintos son dos emisiones reales y se muestran las dos.
 */
export type BenefitReveal = "slide" | "tap" | "none";

export default function BenefitCard({
  title,
  eyebrow,
  description,
  terms,
  code,
  redeemed = false,
  reveal = "tap",
  meta,
  brand = "var(--pub-accent, #5B5BD6)",
  icon: Icon,
  onReveal,
  footer,
}: {
  title: string;
  eyebrow?: string;
  /** Icono por tipo de beneficio; sin él se usa el genérico de ticket. */
  icon?: LucideIcon;
  description?: string | null;
  terms?: string | null;
  /** Código de canje de ESTA emisión. Sin código no hay nada que revelar. */
  code?: string | null;
  redeemed?: boolean;
  reveal?: BenefitReveal;
  /** Filas de datos reales (vencimiento, código, confirmación…). */
  meta?: { label: string; value: string }[];
  /** Color del pulgar del sello deslizable. */
  brand?: string;
  onReveal?: () => void;
  footer?: React.ReactNode;
}) {
  const [tapped, setTapped] = useState(false);
  // El rótulo por defecto sigue al estado: decir "disponible" sobre algo ya
  // canjeado es la clase de detalle que hace dudar al cliente en el mostrador.
  const label = eyebrow ?? (redeemed ? "Beneficio usado" : "Beneficio disponible");

  return (
    <section
      className="relative w-full overflow-hidden rounded-[22px] border p-5 text-left"
      style={{
        backgroundColor: "var(--pub-surface, #FFFFFF)",
        borderColor: "var(--pub-surface-border, #EDEEF5)",
        color: "var(--pub-text, #171A2B)",
      }}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{
            backgroundColor: "var(--pub-surface, #F1F1F8)",
            border: "1px solid var(--pub-surface-border, #E6E7F0)",
            color: "var(--pub-accent, #5B5BD6)",
          }}
        >
          {redeemed ? (
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          ) : Icon ? (
            <Icon className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Ticket className="h-5 w-5" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="text-[11px] font-bold uppercase tracking-[0.1em]"
            style={{ color: "var(--pub-text-muted, #8A91A3)" }}
          >
            {label}
          </p>
          <h2 className="mt-1 text-[19px] font-bold leading-tight tracking-[-0.02em]">
            {title}
          </h2>
        </div>
      </div>

      {description ? (
        <p
          className="mt-3 text-sm leading-5"
          style={{ color: "var(--pub-text-muted, #8A91A3)" }}
        >
          {description}
        </p>
      ) : null}

      {terms ? (
        <p
          className="mt-2 text-[11px] leading-relaxed"
          style={{ color: "var(--pub-text-soft, #A0A8B8)" }}
        >
          <span className="font-bold">Condiciones:</span> {terms}
        </p>
      ) : null}

      {meta && meta.length > 0 ? (
        <dl
          className="mt-4 flex flex-wrap gap-x-8 gap-y-3 border-t pt-3"
          style={{ borderColor: "var(--pub-surface-border, #EDEEF5)" }}
        >
          {meta.map((row) => (
            <div key={row.label}>
              <dt
                className="text-[10px] font-bold uppercase tracking-[0.1em]"
                style={{ color: "var(--pub-text-muted, #8A91A3)" }}
              >
                {row.label}
              </dt>
              <dd className="mt-1 text-sm font-bold">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {redeemed ? (
        <p
          className="mt-4 flex items-center gap-2 rounded-[14px] px-3.5 py-3 text-xs font-bold"
          style={{
            backgroundColor: "var(--pub-surface, #F3F4F9)",
            color: "var(--pub-text-muted, #6B7280)",
          }}
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Ya usaste este beneficio
        </p>
      ) : code ? (
        <div className="mt-5">
          {reveal === "slide" ? (
            <SlideToReveal
              code={code}
              brand={brand}
              onReveal={onReveal ?? (() => undefined)}
            />
          ) : reveal === "tap" && !tapped ? (
            <button
              type="button"
              onClick={() => {
                setTapped(true);
                onReveal?.();
              }}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] text-sm font-bold"
              style={{
                backgroundColor: "var(--pub-accent, #5B5BD6)",
                color: "var(--pub-on-accent, #FFFFFF)",
              }}
            >
              <Gift className="h-4 w-4" aria-hidden="true" />
              Mostrar mi código
            </button>
          ) : (
            // Revelado: SIEMPRE el QR y el código legible juntos — el lector
            // del local puede fallar y el personal tiene que poder tipearlo.
            <RedemptionReveal code={code} redeemPath={`/redeem/${code}`} />
          )}
        </div>
      ) : null}

      {footer ? (
        <div
          className="mt-4 text-xs leading-5"
          style={{ color: "var(--pub-text-muted, #8A91A3)" }}
        >
          {footer}
        </div>
      ) : null}
    </section>
  );
}
