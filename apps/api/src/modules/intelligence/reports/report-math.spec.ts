import {
  csvCell,
  csvRow,
  deltas,
  monthRanges,
  parseDay,
  percent,
  ratio,
  ReportRangeError,
  resolveRange,
  type Metric,
} from './report-math';
import { collectGroundedFacts, validateAgentAnswer } from '../agent/grounding';

const TZ = 'America/Montevideo'; // UTC-3, sin horario de verano
const NOW = new Date('2026-11-10T15:00:00Z');

describe('parseDay', () => {
  it('acepta fechas reales y rechaza inventadas', () => {
    expect(parseDay('2026-10-31')).toEqual({ y: 2026, m: 10, d: 31 });
    expect(parseDay('2026-02-30')).toBeNull();
    expect(parseDay('31/10/2026')).toBeNull();
    expect(parseDay(20261031)).toBeNull();
  });
});

describe('resolveRange — días locales del negocio', () => {
  it('octubre en Montevideo empieza y termina a medianoche local', () => {
    const range = resolveRange('2026-10-01', '2026-10-31', TZ, NOW);
    expect(range.start.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-11-01T03:00:00.000Z');
    expect(range.partial).toBe(false);
  });

  it('un período que todavía no terminó se corta en "ahora" y se marca', () => {
    const range = resolveRange('2026-11-01', '2026-11-30', TZ, NOW);
    expect(range.end).toEqual(NOW);
    expect(range.partial).toBe(true);
  });

  it.each([
    ['2026-10-31', '2026-10-01', 'posterior'],
    ['2026-12-01', '2026-12-31', 'todavía no empezó'],
    ['2019-12-31', '2020-01-31', 'antes de 2020'],
    ['2024-01-01', '2026-01-01', 'no puede superar'],
    ['2026-13-01', '2026-13-31', 'formato'],
  ])('rechaza %s → %s', (from, to, message) => {
    expect(() => resolveRange(from, to, TZ, NOW)).toThrow(ReportRangeError);
    expect(() => resolveRange(from, to, TZ, NOW)).toThrow(message);
  });
});

describe('monthRanges', () => {
  it('mes y mes anterior, incluido el cambio de año', () => {
    const { current, previous } = monthRanges('2026-01', TZ, NOW);
    expect([current.fromDay, current.toDay]).toEqual([
      '2026-01-01',
      '2026-01-31',
    ]);
    expect([previous.fromDay, previous.toDay]).toEqual([
      '2025-12-01',
      '2025-12-31',
    ]);
  });

  it('febrero bisiesto', () => {
    expect(monthRanges('2024-02', TZ, NOW).current.toDay).toBe('2024-02-29');
  });
});

describe('percent / ratio', () => {
  it('redondea y nunca divide por cero', () => {
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(0, 0)).toBeNull();
    expect(ratio(4, 3)).toBe(1.33);
    expect(ratio(1, 0)).toBeNull();
  });
});

describe('deltas', () => {
  const metric = (
    key: string,
    value: number | null,
    unit: Metric['unit'] = 'count',
  ): Metric => ({
    key,
    label: key,
    value,
    unit,
    definition: '',
  });

  it('diferencia y variación porcentual de A a B', () => {
    expect(
      deltas([metric('visits', 4)], [metric('visits', 6)])[0],
    ).toMatchObject({
      a: 4,
      b: 6,
      absolute: 2,
      percentChange: 50,
    });
  });

  it('para porcentajes la diferencia es en puntos y no hay variación porcentual', () => {
    expect(
      deltas(
        [metric('rate', 33.3, 'percent')],
        [metric('rate', 50, 'percent')],
      )[0],
    ).toMatchObject({ absolute: 16.7, percentChange: null });
  });

  it('desde cero no hay variación porcentual (no es infinito)', () => {
    expect(
      deltas([metric('x', 0)], [metric('x', 5)])[0].percentChange,
    ).toBeNull();
  });
});

describe('CSV', () => {
  it('escapa comillas, comas y saltos de línea', () => {
    expect(csvCell('a, "b"\nc')).toBe('"a, ""b""\nc"');
    expect(csvRow(['x', 1, null])).toBe('x,1,');
  });

  it('neutraliza fórmulas (inyección CSV) pero no números negativos', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell(-3)).toBe('-3');
  });
});

describe('grounding — nunca ROI', () => {
  const facts = collectGroundedFacts([{ visits: 6 }], []);
  it.each([
    'El ROI de Flikker este mes fue excelente con 6 visitas.',
    'Tuviste un buen retorno de la inversión.',
  ])('rechaza: %s', (answer) => {
    expect(validateAgentAnswer(answer, facts)).toMatchObject({
      reason: 'MENTIONS_ROI',
    });
  });

  it('"ROI" dentro de otra palabra no cuenta', () => {
    expect(
      validateAgentAnswer(
        'Tuviste 6 visitas en el período; el héroe fue el sábado.',
        facts,
      ),
    ).toEqual({
      valid: true,
    });
  });
});
