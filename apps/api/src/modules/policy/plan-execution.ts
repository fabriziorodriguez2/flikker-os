import { AutonomyMode, type Prisma } from '@prisma/client';

type Db = Prisma.TransactionClient;

/**
 * ¿Se pueden ejecutar de verdad (reclutar y enviar) los planes comerciales de
 * Intelligence en este negocio? Las cuatro cosas, siempre juntas:
 *
 * - modo autónomo en PILOT (lo activa Platform Admin con confirmación);
 * - planificador prendido;
 * - ejecución de planes autorizada explícitamente (otra confirmación);
 * - envíos sin pausar.
 *
 * Se revisa al crear el plan y de nuevo antes de cada envío: si alguien lo
 * apaga a mitad de camino, lo que quedaba pendiente no sale.
 */
export async function planExecutionAllowed(
  db: Db,
  businessId: string,
): Promise<boolean> {
  const policy = await db.businessPolicy.findUnique({
    where: { businessId },
    select: {
      autonomyMode: true,
      autonomyPlannerEnabled: true,
      autonomyPlannerExecutionEnabled: true,
      paused: true,
    },
  });
  return Boolean(
    policy &&
    policy.autonomyMode === AutonomyMode.PILOT &&
    policy.autonomyPlannerEnabled &&
    policy.autonomyPlannerExecutionEnabled &&
    !policy.paused,
  );
}

/** Reemplaza {nombre} por el primer nombre (o lo quita si no hay). */
export function renderPlanMessage(
  template: string,
  customerName: string | null,
): string {
  const first = customerName?.trim().split(/\s+/)[0] ?? '';
  const text = template
    .replace(/\s*\{nombre\}/g, first ? ` ${first}` : '')
    // Sin nombre al principio quedaba ", tu mesa te espera.": fuera la
    // puntuación suelta inicial.
    .replace(/^[\s,;:]+/, '')
    .replace(/\s+([,.!?])/g, '$1');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
