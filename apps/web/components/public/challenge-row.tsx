import Link from "next/link";
import { Check, Flame, Gift, Hourglass, Target } from "lucide-react";

export type ChallengeKind = "mission" | "streak" | "return_challenge";

export interface ChallengeRowProps {
  kind: ChallengeKind;
  title: string;
  subtitle?: string | null;
  /** Progreso real. Nunca se pasa `{0, N}` decorativo: sin dato, no va. */
  progress?: { current: number; target: number } | null;
  /** Texto ya formateado del plazo — el día viene resuelto por el backend. */
  deadline?: string | null;
  /** El premio, cuando el desafío tiene uno que mostrar. */
  reward?: { label: string; detail?: string | null } | null;
  status?: "active" | "completed";
  business?: { name: string } | null;
  /** Lista global de Desafíos: `true`. Dentro de un negocio: `false`. */
  showBusiness?: boolean;
  /**
   * `card` es la variante del check-in: mismo componente, algo más de aire y
   * sin el encabezado de negocio (ahí ya se sabe en qué local está parado).
   */
  variant?: "row" | "card";
  /** Contenido extra al pie (ej. la aclaración de sellos del check-in). */
  footnote?: string | null;
  /**
   * A dónde lleva la fila. Solo lo usa la lista global, donde el desafío es
   * de otro lugar y hace falta poder ir hasta él; dentro del propio negocio
   * el link sería circular.
   */
  href?: string | null;
  linkLabel?: string;
}

const ICONS = {
  mission: Target,
  streak: Flame,
  return_challenge: Hourglass,
} as const;

/**
 * Un desafío, en cualquiera de las tres superficies donde aparece: la lista
 * global de Mi Flikker, el detalle de un lugar y el check-in.
 *
 * Antes había tres markups distintos para la misma información — misiones y
 * rachas se dibujaban por separado en `challenges-tab`, en `place-detail` y
 * dentro de `checkin-client` — y ya habían empezado a divergir en copy y en
 * jerarquía. Las diferencias reales entre superficies son dos, y las dos son
 * props: si se nombra el negocio (`showBusiness`) y cuánto aire tiene
 * (`variant`).
 *
 * Colores por tokens: dentro de la experiencia de un negocio toma su tema;
 * en Mi Flikker cae al chrome neutro de Flikker, que es lo correcto — ahí la
 * lista mezcla desafíos de varios locales y ninguno debería pintar el resto.
 */
export default function ChallengeRow({
  kind,
  title,
  subtitle,
  progress,
  deadline,
  reward,
  status = "active",
  business,
  showBusiness = false,
  variant = "row",
  footnote,
  href,
  linkLabel = "Ver mi tarjeta",
}: ChallengeRowProps) {
  const Icon = status === "completed" ? Check : ICONS[kind];
  const done = status === "completed";

  return (
    <li
      className={`list-none rounded-[20px] border ${
        variant === "card" ? "p-4" : "p-4"
      }`}
      style={{
        backgroundColor: "var(--pub-surface, #FFFFFF)",
        borderColor: "var(--pub-surface-border, #EDEEF5)",
      }}
    >
      {showBusiness && business ? (
        <p
          className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em]"
          style={{ color: "var(--pub-text-muted, #8A91A3)" }}
        >
          {business.name}
        </p>
      ) : null}

      <div className="flex items-start gap-2.5">
        <Icon
          className="mt-0.5 h-4 w-4 shrink-0"
          style={{ color: "var(--pub-accent, #6A5DF0)" }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h3
            className="text-[15px] font-bold leading-tight tracking-[-0.01em]"
            style={{ color: "var(--pub-text, #171A2B)" }}
          >
            {title}
          </h3>

          {subtitle ? (
            <p
              className="mt-1 text-[13px] leading-5"
              style={{ color: "var(--pub-text-muted, #8A91A3)" }}
            >
              {subtitle}
            </p>
          ) : null}

          {/*
            `target > 1`, no `> 0`: con target=1 (una misión "vení una vez
            este mes", `targetVisits` mínimo permitido en el editor — ver
            mission-editor-modal.tsx) esto dibujaba UN solo punto suelto
            debajo del subtítulo. Un dot no representa nada con un solo paso
            — ya está dicho en texto ("0 de 1 visitas" / "¡Completado!") — y
            visualmente quedaba como un bullet decorativo huérfano, la causa
            real del layout roto que se veía en "Volvé antes de..." con
            target=1.
          */}
          {progress && progress.target > 1 ? (
            <ProgressDots
              current={progress.current}
              target={progress.target}
              done={done}
            />
          ) : null}

          {deadline ? (
            <p
              className="mt-2 text-[12px] font-semibold"
              style={{ color: "var(--pub-text-muted, #8A91A3)" }}
            >
              {deadline}
            </p>
          ) : null}
        </div>
      </div>

      {reward ? (
        <div className="mt-3 flex items-start gap-2">
          <Gift
            className="mt-0.5 h-4 w-4 shrink-0"
            style={{ color: "var(--pub-accent, #6A5DF0)" }}
            aria-hidden="true"
          />
          <p
            className="text-[13px] leading-5"
            style={{ color: "var(--pub-text-muted, #8A91A3)" }}
          >
            <span
              className="font-semibold"
              style={{ color: "var(--pub-text, #171A2B)" }}
            >
              {reward.label}
            </span>
            {reward.detail ? ` — ${reward.detail}` : ""}
          </p>
        </div>
      ) : null}

      {footnote ? (
        <p
          className="mt-3 text-[12px] leading-5"
          style={{ color: "var(--pub-text-muted, #8A91A3)" }}
        >
          {footnote}
        </p>
      ) : null}

      {href ? (
        <Link
          href={href}
          className="mt-3 inline-block text-[13px] font-semibold underline underline-offset-2"
          style={{ color: "var(--pub-accent, #6A5DF0)" }}
        >
          {linkLabel}
        </Link>
      ) : null}
    </li>
  );
}

/**
 * Los puntitos del progreso. Hasta 10; más allá el número solo alcanza y la
 * grilla se vuelve ruido.
 */
function ProgressDots({
  current,
  target,
  done,
}: {
  current: number;
  target: number;
  done: boolean;
}) {
  if (target > 10) return null;
  return (
    <div
      className="mt-2.5 flex flex-wrap gap-1.5"
      role="img"
      aria-label={`${current} de ${target}`}
    >
      {Array.from({ length: target }, (_, index) => (
        <span
          key={index}
          className="h-2.5 w-2.5 rounded-full"
          style={{
            backgroundColor:
              index < current || done
                ? "var(--pub-accent, #6A5DF0)"
                : "var(--pub-surface-border, #E2E4EF)",
          }}
        />
      ))}
    </div>
  );
}
