import {
  computeStreak,
  isWorthShowing,
  MAX_STREAK_LOOKBACK_WEEKS,
  previousWeek,
  weekEndOf,
  weekStartOf,
} from './streak-rules';

// Lunes 2026-08-31 → domingo 2026-09-06. Semanas siguientes: 07, 14, 21.
const SEMANA_1 = '2026-08-31';
const SEMANA_2 = '2026-09-07';
const SEMANA_3 = '2026-09-14';
const SEMANA_4 = '2026-09-21';

describe('weekStartOf — lunes 00:00 a lunes 00:00', () => {
  it('un lunes es su propio inicio de semana', () => {
    expect(weekStartOf('2026-08-31')).toBe('2026-08-31');
  });

  it('un domingo pertenece a la semana que empezó el lunes anterior', () => {
    expect(weekStartOf('2026-09-06')).toBe('2026-08-31');
  });

  it('domingo y lunes siguiente son semanas DISTINTAS', () => {
    expect(weekStartOf('2026-09-06')).toBe('2026-08-31');
    expect(weekStartOf('2026-09-07')).toBe('2026-09-07');
  });

  it('cruza bien el fin de mes y el fin de año', () => {
    // 1 de enero de 2027 cae viernes → su lunes es el 28 de diciembre.
    expect(weekStartOf('2027-01-01')).toBe('2026-12-28');
  });

  it('el fin de semana es el domingo, seis días después del lunes', () => {
    expect(weekEndOf('2026-08-31')).toBe('2026-09-06');
  });

  it('la semana anterior está exactamente siete días atrás', () => {
    expect(previousWeek('2026-09-07')).toBe('2026-08-31');
    expect(previousWeek('2026-01-04')).toBe('2025-12-28');
  });
});

describe('computeStreak — los casos del pedido', () => {
  it('A: cuatro semanas seguidas, incluida la actual → ACTIVE 4', () => {
    const streak = computeStreak(
      [SEMANA_1, SEMANA_2, SEMANA_3, SEMANA_4],
      '2026-09-23', // miércoles de la semana 4
    );

    expect(streak).toMatchObject({ currentWeeks: 4, state: 'ACTIVE' });
  });

  it('B: tres seguidas y todavía no vino esta semana → AT_RISK 3', () => {
    const streak = computeStreak(
      [SEMANA_1, SEMANA_2, SEMANA_3],
      '2026-09-23', // miércoles de la semana 4
    );

    // La racha NO se rompe el lunes a las 00:01: sigue viva hasta que
    // termine una semana entera sin visitas.
    expect(streak).toMatchObject({
      currentWeeks: 3,
      state: 'AT_RISK',
      currentWeekStart: SEMANA_4,
      deadlineDayKey: '2026-09-27', // domingo
    });
  });

  it('C: una semana entera sin visita rompe la racha → BROKEN', () => {
    const streak = computeStreak(
      [SEMANA_1, SEMANA_2],
      '2026-09-23', // semana 4; la 3 pasó entera sin visitas
    );

    expect(streak).toMatchObject({ currentWeeks: 0, state: 'BROKEN' });
  });

  it('D: volver después de romperla empieza una racha nueva en 1', () => {
    const streak = computeStreak([SEMANA_1, SEMANA_2, SEMANA_4], '2026-09-23');

    expect(streak).toMatchObject({ currentWeeks: 1, state: 'ACTIVE' });
  });

  it('E: cinco visitas en la misma semana cuentan como una', () => {
    const cinco = [
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-25',
      '2026-09-27',
    ];

    expect(computeStreak(cinco, '2026-09-27')).toMatchObject({
      currentWeeks: 1,
      state: 'ACTIVE',
    });
  });
});

