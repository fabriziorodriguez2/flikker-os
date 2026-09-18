"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Lock, Sparkles, X } from "lucide-react";

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
 * El CTA lleva a `/dashboard/settings/suscripcion`, no directo al checkout:
 * ahí vive el precio real, el estado del trial y el plan actual. Mandar a
 * pagar sin esa pantalla de por medio sería vender a ciegas.
 */

/** A dónde va siempre el CTA primario. Un solo lugar. */
const SUBSCRIPTION_HREF = "/dashboard/settings/suscripcion";

export type ProUpgradeVariant = "inline" | "card" | "modal" | "compact";

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
  /**
   * Acción secundaria. En `modal` es obligatoria en la práctica ("Ahora
   * no") — un modal sin salida clara es un dark pattern.
   */
  secondaryAction?: { label: string; onClick: () => void };
  variant?: ProUpgradeVariant;
  /** Solo `modal`: cerrar con Escape, backdrop o la X. */
  onDismiss?: () => void;
}

function ProBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#F1EDFF] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7258D6]">
      <Lock className="h-3 w-3" aria-hidden="true" />
      Pro
    </span>
  );
}

function PrimaryCta({ feature, label }: { feature: string; label: string }) {
  return (
    <Link
      href={SUBSCRIPTION_HREF}
      data-pro-feature={feature}
      className="flk-glossy inline-flex h-10 shrink-0 items-center justify-center rounded-[9px] bg-[#6D4AFF] px-4 text-sm font-semibold text-white hover:bg-[#5c3ee0]"
    >
      {label}
    </Link>
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

export default function ProUpgradePrompt({
  feature,
  title,
  description,
  evidence,
  benefits,
  cta = "Activar Pro",
  secondaryAction,
  variant = "card",
  onDismiss,
}: ProUpgradePromptProps) {
  /*
    El modal se cierra con Escape. Un paywall del que solo se sale con el
    mouse, o del que no se sale, es exactamente el patrón que este sistema
    no quiere tener.
  */
  const dismiss = onDismiss ?? secondaryAction?.onClick;

  useEffect(() => {
    if (variant !== "modal" || !dismiss) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [variant, dismiss]);

  // ── compact ──────────────────────────────────────────────────────────
  // Una línea. Para listas y filas donde una card rompería el ritmo.
  if (variant === "compact") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <ProBadge />
        <span className="text-sm text-[#5C6478]">{evidence ?? description}</span>
        <Link
          href={SUBSCRIPTION_HREF}
          data-pro-feature={feature}
          className="text-sm font-semibold text-[#6D4AFF] hover:underline"
        >
          {cta}
        </Link>
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

  // ── modal ────────────────────────────────────────────────────────────
  // Se abre al INTENTAR usar la feature. Nunca al entrar a una pantalla:
  // un modal que interrumpe sin que el dueño haya pedido nada es ruido.
  if (variant === "modal") {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-[#151833]/40 p-4 sm:items-center"
        role="presentation"
        onClick={(event) => {
          if (event.target === event.currentTarget) dismiss?.();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`pro-modal-${feature}`}
          className="w-full max-w-md rounded-[18px] bg-white p-6 shadow-[0_24px_60px_rgba(17,22,59,0.22)]"
        >
          <div className="flex items-start justify-between gap-3">
            <ProBadge />
            {dismiss ? (
              <button
                type="button"
                onClick={dismiss}
                aria-label="Cerrar"
                className="-mr-1 -mt-1 inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#8891A4] hover:bg-[#F5F6FA] hover:text-[#202333]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <h2
            id={`pro-modal-${feature}`}
            className="mt-3 font-display text-lg font-bold text-[#1A202C]"
          >
            {title}
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-[#5C6478]">
            {description}
          </p>
          {evidence ? <Evidence text={evidence} /> : null}
          {benefits?.length ? (
            <>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
                Con Pro podés
              </p>
              <BenefitList items={benefits} />
            </>
          ) : null}

          <div className="mt-6 flex items-center justify-end gap-3">
            {secondaryAction ? (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                className="text-sm font-semibold text-[#8891A4] hover:text-[#202333]"
              >
                {secondaryAction.label}
              </button>
            ) : null}
            <PrimaryCta feature={feature} label={cta} />
          </div>
        </div>
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
