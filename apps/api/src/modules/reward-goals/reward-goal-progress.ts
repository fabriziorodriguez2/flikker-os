/**
 * La regla de progreso de una tarjeta de sellos, en un solo lugar.
 *
 * Existe porque hay dos formas legítimas de conseguir los insumos: el detalle
 * de UN cliente los cuenta con dos queries puntuales (`currentView`), y la
 * lista de clientes los trae en lote para todo el negocio de una vez. Lo que
 * NO puede haber son dos versiones de la aritmética, porque entonces la lista
 * y el detalle podrían mostrar números distintos del mismo cliente.
 *
 * La suma es deliberadamente aditiva: las visitas y los sellos bonus son dos
 * fuentes de progreso separadas y se mantienen separadas. El bonus por
 * feedback NUNCA crea una Visit falsa — un sello extra no es haber pisado el
 * local, y el dueño tiene que poder ver la diferencia.
 */
export interface GoalProgress {
  /** Progreso total en sellos: visitas + bonus. Es lo que llena la tarjeta. */
  progressVisits: number;
  /** Cuántos de esos sellos son visitas reales al local. */
  visitProgress: number;
  /** Cuántos vinieron de completar el feedback. */
  bonusStamps: number;
  targetAdditionalVisits: number;
  /** Nunca negativo: una tarjeta pasada de rosca muestra 0, no un número raro. */
  remainingVisits: number;
}

export function computeGoalProgress(input: {
  visitProgress: number;
  bonusStamps: number;
  targetAdditionalVisits: number;
}): GoalProgress {
  const progressVisits = input.visitProgress + input.bonusStamps;
  return {
    progressVisits,
    visitProgress: input.visitProgress,
    bonusStamps: input.bonusStamps,
    targetAdditionalVisits: input.targetAdditionalVisits,
    remainingVisits: Math.max(0, input.targetAdditionalVisits - progressVisits),
  };
}
