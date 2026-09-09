import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/**
 * El estado sin datos y el estado de error de toda la superficie pública V2:
 * un ícono suave, un título, una explicación sin culpa y UNA acción.
 *
 * La misma estructura para los dos casos a propósito. "No tenés desafíos
 * todavía" y "este link ya venció" son la misma situación desde el lado del
 * cliente — no hay nada para hacer acá y hace falta saber a dónde ir — y
 * tratarlas distinto solo hacía que una de las dos se sintiera una falla.
 *
 * Los colores salen de los tokens `--pub-*` cuando la pantalla los define
 * (check-in, detalle de lugar) y caen al chrome neutro de Flikker cuando no
 * (Mi Flikker, pantallas de error sueltas). Sin `bg-white` fijo: sobre un
 * negocio de fondo oscuro quedaría un recuadro blanco flotando.
 *
 * Nunca se pasa acá el motivo interno de un 404 — ver `description` en cada
 * uso: son mensajes neutros, iguales para "no existe" y "no es tuyo".
 */
export default function PublicState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  tone = "neutral",
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; href?: string; onClick?: () => void };
  secondaryAction?: { label: string; href?: string; onClick?: () => void };
  /** `warning` solo cambia el color del ícono — nunca el tono del texto. */
  tone?: "neutral" | "warning";
  compact?: boolean;
}) {
  return (
    <section
      className={`flex w-full flex-col items-center text-center ${
        compact ? "py-6" : "py-10"
      }`}
    >
      <span
        className="flex h-14 w-14 items-center justify-center rounded-[18px]"
        style={
          tone === "warning"
            ? { backgroundColor: "#FBF0DA", color: "#9A6B08" }
            : {
                backgroundColor: "var(--pub-surface, #EDEDFB)",
                color: "var(--pub-accent, #5B5BD6)",
              }
        }
      >
        <Icon className="h-6 w-6" aria-hidden="true" strokeWidth={1.8} />
      </span>

      <h2
        className="mt-4 text-balance text-[20px] font-bold leading-tight tracking-[-0.03em]"
        style={{ color: "var(--pub-text, #171A2B)" }}
      >
        {title}
      </h2>

      {description ? (
        <p
          className="mt-2 max-w-[32ch] text-sm leading-6"
          style={{ color: "var(--pub-text-muted, #8A91A3)" }}
        >
          {description}
        </p>
      ) : null}

      {action ? <Action {...action} primary /> : null}
      {secondaryAction ? <Action {...secondaryAction} /> : null}
    </section>
  );
}

function Action({
  label,
  href,
  onClick,
  primary = false,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  primary?: boolean;
}) {
  const className = primary
    ? "mt-5 inline-flex h-12 w-full max-w-[280px] items-center justify-center rounded-[14px] px-5 text-sm font-bold"
    : "mt-3 text-sm font-semibold underline underline-offset-2";
  const style = primary
    ? {
        backgroundColor: "var(--pub-accent, #5B5BD6)",
        color: "var(--pub-on-accent, #FFFFFF)",
      }
    : { color: "var(--pub-text-muted, #8A91A3)" };

  if (href) {
    return (
      <Link href={href} className={className} style={style}>
        {label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} style={style}>
      {label}
    </button>
  );
}
