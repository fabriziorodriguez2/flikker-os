"use client";

import { Sparkles } from "lucide-react";
import ProBadge from "./pro-badge";
import { useUpgradeModal } from "./upgrade-modal-provider";

/**
 * El único paywall del panel. Cuatro variantes de la misma pieza, en vez de
 * seis cajas parecidas escritas a mano en seis pantallas — que es exactamente
 * lo que pasa cuando cada superficie inventa su propio "pasate a Pro".
 *
 * Regla de producto que sostiene todo esto: el prompt aparece EN CONTEXTO.
 * Nunca "actualizá porque sí", siempre "estás intentando X / llegaste a Y /
 * detectamos Z". Por eso `evidence` es una prop de primera clase: es el
 * número real del propio negocio que justifica el momento. Si no hay
 * evidencia real, se pasa `undefined` y el prompt se muestra sin inventar
 * una — nunca un número estimado, proyectado ni de ejemplo.
 *
 * El CTA abre `UpgradePlanModal` — nunca navega al checkout ni a la pantalla
 * de Suscripción. Elegir entre mensual y anual es una decisión del dueño, y
 * saltearla le esconde la opción que más le conviene.
 */

/**
 * Sin variante `modal`: ese trabajo es de `UpgradePlanModal`, el único
 * modal del sistema. Tener dos modales de upgrade llevaba a encadenarlos
 * (explicación → elección de plan), que es un click de más para el dueño y
 * dos diseños que se desincronizan.
 */
export type ProUpgradeVariant = "inline" | "card" | "compact";

export interface ProUpgradePromptProps {
  /**
   * Identificador estable de la feature ("reactivacion_automatica",
   * "cumpleanos", "limite_clientes"). No se muestra: existe para que el día
   * que haya analytics, el evento sepa de qué paywall vino sin parsear
   * copy.
   */
  feature: string;
  title: string;
  description: string;
  /**
   * El dato real del negocio que hace relevante ESTE prompt AHORA — "8
   * clientes llevan tiempo sin volver", "42 / 50 clientes". Opcional a
   * propósito: sin datos suficientes se omite, nunca se rellena.
   */
  evidence?: string;
  /**
   * Hasta 3 cosas que Pro habilita PARA ESTA feature. Más de 3 deja de ser
   * contexto y pasa a ser tabla de precios, que es justo lo que este
   * componente evita.
   */
  benefits?: string[];
  /** Texto del CTA primario. Por defecto "Activar Pro". */
  cta?: string;
  /** Acción secundaria opcional ("Ahora no", "Recordármelo después"). */
  secondaryAction?: { label: string; onClick: () => void };
  variant?: ProUpgradeVariant;
}

function PrimaryCta({ feature, label }: { feature: string; label: string }) {
  const { openUpgradeModal } = useUpgradeModal();
  return (
    <button
      type="button"
      onClick={() => openUpgradeModal({ feature })}
      data-pro-feature={feature}
      className="flk-glossy inline-flex h-10 shrink-0 items-center justify-center rounded-[9px] bg-[#6D4AFF] px-4 text-sm font-semibold text-white hover:bg-[#5c3ee0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6D4AFF] focus-visible:ring-offset-2"
    >
      {label}
    </button>
  );
}

function BenefitList({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 space-y-1.5">
      {items.slice(0, 3).map((item) => (
        <li
          key={item}
          className="flex items-start gap-2 text-sm leading-6 text-[#5C6478]"
        >
          <Sparkles
            className="mt-1 h-3.5 w-3.5 shrink-0 text-[#7258D6]"
            aria-hidden="true"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Evidence({ text }: { text: string }) {
  return (
    <p className="mt-2 text-sm font-semibold text-[#202333]">{text}</p>
  );
}

/** Variante de una línea: mismo destino, menos peso visual. */
function CompactCta({ feature, label }: { feature: string; label: string }) {
  const { openUpgradeModal } = useUpgradeModal();
  return (
    <button
      type="button"
      onClick={() => openUpgradeModal({ feature })}
      data-pro-feature={feature}
      className="text-sm font-semibold text-[#6D4AFF] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6D4AFF]"
    >
      {label}
    </button>
  );
}

export default function ProUpgradePrompt({
  feature,
  title,
  description,
  evidence,
  benefits,
  cta = "Activar Pro",
  secondaryAction,
  variant = "card",
}: ProUpgradePromptProps) {
  // ── compact ──────────────────────────────────────────────────────────
  // Una línea. Para listas y filas donde una card rompería el ritmo.
  if (variant === "compact") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <ProBadge />
        <span className="text-sm text-[#5C6478]">{evidence ?? description}</span>
        <CompactCta feature={feature} label={cta} />
      </div>
    );
  }

  // ── inline ───────────────────────────────────────────────────────────
  // Sin borde ni fondo propio: vive DENTRO de una card que ya existe, sin
  // agregarle una segunda caja alrededor.
  if (variant === "inline") {
    return (
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-[#202333]">{title}</h3>
            <ProBadge />
          </div>
          <p className="mt-1 text-sm leading-6 text-[#8891A4]">{description}</p>
          {evidence ? <Evidence text={evidence} /> : null}
          {benefits?.length ? <BenefitList items={benefits} /> : null}
        </div>
        <PrimaryCta feature={feature} label={cta} />
      </div>
    );
  }

  // ── card (default) ───────────────────────────────────────────────────
  return (
    <section className="rounded-[16px] border border-[#E4DFF8] bg-[#FAF9FF] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base font-bold text-[#1A202C]">
              {title}
            </h3>
            <ProBadge />
          </div>
          <p className="mt-1 text-sm leading-6 text-[#5C6478]">{description}</p>
          {evidence ? <Evidence text={evidence} /> : null}
          {benefits?.length ? <BenefitList items={benefits} /> : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <PrimaryCta feature={feature} label={cta} />
          {secondaryAction ? (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="text-xs font-semibold text-[#8891A4] hover:text-[#202333]"
            >
              {secondaryAction.label}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
