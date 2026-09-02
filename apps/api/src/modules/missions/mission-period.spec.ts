import { MissionPeriodPreset } from '@prisma/client';
import { MissionPeriodError, resolveMissionWindow } from './mission-period';
import { localDayKey } from '../../common/utils/timezone.util';

const TZ = 'America/Montevideo';

/** Cómo se ve un instante en el timezone del negocio — el único que importa. */
function local(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

describe('resolveMissionWindow — timezone del negocio, nunca UTC', () => {
  describe('THIS_MONTH', () => {
    it('arranca el día 1 a medianoche LOCAL, no a medianoche UTC', () => {
      // 2026-09-15 12:00 en Montevideo (UTC-3).
      const now = new Date('2026-09-15T15:00:00Z');
      const w = resolveMissionWindow(MissionPeriodPreset.THIS_MONTH, TZ, now);

      expect(local(w.startsAt)).toBe('2026-09-01, 00:00');
      expect(local(w.endsAt)).toBe('2026-10-01, 00:00');
      // Y en UTC eso NO es medianoche: es el día anterior a las 03:00.
      expect(w.startsAt.toISOString()).toBe('2026-09-01T03:00:00.000Z');
    });

    it('una visita del día 1 a las 00:30 local entra en la ventana', () => {
      const now = new Date('2026-09-15T15:00:00Z');
      const w = resolveMissionWindow(MissionPeriodPreset.THIS_MONTH, TZ, now);
      // 1 de septiembre 00:30 en Montevideo.
      const visita = new Date('2026-09-01T03:30:00Z');

      expect(visita.getTime()).toBeGreaterThanOrEqual(w.startsAt.getTime());
      expect(visita.getTime()).toBeLessThan(w.endsAt.getTime());
    });

    it('una visita del último día del mes anterior a las 23:30 local queda AFUERA', () => {
      const now = new Date('2026-09-15T15:00:00Z');
      const w = resolveMissionWindow(MissionPeriodPreset.THIS_MONTH, TZ, now);
      // 31 de agosto 23:30 en Montevideo = 1 de septiembre 02:30 UTC.
      // Calculado en UTC parecería "septiembre" y contaría de más.
      const visita = new Date('2026-09-01T02:30:00Z');

      expect(localDayKey(visita, TZ)).toBe('2026-08-31');
      expect(visita.getTime()).toBeLessThan(w.startsAt.getTime());
    });

    it('cruza bien el fin de año', () => {
      const now = new Date('2026-12-20T15:00:00Z');
      const w = resolveMissionWindow(MissionPeriodPreset.THIS_MONTH, TZ, now);

      expect(local(w.startsAt)).toBe('2026-12-01, 00:00');
      expect(local(w.endsAt)).toBe('2027-01-01, 00:00');
    });
  });

  describe('THIS_WEEK', () => {
    it('arranca el LUNES a medianoche local', () => {
      // Jueves 2026-09-17.
      const now = new Date('2026-09-17T15:00:00Z');
      const w = resolveMissionWindow(MissionPeriodPreset.THIS_WEEK, TZ, now);

      expect(local(w.startsAt)).toBe('2026-09-14, 00:00'); // lunes
      expect(local(w.endsAt)).toBe('2026-09-21, 00:00'); // lunes siguiente
    });

    it('un DOMINGO pertenece a la semana que empezó el lunes anterior', () => {
      // Domingo 2026-09-20, 21:00 local.
      const now = new Date('2026-09-21T00:00:00Z');
      const w = resolveMissionWindow(MissionPeriodPreset.THIS_WEEK, TZ, now);

      expect(local(w.startsAt)).toBe('2026-09-14, 00:00');
      // El domingo todavía cae dentro: la semana no cerró.
      expect(now.getTime()).toBeLessThan(w.endsAt.getTime());
    });

    it('el lunes a las 00:05 local ya es una semana NUEVA', () => {
      const lunes = new Date('2026-09-21T03:05:00Z'); // 00:05 en Montevideo
      const w = resolveMissionWindow(MissionPeriodPreset.THIS_WEEK, TZ, lunes);

      expect(local(w.startsAt)).toBe('2026-09-21, 00:00');
    });

    it('la ventana dura exactamente 7 días de CALENDARIO', () => {
      const now = new Date('2026-09-17T15:00:00Z');
      const w = resolveMissionWindow(MissionPeriodPreset.THIS_WEEK, TZ, now);
      const días = (w.endsAt.getTime() - w.startsAt.getTime()) / 86_400_000;
      expect(días).toBe(7);
    });
  });

  describe('NEXT_N_DAYS', () => {
    it('arranca HOY a medianoche local, no en este instante', () => {
      // Si arrancara "ahora", una visita de esta mañana no contaría.
      const now = new Date('2026-09-17T21:00:00Z'); // 18:00 local
      const w = resolveMissionWindow(MissionPeriodPreset.NEXT_N_DAYS, TZ, now, {
        periodDays: 14,
      });

      expect(local(w.startsAt)).toBe('2026-09-17, 00:00');
      expect(local(w.endsAt)).toBe('2026-10-01, 00:00');
    });

    it('rechaza un periodDays fuera de rango', () => {
      const now = new Date('2026-09-17T15:00:00Z');
      for (const days of [0, -3, 400, 1.5]) {
        expect(() =>
          resolveMissionWindow(MissionPeriodPreset.NEXT_N_DAYS, TZ, now, {
            periodDays: days,
          }),
        ).toThrow(MissionPeriodError);
      }
    });

    it('rechaza NEXT_N_DAYS sin periodDays', () => {
      expect(() =>
        resolveMissionWindow(
          MissionPeriodPreset.NEXT_N_DAYS,
          TZ,
          new Date('2026-09-17T15:00:00Z'),
        ),
      ).toThrow(MissionPeriodError);
    });
  });

  describe('CUSTOM', () => {
    it('exige las dos fechas', () => {
      expect(() =>
        resolveMissionWindow(MissionPeriodPreset.CUSTOM, TZ, new Date(), {
          startsAt: new Date(),
        }),
      ).toThrow(MissionPeriodError);
    });

    it('rechaza un fin anterior o igual al inicio', () => {
      const d = new Date('2026-09-17T15:00:00Z');
      expect(() =>
        resolveMissionWindow(MissionPeriodPreset.CUSTOM, TZ, d, {
          startsAt: d,
          endsAt: d,
        }),
      ).toThrow(MissionPeriodError);
    });
  });

  /**
   * El borde exacto de la ventana. `endsAt` es EXCLUSIVO, así que el último
   * día válido para participar es el anterior — que es justo lo que
   * `lastDayKey` tiene que decir. Estos tests atan las dos cosas: lo que se
   * cuenta y lo que se muestra.
   */
  describe('el último día válido de participación', () => {
    const now = new Date('2026-09-15T15:00:00Z');

    function septiembre(timezone: string) {
      const w = resolveMissionWindow(
        MissionPeriodPreset.THIS_MONTH,
        timezone,
        now,
      );
      return {
        ...w,
        lastDayKey: localDayKey(new Date(w.endsAt.getTime() - 1), timezone),
      };
    }

    it.each(['America/Montevideo', 'Asia/Tokyo', 'Pacific/Kiritimati'])(
      'en %s el último día es el 30/09 local, nunca el 01/10',
      (timezone) => {
        const w = septiembre(timezone);

        expect(w.lastDayKey).toBe('2026-09-30');
        // El día calendario del PROPIO `endsAt` sería el 1 de octubre: usarlo
        // tal cual mostraría un día de más.
        expect(localDayKey(w.endsAt, timezone)).toBe('2026-10-01');
      },
    );

    it('una visita del 30/09 a las 23:59 local ENTRA', () => {
      const w = septiembre('America/Montevideo');
      // 30 de septiembre 23:59 en Montevideo.
      const visita = new Date('2026-10-01T02:59:00Z');

      expect(localDayKey(visita, 'America/Montevideo')).toBe('2026-09-30');
      expect(visita.getTime()).toBeGreaterThanOrEqual(w.startsAt.getTime());
      expect(visita.getTime()).toBeLessThan(w.endsAt.getTime());
    });

    it('una visita del 01/10 a las 00:00 local queda AFUERA', () => {
      const w = septiembre('America/Montevideo');
      // Exactamente `endsAt`: la ventana es medio-abierta, así que no entra.
      const visita = new Date('2026-10-01T03:00:00Z');

      expect(localDayKey(visita, 'America/Montevideo')).toBe('2026-10-01');
      expect(visita.getTime()).toBeGreaterThanOrEqual(w.endsAt.getTime());
    });

    it('el mismo borde en Tokio, que cierra 18 horas antes en UTC', () => {
      const w = septiembre('Asia/Tokyo');
      const entra = new Date('2026-09-30T14:59:00Z'); // 23:59 JST del 30
      const afuera = new Date('2026-09-30T15:00:00Z'); // 00:00 JST del 1

      expect(entra.getTime()).toBeLessThan(w.endsAt.getTime());
      expect(afuera.getTime()).toBeGreaterThanOrEqual(w.endsAt.getTime());
      expect(w.lastDayKey).toBe('2026-09-30');
    });
  });

  it('la ventana es la MISMA para todos: no depende de cuándo entra cada cliente', () => {
    // Dos momentos distintos del mismo mes resuelven la misma ventana. Es lo
    // que hace que las misiones de Fase 1 sean globales por negocio y no
    // rolling por cliente.
    const a = resolveMissionWindow(
      MissionPeriodPreset.THIS_MONTH,
      TZ,
      new Date('2026-09-02T15:00:00Z'),
    );
    const b = resolveMissionWindow(
      MissionPeriodPreset.THIS_MONTH,
      TZ,
      new Date('2026-09-28T15:00:00Z'),
    );
    expect(a).toEqual(b);
  });
});