describe('computeStreak — más casos', () => {
  it('la primera semana es 1', () => {
    expect(computeStreak([SEMANA_1], '2026-09-02')).toMatchObject({
      currentWeeks: 1,
      state: 'ACTIVE',
    });
  });

  it('dos semanas consecutivas son 2', () => {
    expect(computeStreak([SEMANA_1, SEMANA_2], '2026-09-09')).toMatchObject({
      currentWeeks: 2,
      state: 'ACTIVE',
    });
  });

  it('sin ninguna visita no hay racha', () => {
    expect(computeStreak([], '2026-09-23')).toMatchObject({
      currentWeeks: 0,
      state: 'BROKEN',
    });
  });

  it('el orden y los duplicados de entrada no cambian nada', () => {
    const desordenado = [SEMANA_3, SEMANA_1, SEMANA_2, SEMANA_1, SEMANA_3];

    expect(computeStreak(desordenado, '2026-09-16')).toMatchObject({
      currentWeeks: 3,
      state: 'ACTIVE',
    });
  });

  it('recalcular con la misma entrada da lo mismo — no hay contador que corromper', () => {
    const entrada = [SEMANA_1, SEMANA_2, SEMANA_3];
    const a = computeStreak(entrada, '2026-09-16');
    const b = computeStreak([...entrada, SEMANA_3], '2026-09-16');

    // Reprocesar una visita ya registrada no puede sumar: la racha se deriva
    // de qué semanas existen, no de cuántas filas hay.
    expect(b).toEqual(a);
  });

  it('una racha vieja no revive: historia lejana sin nada reciente es BROKEN', () => {
    expect(
      computeStreak([SEMANA_1, SEMANA_2, SEMANA_3], '2026-12-02'),
    ).toMatchObject({ currentWeeks: 0, state: 'BROKEN' });
  });

  it('AT_RISK cuenta hasta la semana pasada, sin incluir la actual', () => {
    const streak = computeStreak([SEMANA_2, SEMANA_3], '2026-09-23');

    expect(streak.currentWeeks).toBe(2);
    expect(streak.state).toBe('AT_RISK');
  });
});

describe('isWorthShowing — la regla de ruido', () => {
  it('una sola semana no se muestra: es una visita, no una racha', () => {
    expect(isWorthShowing(computeStreak([SEMANA_4], '2026-09-23'))).toBe(false);
  });

  it('una sola semana en riesgo tampoco', () => {
    expect(isWorthShowing(computeStreak([SEMANA_3], '2026-09-23'))).toBe(false);
  });

  it('dos semanas sí', () => {
    expect(
      isWorthShowing(computeStreak([SEMANA_3, SEMANA_4], '2026-09-23')),
    ).toBe(true);
  });

  it('BROKEN nunca se muestra', () => {
    expect(isWorthShowing(computeStreak([], '2026-09-23'))).toBe(false);
  });

  it('nunca puede mostrarse una racha de 0 semanas', () => {
    // Por construcción: 0 solo existe en BROKEN, y BROKEN nunca se muestra.
    const casos = [
      computeStreak([], '2026-09-23'),
      computeStreak([SEMANA_1], '2026-12-02'),
    ];
    for (const streak of casos) {
      expect(streak.currentWeeks).toBe(0);
      expect(isWorthShowing(streak)).toBe(false);
    }
  });
});

describe('MAX_STREAK_LOOKBACK_WEEKS — tope de producto, no equivalencia', () => {
  /** N semanas consecutivas terminando en la semana de `2026-09-21`. */
  function semanasSeguidas(n: number): string[] {
    const out: string[] = [];
    let cursor = '2026-09-21';
    for (let i = 0; i < n; i += 1) {
      out.push(cursor);
      cursor = previousWeek(cursor);
    }
    return out;
  }

  it('una racha de 52 semanas se reporta completa', () => {
    expect(computeStreak(semanasSeguidas(52), '2026-09-23').currentWeeks).toBe(
      52,
    );
  });

  it('una racha REAL de 60 semanas se muestra como 52, no como 60', () => {
    // Límite del read-model, aceptado a conciencia: más allá de un año el
    // número deja de ser información útil. No es que la racha se haya roto.
    expect(computeStreak(semanasSeguidas(60), '2026-09-23').currentWeeks).toBe(
      MAX_STREAK_LOOKBACK_WEEKS,
    );
  });

  it('el tope no altera el estado: sigue ACTIVE', () => {
    expect(computeStreak(semanasSeguidas(80), '2026-09-23').state).toBe(
      'ACTIVE',
    );
  });

  it('el tope vive en la regla, no en cuántos datos trajo la query', () => {
    // Si el tope emergiera de la ventana de la consulta, pasarle más datos
    // daría un número más grande. No pasa.
    const a = computeStreak(semanasSeguidas(60), '2026-09-23').currentWeeks;
    const b = computeStreak(semanasSeguidas(200), '2026-09-23').currentWeeks;
    expect(a).toBe(b);
  });
});
