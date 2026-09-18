import Link from "next/link";

/**
 * El tope real del plan Free, mostrado sin dramatizar.
 *
 * El límite que existe de verdad es `Plan.maxCustomers` (50 en Free, `null`
 * en Pro) y lo aplica `PlansService.canAddParticipant`: cuenta CLIENTES
 * PARTICIPANTES — los que tienen al menos un `CustomerRewardGoal`, no todos
 * los contactos del negocio. Este medidor muestra exactamente ese par de
 * números, sin recalcular nada: el numerador y el denominador vienen del
 * backend.
 *
 * Tres estados, y el copy cambia solo cuando cambia el hecho:
 *
 *   < 80%   → neutral. No se dice nada más: no hay ninguna decisión que
 *             tomar todavía y meter un CTA acá sería ruido permanente.
 *   >= 80%  → "Te quedan N lugares para nuevos clientes." + "Ver Pro".
 *   >= 100% → "Llegaste al límite del plan Gratis." + "Ver Pro".
 *
 * Deliberadamente sin cuenta regresiva, sin rojo de alarma y sin "estás
 * perdiendo clientes": llegar al tope no rompe nada de lo que el negocio ya
 * tiene — los clientes que ya participaban siguen sumando sellos y
 * canjeando. Lo único que no puede pasar es que ALGUIEN NUEVO empiece una
 * tarjeta, y eso es lo que dice el texto.
 */
export default function PlanUsageMeter({
  used,
  limit,
  blockedLast7Days = 0,
  className = "",
}: {
  /** Clientes que ya participan (tienen al menos una tarjeta). */
  used: number;
  /** `Plan.maxCustomers`. `null` = Pro o negocio sin tope: no se muestra. */
  limit: number | null;
  /**
   * PERSONAS distintas que no pudieron arrancar su tarjeta por el tope, en
   * los últimos 7 días (`COUNT(DISTINCT customer_id)` sobre los bloqueos
   * que el motor ya registraba). Se puede decir "personas" y no "intentos"
   * justamente porque se deduplica por cliente real.
   *
   * En 0 no se menciona: inventar una demanda perdida que no se midió sería
   * exactamente la clase de número que este producto no muestra.
   */
  blockedLast7Days?: number;
  className?: string;
}) {
  // Sin tope no hay medidor que mostrar. Dibujar una barra "ilimitada" sería
  // inventar una escala que no existe.
  if (limit == null || limit <= 0) return null;

  const pct = Math.min(100, Math.round((used / limit) * 100));
  const remaining = Math.max(0, limit - used);
  const atLimit = used >= limit;
  const nearLimit = !atLimit && pct >= 80;

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
          Plan Gratis
        </p>
        <p className="text-sm font-semibold text-[#202333] tabular-nums">
          {used} / {limit} clientes
        </p>
      </div>

      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#ECEEF6]"
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-label={`${used} de ${limit} clientes del plan Gratis`}
      >
        <div
          className={`h-full rounded-full transition-[width] ${
            atLimit || nearLimit ? "bg-[#6D4AFF]" : "bg-[#AEB4C9]"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {atLimit || nearLimit ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-xs leading-5 text-[#5C6478]">
            {atLimit
              ? "Llegaste al límite del plan Gratis."
              : `Te ${remaining === 1 ? "queda" : "quedan"} ${remaining} ${
                  remaining === 1 ? "lugar" : "lugares"
                } para nuevos clientes.`}
          </p>
          <Link
            href="/dashboard/settings/suscripcion"
            data-pro-feature="customer_limit"
            className="text-xs font-semibold text-[#6D4AFF] hover:underline"
          >
            Ver Pro
          </Link>
        </div>
      ) : null}

      {/*
        La consecuencia concreta del tope. Dos textos distintos porque son
        dos hechos distintos, y ninguno se afirma sin respaldo:
        con bloqueos medidos se dice cuántos fueron; sin bloqueos se habla
        en futuro, que es lo único cierto todavía.
      */}
      {atLimit ? (
        <p className="mt-1.5 text-xs leading-5 text-[#5C6478]">
          {blockedLast7Days > 0
            ? blockedLast7Days === 1
              ? "Esta semana 1 cliente nuevo no pudo sumarse."
              : `Esta semana ${blockedLast7Days} clientes nuevos no pudieron sumarse.`
            : "Los próximos clientes nuevos no podrán sumarse hasta que amplíes el plan."}
        </p>
      ) : null}
    </div>
  );
}
