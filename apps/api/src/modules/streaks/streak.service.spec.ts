import { localDayKey } from '../../common/utils/timezone.util';
import { StreakService } from './streak.service';

const MVD = 'America/Montevideo';
const TOKYO = 'Asia/Tokyo';
const KIRITIMATI = 'Pacific/Kiritimati';

function buildHarness(rows: { customerId?: string; visitDayKey: string }[]) {
  const groupBy = jest.fn().mockResolvedValue(rows);
  const prisma = { visit: { groupBy } };
  return { service: new StreakService(prisma as never), groupBy };
}

describe('StreakService.getCurrentStreak', () => {
  it('pide días DISTINTOS, no visitas', async () => {
    const h = buildHarness([]);

    await h.service.getCurrentStreak({
      businessId: 'biz-1',
      customerId: 'cust-1',
      timezone: MVD,
      now: new Date('2026-09-23T15:00:00Z'),
    });

    const [args] = h.groupBy.mock.calls[0] as [
      { by: string[]; where: Record<string, unknown> },
    ];
    // Cinco visitas el mismo día son una sola fila: la regla de "varias
    // visitas en la semana cuentan una vez" empieza en la propia query.
    expect(args.by).toEqual(['visitDayKey']);
    expect(args.where).toMatchObject({
      businessId: 'biz-1',
      customerId: 'cust-1',
    });
  });

  it('acota el historial: no barre la vida entera del cliente', async () => {
    const h = buildHarness([]);
    const now = new Date('2026-09-23T15:00:00Z');

    await h.service.getCurrentStreak({
      businessId: 'biz-1',
      customerId: 'cust-1',
      timezone: MVD,
      now,
    });

    const [args] = h.groupBy.mock.calls[0] as [
      { where: { occurredAt: { gte: Date } } },
    ];
    const dias =
      (now.getTime() - args.where.occurredAt.gte.getTime()) / 86_400_000;
    // Alrededor de un año, nunca más — el número exacto lo fija el
    // alineamiento, no una resta de días sueltos.
    expect(dias).toBeGreaterThan(52 * 7);
    expect(dias).toBeLessThan(53 * 7 + 2);
  });

  it('el corte cae SIEMPRE en un lunes a medianoche UTC', () => {
    // Antes era `now - 364 días` a secas, así que caía en cualquier momento
    // de un miércoles y una visita de exactamente 52 semanas atrás entraba o
    // no según la hora. Alineado, el corte es determinístico.
    for (const iso of [
      '2026-09-23T15:00:00Z', // miércoles
      '2026-09-27T23:59:00Z', // domingo, casi medianoche
      '2026-09-28T00:00:00Z', // lunes, recién empezado
      '2027-01-01T08:30:00Z', // viernes, cruzando el año
    ]) {
      const h = buildHarness([]);
      void h.service.getCurrentStreak({
        businessId: 'biz-1',
        customerId: 'cust-1',
        timezone: MVD,
        now: new Date(iso),
      });

      const [args] = h.groupBy.mock.calls[0] as [
        { where: { occurredAt: { gte: Date } } },
      ];
      const cutoff = args.where.occurredAt.gte;
      // Un día de margen sobre el lunes → domingo 00:00 UTC.
      expect(cutoff.getUTCDay()).toBe(0);
      expect(cutoff.getUTCHours()).toBe(0);
      expect(cutoff.getUTCMinutes()).toBe(0);
      expect(cutoff.getUTCSeconds()).toBe(0);
    }
  });

  it('un cliente sin visitas no tiene racha', async () => {
    const h = buildHarness([]);

    const streak = await h.service.getCurrentStreak({
      businessId: 'biz-1',
      customerId: 'cust-1',
      timezone: MVD,
      now: new Date('2026-09-23T15:00:00Z'),
    });

    expect(streak).toMatchObject({ currentWeeks: 0, state: 'BROKEN' });
  });

  it('resuelve "hoy" con el reloj del negocio', async () => {
    // 2026-09-28T02:00Z es domingo 23:00 en Montevideo — todavía la semana
    // que empezó el lunes 21. Leído en UTC ya sería lunes 28: otra semana.
    const h = buildHarness([{ visitDayKey: '2026-09-21' }]);

    const streak = await h.service.getCurrentStreak({
      businessId: 'biz-1',
      customerId: 'cust-1',
      timezone: MVD,
      now: new Date('2026-09-28T02:00:00Z'),
    });

    expect(streak.currentWeekStart).toBe('2026-09-21');
    expect(streak.state).toBe('ACTIVE');
  });
});

