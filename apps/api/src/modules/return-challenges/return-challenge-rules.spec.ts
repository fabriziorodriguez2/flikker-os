import {
  isWithinWindow,
  MIN_USEFUL_HOURS,
  resolveChallengeWindow,
} from './return-challenge-rules';

const MVD = 'America/Montevideo';
const TOKYO = 'Asia/Tokyo';

function local(date: Date, tz: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

describe('resolveChallengeWindow — próximo lunes 00:00 local', () => {
  it('un martes vence el lunes siguiente', () => {
    // Martes 2026-09-22, 15:00 local.
    const w = resolveChallengeWindow(MVD, new Date('2026-09-22T18:00:00Z'));

    expect(local(w.expiresAt, MVD)).toBe('2026-09-28, 00:00');
    // El deadline que se le muestra al cliente es el DOMINGO, no el lunes.
    expect(w.deadlineDayKey).toBe('2026-09-27');
  });

  it('el domingo a las 22:00 se corre al lunes SIGUIENTE', () => {
    // Faltarían 2 horas: no es un desafío, es una trampa.
    const w = resolveChallengeWindow(MVD, new Date('2026-09-28T01:00:00Z'));

    expect(local(w.expiresAt, MVD)).toBe('2026-10-05, 00:00');
    expect(w.deadlineDayKey).toBe('2026-10-04');
  });

  it('el corte de las 48 horas es exacto', () => {
    // Viernes 2026-09-25 21:00 local → faltan 51h para el lunes: entra.
    const conMargen = resolveChallengeWindow(
      MVD,
      new Date('2026-09-26T00:00:00Z'),
    );
    expect(conMargen.deadlineDayKey).toBe('2026-09-27');

    // Sábado 2026-09-26 21:00 local → faltan 27h: se corre.
    const sinMargen = resolveChallengeWindow(
      MVD,
      new Date('2026-09-27T00:00:00Z'),
    );
    expect(sinMargen.deadlineDayKey).toBe('2026-10-04');
  });

  it('siempre deja al menos 48 horas útiles', () => {
    // Cualquier momento de la semana: el plazo nunca queda por debajo.
    for (let h = 0; h < 24 * 7; h += 5) {
      const now = new Date(Date.UTC(2026, 8, 21, h));
      const w = resolveChallengeWindow(MVD, now);
      const horas = (w.expiresAt.getTime() - now.getTime()) / 3_600_000;
      expect(horas).toBeGreaterThanOrEqual(MIN_USEFUL_HOURS);
    }
  });

  it('usa el reloj del negocio, no UTC', () => {
    // Mismo instante: domingo 23:00 en Montevideo, lunes 11:00 en Tokio.
    const now = new Date('2026-09-28T02:00:00Z');

    const mvd = resolveChallengeWindow(MVD, now);
    const tokyo = resolveChallengeWindow(TOKYO, now);

    // En Montevideo todavía es domingo y faltan menos de 48h → se corre a la
    // semana siguiente. En Tokio ya es lunes, así que la semana recién empieza.
    expect(local(mvd.expiresAt, MVD)).toBe('2026-10-05, 00:00');
    expect(local(tokyo.expiresAt, TOKYO)).toBe('2026-10-05, 00:00');
    // Los dos son el mismo día local pero instantes UTC distintos.
    expect(mvd.expiresAt.getTime()).not.toBe(tokyo.expiresAt.getTime());
  });

  it('el deadline en Tokio también es el domingo local', () => {
    const w = resolveChallengeWindow(TOKYO, new Date('2026-09-22T06:00:00Z'));
    expect(w.deadlineDayKey).toBe('2026-09-27');
    expect(local(w.expiresAt, TOKYO)).toBe('2026-09-28, 00:00');
  });
});

describe('isWithinWindow — ventana medio-abierta', () => {
  const window = {
    startsAt: new Date('2026-09-22T18:00:00Z'),
    expiresAt: new Date('2026-09-28T03:00:00Z'),
  };

  it('una visita del domingo 23:59 local ENTRA', () => {
    expect(isWithinWindow(window, new Date('2026-09-28T02:59:00Z'))).toBe(true);
  });

  it('una visita justo en expiresAt queda AFUERA', () => {
    expect(isWithinWindow(window, window.expiresAt)).toBe(false);
  });

  it('una visita anterior al inicio no cuenta', () => {
    expect(isWithinWindow(window, new Date('2026-09-22T17:00:00Z'))).toBe(
      false,
    );
  });

  it('el instante exacto de inicio SÍ cuenta', () => {
    expect(isWithinWindow(window, window.startsAt)).toBe(true);
  });
});
