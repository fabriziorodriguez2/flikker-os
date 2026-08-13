import { CustomerSegment } from '@prisma/client';
import { computeVisitFrequency } from '../../retention-v2/visit-frequency';
import { approximateCadencePhrase, recurrenceKeyFor } from './recurrence';

const NOW = new Date('2026-08-12T12:00:00.000Z');
const day = (offset: number) => new Date(NOW.getTime() - offset * 86_400_000);

const freq = (offsets: number[]) =>
  computeVisitFrequency(offsets.map(day), NOW);

describe('recurrenceKeyFor — el enum nunca sale a la pantalla', () => {
  it.each([
    [CustomerSegment.NEW, 'nuevo'],
    [CustomerSegment.REPEAT, 'vuelve_seguido'],
    [CustomerSegment.FREQUENT, 'vuelve_seguido'],
    [CustomerSegment.INACTIVE, 'ausente'],
    [CustomerSegment.RECOVERED, 'volvio'],
  ])('%s se traduce a %s', (segment, expected) => {
    expect(
      recurrenceKeyFor({ segment, frequency: freq([30, 20, 10, 2]) }),
    ).toBe(expected);
  });

  it('sin visitas no etiqueta nada: no hay comportamiento que describir', () => {
    expect(
      recurrenceKeyFor({
        segment: CustomerSegment.NEW,
        frequency: freq([]),
      }),
    ).toBeNull();
  });

  /**
   * El pedido explícito: nada de "en riesgo" dramático con una sola visita.
   * AT_RISK es la única clasificación predictiva, y solo se muestra cuando el
   * cliente tiene cadencia propia (3+ visitas).
   */
  it('AT_RISK con UNA sola visita NO se muestra como demorado', () => {
    const result = recurrenceKeyFor({
      segment: CustomerSegment.AT_RISK,
      frequency: freq([25]),
    });

    expect(result).not.toBe('demorado');
    expect(result).toBe('nuevo');
  });

  it('AT_RISK con dos visitas tampoco: dos visitas no son un ritmo', () => {
    const frequency = freq([50, 40]);
    expect(frequency.hasReliableCadence).toBe(false);

    expect(
      recurrenceKeyFor({ segment: CustomerSegment.AT_RISK, frequency }),
    ).toBe('vuelve_seguido');
  });

  it('AT_RISK con cadencia propia SÍ se muestra como demorado', () => {
    const frequency = freq([60, 53, 46, 39]);
    expect(frequency.hasReliableCadence).toBe(true);

    expect(
      recurrenceKeyFor({ segment: CustomerSegment.AT_RISK, frequency }),
    ).toBe('demorado');
  });

  /**
   * INACTIVE sí se muestra siempre: "hace tiempo que no viene" es un hecho
   * sobre el pasado, no un pronóstico. Es justo lo que el dueño necesita ver
   * del que vino una vez y nunca volvió.
   */
  it('INACTIVE con una sola visita se muestra igual — es un hecho, no una predicción', () => {
    expect(
      recurrenceKeyFor({
        segment: CustomerSegment.INACTIVE,
        frequency: freq([200]),
      }),
    ).toBe('ausente');
  });
});

describe('approximateCadencePhrase — no inventar estadística', () => {
  it('con una sola visita no dice nada', () => {
    expect(approximateCadencePhrase(freq([3]))).toBeNull();
  });

  it('con dos visitas tampoco: un intervalo no es una frecuencia', () => {
    expect(approximateCadencePhrase(freq([10, 3]))).toBeNull();
  });

  it('con tres visitas semanales dice "una vez por semana"', () => {
    expect(approximateCadencePhrase(freq([21, 14, 7]))).toBe(
      'Viene aproximadamente una vez por semana',
    );
  });

  it('con visitas mensuales dice "una vez por mes"', () => {
    expect(approximateCadencePhrase(freq([90, 60, 30]))).toBe(
      'Viene aproximadamente una vez por mes',
    );
  });
});
