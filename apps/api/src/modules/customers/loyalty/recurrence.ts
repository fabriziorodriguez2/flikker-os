import { CustomerSegment } from '@prisma/client';
import type { VisitFrequency } from '../../retention-v2/visit-frequency';

/**
 * Traduce la segmentación interna a algo que el dueño pueda leer.
 *
 * Retention V2 clasifica clientes para decidir a quién contactar; acá se
 * reusa ESA clasificación (no se recalcula ni se cambia ningún algoritmo)
 * para poner una etiqueta en la lista de clientes. Dos reglas gobiernan la
 * traducción:
 *
 *  1. El enum no se muestra nunca. `AT_RISK` no significa nada para quien
 *     atiende un mostrador.
 *  2. No toda clasificación se muestra. AT_RISK es una PREDICCIÓN ("se está
 *     yendo de su ritmo habitual") y solo tiene sentido cuando el cliente
 *     tiene un ritmo propio medible — con una o dos visitas, el motor cae a
 *     ventanas fijas de 21/45 días, que sirven para decidir un mensaje pero
 *     no para decirle al dueño que su cliente está en riesgo. Ahí preferimos
 *     no etiquetar.
 *
 * INACTIVE sí se muestra siempre: "hace tiempo que no viene" es un hecho
 * observable sobre el pasado, no un pronóstico.
 */

/**
 * Claves de producto, no de dominio. La API nunca devuelve `CustomerSegment`
 * hacia el panel: devuelve una de éstas, y el frontend elige el texto.
 */
export type RecurrenceKey =
  | 'nuevo'
  | 'vuelve_seguido'
  | 'volvio'
  | 'demorado'
  | 'ausente';

export interface RecurrenceInput {
  segment: CustomerSegment;
  frequency: Pick<VisitFrequency, 'visitCount' | 'hasReliableCadence'>;
}

/**
 * Devuelve la etiqueta a mostrar, o `null` cuando no hay evidencia suficiente
 * para afirmar nada. `null` es una respuesta válida y frecuente: es mejor una
 * fila sin etiqueta que una etiqueta inventada.
 */
export function recurrenceKeyFor(input: RecurrenceInput): RecurrenceKey | null {
  const { segment, frequency } = input;

  // Sin visitas no hay comportamiento que describir. Puede pasar con clientes
  // importados por CSV, que existen pero nunca pisaron el local.
  if (frequency.visitCount === 0) return null;

  switch (segment) {
    case CustomerSegment.RECOVERED:
      return 'volvio';

    case CustomerSegment.INACTIVE:
      return 'ausente';

    case CustomerSegment.AT_RISK:
      // La única clasificación que se descarta por falta de evidencia. Sin
      // cadencia propia (3+ visitas) degradamos a lo que sí sabemos: si
      // volvió alguna vez, "vuelve seguido"; si vino una sola vez, "nuevo".
      if (!frequency.hasReliableCadence) {
        return frequency.visitCount > 1 ? 'vuelve_seguido' : 'nuevo';
      }
      return 'demorado';

    case CustomerSegment.FREQUENT:
    case CustomerSegment.REPEAT:
      return 'vuelve_seguido';

    case CustomerSegment.NEW:
      return 'nuevo';
  }
}

/**
 * Frase sobre la frecuencia del cliente, o `null` si no se puede afirmar.
 *
 * Solo se calcula con `hasReliableCadence` (3+ visitas, o sea 2+ intervalos
 * reales). Con una sola visita no existe intervalo alguno, y con dos un único
 * intervalo no es una frecuencia: es una coincidencia.
 */
export function approximateCadencePhrase(
  frequency: Pick<VisitFrequency, 'hasReliableCadence' | 'typicalIntervalDays'>,
): string | null {
  if (!frequency.hasReliableCadence || frequency.typicalIntervalDays === null) {
    return null;
  }

  const days = frequency.typicalIntervalDays;
  if (days <= 2) return 'Viene casi todos los días';
  if (days <= 10) return 'Viene aproximadamente una vez por semana';
  if (days <= 20) return 'Viene aproximadamente cada dos semanas';
  if (days <= 45) return 'Viene aproximadamente una vez por mes';
  if (days <= 100) return 'Viene cada dos o tres meses';
  return 'Viene muy de vez en cuando';
}
