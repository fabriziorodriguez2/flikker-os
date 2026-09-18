/**
 * Uso del tope del plan Gratis, tal como lo devuelve
 * `PlansService.getFreePlanUsage` dentro de
 * `GET /businesses/current/subscription`.
 *
 * Un solo parser compartido entre Inicio (cliente) e Insights (servidor):
 * las dos pantallas muestran el mismo hecho, y si cada una lo validara a su
 * manera terminarían mostrando números distintos ante la misma respuesta.
 *
 * `null` significa "no aplica" — negocio Pro, o sin tope (LEGACY, Platform
 * Admin, o anterior a la feature). No es un error ni un cero: es la
 * ausencia de límite, y ninguna superficie debe mostrar nada en ese caso.
 */
export interface FreePlanUsage {
  /** Clientes que ya participan (al menos una tarjeta). */
  current: number;
  /** `Plan.maxCustomers` del plan Gratis. */
  limit: number;
  /** PERSONAS distintas bloqueadas por el tope en los últimos 7 días. */
  blockedCustomersLast7Days: number;
  /** Las mismas, en lo que va del mes corriente (UTC). */
  blockedCustomersThisMonth: number;
}

/**
 * Valida la forma sin adivinar valores: si falta cualquiera de los cuatro
 * números, devuelve `null` en vez de rellenar con ceros. Un cero inventado
 * acá se leería en pantalla como "no hubo nadie bloqueado", que es una
 * afirmación sobre datos que no tenemos.
 */
export function parseFreePlanUsage(value: unknown): FreePlanUsage | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.current !== "number" ||
    typeof v.limit !== "number" ||
    typeof v.blockedCustomersLast7Days !== "number" ||
    typeof v.blockedCustomersThisMonth !== "number"
  ) {
    return null;
  }
  return {
    current: v.current,
    limit: v.limit,
    blockedCustomersLast7Days: v.blockedCustomersLast7Days,
    blockedCustomersThisMonth: v.blockedCustomersThisMonth,
  };
}

/** ¿Está el negocio en el tope (o pasado)? La condición de todo el nudge. */
export function isAtPlanLimit(usage: FreePlanUsage): boolean {
  return usage.current >= usage.limit;
}