describe('StreakService — bordes domingo/lunes en distintos husos', () => {
  it.each([
    // [timezone, instante del domingo 23:59 local, instante del lunes 00:01 local]
    [MVD, '2026-09-28T02:59:00Z', '2026-09-28T03:01:00Z'],
    [TOKYO, '2026-09-27T14:59:00Z', '2026-09-27T15:01:00Z'],
    [KIRITIMATI, '2026-09-27T09:59:00Z', '2026-09-27T10:01:00Z'],
  ])(
    'en %s, domingo 23:59 y lunes 00:01 caen en semanas distintas',
    (timezone, domingoIso, lunesIso) => {
      const domingo = localDayKey(new Date(domingoIso), timezone);
      const lunes = localDayKey(new Date(lunesIso), timezone);

      // Dos instantes a dos minutos de distancia en UTC, dos días de
      // calendario local distintos — y por lo tanto dos semanas distintas.
      expect(domingo).toBe('2026-09-27');
      expect(lunes).toBe('2026-09-28');
    },
  );

  it('el mismo instante puede caer en semanas distintas según el negocio', async () => {
    // 2026-09-28T02:00Z: domingo 23:00 en Montevideo, lunes 11:00 en Tokio.
    const now = new Date('2026-09-28T02:00:00Z');

    const mvd = buildHarness([{ visitDayKey: '2026-09-21' }]);
    const tokyo = buildHarness([{ visitDayKey: '2026-09-21' }]);

    const enMvd = await mvd.service.getCurrentStreak({
      businessId: 'biz-1',
      customerId: 'cust-1',
      timezone: MVD,
      now,
    });
    const enTokyo = await tokyo.service.getCurrentStreak({
      businessId: 'biz-2',
      customerId: 'cust-2',
      timezone: TOKYO,
      now,
    });

    // En Montevideo la semana sigue abierta y la visita del 21 es de ESTA
    // semana. En Tokio ya empezó la siguiente: la visita es de la pasada.
    expect(enMvd).toMatchObject({
      currentWeekStart: '2026-09-21',
      state: 'ACTIVE',
    });
    expect(enTokyo).toMatchObject({
      currentWeekStart: '2026-09-28',
      state: 'AT_RISK',
    });
  });
});

describe('StreakService.getStreaksForCustomers — batch sin N+1', () => {
  const customers = [
    { customerId: 'cust-a', businessId: 'biz-a', timezone: MVD },
    { customerId: 'cust-b', businessId: 'biz-b', timezone: MVD },
    { customerId: 'cust-c', businessId: 'biz-c', timezone: TOKYO },
  ];

  it('resuelve TODOS los negocios con una sola query', async () => {
    const h = buildHarness([
      { customerId: 'cust-a', visitDayKey: '2026-09-14' },
      { customerId: 'cust-a', visitDayKey: '2026-09-21' },
      { customerId: 'cust-b', visitDayKey: '2026-09-21' },
    ]);

    await h.service.getStreaksForCustomers(
      customers,
      new Date('2026-09-23T15:00:00Z'),
    );

    // Una consulta para dieciséis lugares, no dieciséis consultas.
    expect(h.groupBy).toHaveBeenCalledTimes(1);
    const [args] = h.groupBy.mock.calls[0] as [
      { by: string[]; where: { customerId: { in: string[] } } },
    ];
    expect(args.by).toEqual(['customerId', 'visitDayKey']);
    expect(args.where.customerId.in).toEqual(['cust-a', 'cust-b', 'cust-c']);
  });

  it('no mezcla los datos de un negocio con los de otro', async () => {
    const h = buildHarness([
      { customerId: 'cust-a', visitDayKey: '2026-09-14' },
      { customerId: 'cust-a', visitDayKey: '2026-09-21' },
      { customerId: 'cust-b', visitDayKey: '2026-09-21' },
    ]);

    const streaks = await h.service.getStreaksForCustomers(
      customers,
      new Date('2026-09-23T15:00:00Z'),
    );

    // biz-a: dos semanas seguidas. biz-b: solo la actual. biz-c: ninguna.
    expect(streaks.get('cust-a')).toMatchObject({
      currentWeeks: 2,
      state: 'ACTIVE',
    });
    expect(streaks.get('cust-b')).toMatchObject({
      currentWeeks: 1,
      state: 'ACTIVE',
    });
    expect(streaks.get('cust-c')).toMatchObject({
      currentWeeks: 0,
      state: 'BROKEN',
    });
  });

  it('cada negocio usa SU timezone para decidir en qué semana está', async () => {
    // Domingo 23:00 en Montevideo = lunes 11:00 en Tokio.
    const h = buildHarness([
      { customerId: 'cust-a', visitDayKey: '2026-09-21' },
      { customerId: 'cust-c', visitDayKey: '2026-09-21' },
    ]);

    const streaks = await h.service.getStreaksForCustomers(
      customers,
      new Date('2026-09-28T02:00:00Z'),
    );

    expect(streaks.get('cust-a')?.currentWeekStart).toBe('2026-09-21');
    expect(streaks.get('cust-c')?.currentWeekStart).toBe('2026-09-28');
  });

  it('sin clientes no consulta nada', async () => {
    const h = buildHarness([]);

    const streaks = await h.service.getStreaksForCustomers([], new Date());

    expect(h.groupBy).not.toHaveBeenCalled();
    expect(streaks.size).toBe(0);
  });

  it('un negocio sin filas igual aparece en el mapa, con racha vacía', async () => {
    const h = buildHarness([]);

    const streaks = await h.service.getStreaksForCustomers(
      customers,
      new Date('2026-09-23T15:00:00Z'),
    );

    expect(streaks.size).toBe(3);
    for (const c of ['cust-a', 'cust-b', 'cust-c']) {
      expect(streaks.get(c)).toMatchObject({ state: 'BROKEN' });
    }
  });
});

describe('StreakService — dos Customer del MISMO negocio en una cuenta', () => {
  // No hay unique en Customer(businessId, phoneE164): la creación manual y el
  // import CSV no deduplican, y `linkExistingCustomers` vincula por teléfono
  // sin filtrar por negocio. Así que este caso es estructuralmente posible.
  const duplicados = [
    { customerId: 'cust-viejo', businessId: 'biz-a', timezone: MVD },
    { customerId: 'cust-nuevo', businessId: 'biz-a', timezone: MVD },
  ];

  it('no suma las visitas de los dos en una racha inventada', async () => {
    const h = buildHarness([
      // El viejo vino dos semanas seguidas.
      { customerId: 'cust-viejo', visitDayKey: '2026-09-14' },
      { customerId: 'cust-viejo', visitDayKey: '2026-09-21' },
      // El nuevo, solo esta semana.
      { customerId: 'cust-nuevo', visitDayKey: '2026-09-21' },
    ]);

    const streaks = await h.service.getStreaksForCustomers(
      duplicados,
      new Date('2026-09-23T15:00:00Z'),
    );

    // Agrupando por negocio, los dos habrían visto una racha de 2 — que no es
    // la de ninguno de los dos.
    expect(streaks.get('cust-viejo')).toMatchObject({ currentWeeks: 2 });
    expect(streaks.get('cust-nuevo')).toMatchObject({ currentWeeks: 1 });
  });

  it('agrupa por cliente, no por negocio', async () => {
    const h = buildHarness([]);

    await h.service.getStreaksForCustomers(duplicados, new Date());

    const [args] = h.groupBy.mock.calls[0] as [{ by: string[] }];
    expect(args.by).toEqual(['customerId', 'visitDayKey']);
    expect(args.by).not.toContain('businessId');
  });
});
