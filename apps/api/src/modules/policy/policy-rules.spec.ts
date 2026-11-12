import {
  AUTO_PAUSE,
  autoPauseReason,
  configBlockers,
  effectiveConsent,
  campaignCaps,
  evaluatePolicy,
  frequencyExclusion,
  isWithinWindow,
  POLICY_VERSION,
  roleMayProduce,
  SMALL_BUSINESS_CUSTOMER_THRESHOLD,
  weeklyRecipientCap,
  type ConsentStatus,
  type PolicyConfig,
  type PolicyEffect,
  type PolicyUsage,
} from './policy-rules';

const TZ = 'America/Montevideo';
// Martes 2026-11-10, 15:00 en Montevideo (UTC-3).
const NOW = new Date('2026-11-10T18:00:00.000Z');
const DAY = 86_400_000;

function config(overrides: Partial<PolicyConfig> = {}): PolicyConfig {
  return {
    acceptedAt: new Date('2026-11-01T12:00:00Z'),
    acceptedVersion: POLICY_VERSION,
    confirmedCurrency: 'UYU',
    confirmedTimezone: TZ,
    businessCurrency: 'UYU',
    businessTimezone: TZ,
    paused: false,
    pausedReason: null,
    messagingBudgetMonthly: 500,
    incentiveBudgetMonthly: 1500,
    weeklyReachPercent: 25,
    maxNewCampaignsPerWeek: 2,
    maxCampaignSharePercent: 25,
    minDaysBetweenPromotions: 10,
    maxPromotionsPer30Days: 3,
    sendingHourStart: 10,
    sendingHourEnd: 20,
    allowedSendingDays: [1, 2, 3, 4, 5, 6],
    messageUnitCost: 2,
    messageUnitCostCurrency: 'UYU',
    ...overrides,
  };
}

const ids = (n: number, prefix = 'c') =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`);

function usage(
  candidates: string[],
  overrides: Partial<PolicyUsage> = {},
  consent: ConsentStatus = 'GRANTED',
): PolicyUsage {
  return {
    messagingSpentMonth: 0,
    incentiveLiabilityMonth: 0,
    recipientsThisWeek: new Set(),
    newCampaignsThisWeek: 0,
    // 500 registrados y 100 contactables: el 25% son 25 por semana.
    base: { registered: 500, contactable: 100 },
    contactsByCustomer: new Map(),
    consentByCustomer: new Map(candidates.map((id) => [id, consent])),
    ...overrides,
  };
}

function promo(
  candidates: string[],
  overrides: Partial<PolicyEffect> = {},
): PolicyEffect {
  return {
    source: 'PROMOTION',
    actorRole: 'OWNER',
    kind: 'MESSAGE',
    createsCampaign: true,
    candidateCustomerIds: candidates,
    incentive: null,
    ...overrides,
  };
}

const codes = (d: { blockers: { code: string }[] }) =>
  d.blockers.map((b) => b.code);

describe('policy rules — configuración', () => {
  it('sin aceptar: bloquea todo y no evalúa nada más', () => {
    const d = evaluatePolicy({
      config: config({ acceptedAt: null }),
      effect: promo(ids(3)),
      usage: usage(ids(3)),
      now: NOW,
    });
    expect(codes(d)).toEqual(['POLICY_NOT_ACCEPTED']);
    expect(d.allowed).toBe(false);
  });

  it('versión vieja, moneda o zona cambiada y kill switch se reportan juntos', () => {
    expect(
      configBlockers(
        config({
          acceptedVersion: 0,
          businessCurrency: 'USD',
          paused: true,
          pausedReason: 'AUTO_OPT_OUTS',
        }),
      ).map((b) => b.code),
    ).toEqual([
      'POLICY_OUTDATED',
      'POLICY_RECONFIRM_REQUIRED',
      'POLICY_PAUSED',
    ]);
    expect(
      configBlockers(config({ businessTimezone: 'America/Buenos_Aires' })).map(
        (b) => b.code,
      ),
    ).toEqual(['POLICY_RECONFIRM_REQUIRED']);
  });

  it('kill switch bloquea aunque todo lo demás esté bien', () => {
    const d = evaluatePolicy({
      config: config({ paused: true, pausedReason: 'MANUAL' }),
      effect: promo(ids(1)),
      usage: usage(ids(1)),
      now: NOW,
    });
    expect(codes(d)).toContain('POLICY_PAUSED');
    expect(d.allowed).toBe(false);
  });

  it('sin costo por mensaje o en otra moneda: no se envía', () => {
    expect(
      codes(
        evaluatePolicy({
          config: config({
            messageUnitCost: null,
            messageUnitCostCurrency: null,
          }),
          effect: promo(ids(1)),
          usage: usage(ids(1)),
          now: NOW,
        }),
      ),
    ).toContain('MESSAGE_COST_UNKNOWN');
    expect(
      codes(
        evaluatePolicy({
          config: config({ messageUnitCostCurrency: 'USD' }),
          effect: promo(ids(1)),
          usage: usage(ids(1)),
          now: NOW,
        }),
      ),
    ).toContain('MESSAGE_COST_CURRENCY_MISMATCH');
  });

  it('topes sin configurar: deny-by-default', () => {
    const d = evaluatePolicy({
      config: config({ weeklyReachPercent: null }),
      effect: promo(ids(1)),
      usage: usage(ids(1)),
      now: NOW,
    });
    expect(codes(d)).toContain('BUDGET_NOT_CONFIGURED');
  });
});

describe('policy rules — roles', () => {
  it('OPERATOR solo puede mandar una promoción sin premio', () => {
    expect(roleMayProduce(promo([], { actorRole: 'OPERATOR' }))).toBe(true);
    expect(
      roleMayProduce(
        promo([], { actorRole: 'OPERATOR', incentive: { unitCost: 10 } }),
      ),
    ).toBe(false);
    expect(
      roleMayProduce(
        promo([], { actorRole: 'OPERATOR', source: 'INTELLIGENCE' }),
      ),
    ).toBe(false);
  });

  it('VIEWER nunca; Autopilot solo como sistema (sin rol)', () => {
    expect(roleMayProduce(promo([], { actorRole: 'VIEWER' }))).toBe(false);
    expect(
      roleMayProduce(promo([], { source: 'AUTOPILOT', actorRole: null })),
    ).toBe(true);
    expect(
      roleMayProduce(promo([], { source: 'AUTOPILOT', actorRole: 'OWNER' })),
    ).toBe(false);
    expect(roleMayProduce(promo([], { actorRole: null }))).toBe(false);
  });

  it('un rol no permitido no llega a mirar presupuesto', () => {
    const d = evaluatePolicy({
      config: config(),
      effect: promo(ids(2), { actorRole: 'VIEWER' }),
      usage: usage(ids(2)),
      now: NOW,
    });
    expect(codes(d)).toEqual(['ROLE_NOT_ALLOWED']);
  });
});

describe('policy rules — consentimiento', () => {
  it('sin eventos no es autorización', () => {
    expect(effectiveConsent([], false)).toBe('UNKNOWN');
  });

  it('el último evento manda; una baja vieja (optedOut) gana', () => {
    const t = (d: number) => new Date(NOW.getTime() + d * 1000);
    expect(
      effectiveConsent(
        [
          { action: 'GRANTED', createdAt: t(1) },
          { action: 'REVOKED', createdAt: t(2) },
        ],
        false,
      ),
    ).toBe('REVOKED');
    expect(
      effectiveConsent(
        [
          { action: 'REVOKED', createdAt: t(1) },
          { action: 'GRANTED', createdAt: t(2) },
        ],
        false,
      ),
    ).toBe('GRANTED');
    expect(
      effectiveConsent([{ action: 'GRANTED', createdAt: t(1) }], true),
    ).toBe('REVOKED');
  });

  it('la supresión no la levanta un GRANTED, solo UNSUPPRESSED', () => {
    const t = (d: number) => new Date(NOW.getTime() + d * 1000);
    expect(
      effectiveConsent(
        [
          { action: 'SUPPRESSED', createdAt: t(1) },
          { action: 'GRANTED', createdAt: t(2) },
        ],
        false,
      ),
    ).toBe('SUPPRESSED');
    expect(
      effectiveConsent(
        [
          { action: 'GRANTED', createdAt: t(0) },
          { action: 'SUPPRESSED', createdAt: t(1) },
          { action: 'UNSUPPRESSED', createdAt: t(2) },
        ],
        false,
      ),
    ).toBe('GRANTED');
  });

  it('excluye por persona (desconocido, baja, suprimido) y deja al resto', () => {
    const consent = new Map<string, ConsentStatus>([
      ['ok', 'GRANTED'],
      ['unknown', 'UNKNOWN'],
      ['revoked', 'REVOKED'],
      ['suppressed', 'SUPPRESSED'],
    ]);
    const d = evaluatePolicy({
      config: config(),
      effect: promo(['ok', 'unknown', 'revoked', 'suppressed', 'missing']),
      usage: usage([], { consentByCustomer: consent }),
      now: NOW,
    });
    expect(d.eligibleCustomerIds).toEqual(['ok']);
    expect(d.excluded).toEqual([
      { customerId: 'unknown', reason: 'NO_CONSENT' },
      { customerId: 'revoked', reason: 'CONSENT_REVOKED' },
      { customerId: 'suppressed', reason: 'SUPPRESSED' },
      { customerId: 'missing', reason: 'NO_CONSENT' },
    ]);
  });

  it('nadie con consentimiento: NO_ELIGIBLE_RECIPIENTS', () => {
    const d = evaluatePolicy({
      config: config(),
      effect: promo(ids(3)),
      usage: usage(ids(3), {}, 'UNKNOWN'),
      now: NOW,
    });
    expect(codes(d)).toContain('NO_ELIGIBLE_RECIPIENTS');
    expect(d.cost.total).toBe(0);
  });

  it('un candidato repetido cuenta una sola vez', () => {
    const d = evaluatePolicy({
      config: config(),
      effect: promo(['a', 'a', 'b']),
      usage: usage(['a', 'b']),
      now: NOW,
    });
    expect(d.eligibleCustomerIds).toEqual(['a', 'b']);
  });
});

describe('policy rules — frecuencia por cliente', () => {
  const at = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * DAY);

  it('separación de 10 días: a los 9,9 días no, a los 10 sí', () => {
    const contacts = new Map([
      ['recent', [at(9.9)]],
      ['exact', [at(10)]],
    ]);
    const d = evaluatePolicy({
      config: config(),
      effect: promo(['recent', 'exact']),
      usage: usage(['recent', 'exact'], { contactsByCustomer: contacts }),
      now: NOW,
    });
    expect(d.eligibleCustomerIds).toEqual(['exact']);
    expect(d.excluded).toEqual([
      { customerId: 'recent', reason: 'RECENT_PROMOTION' },
    ]);
  });

  it('máximo 3 en 30 días; lo de hace más de 30 no cuenta', () => {
    const contacts = new Map([
      ['two', [at(10), at(20)]],
      ['three', [at(10), at(20), at(29)]],
      ['old', [at(10), at(20), at(31)]],
    ]);
    const d = evaluatePolicy({
      config: config(),
      effect: promo(['two', 'three', 'old']),
      usage: usage(['two', 'three', 'old'], { contactsByCustomer: contacts }),
      now: NOW,
    });
    expect(d.eligibleCustomerIds).toEqual(['two', 'old']);
    expect(d.excluded).toEqual([
      { customerId: 'three', reason: 'MONTHLY_PROMOTION_LIMIT' },
    ]);
  });

  it('3 promociones con 10 días de separación entran justo en 30 días', () => {
    // Día 0, 10 y 20: la tercera es posible; una cuarta al día 29, no.
    expect(frequencyExclusion([], config(), NOW)).toBeNull();
    expect(frequencyExclusion([at(10)], config(), NOW)).toBeNull();
    expect(frequencyExclusion([at(20), at(10)], config(), NOW)).toBeNull();
    expect(frequencyExclusion([at(29), at(19), at(10)], config(), NOW)).toBe(
      'MONTHLY_PROMOTION_LIMIT',
    );
  });

  it('saturación: cuenta los contactos de todos los motores juntos', () => {
    // Uno de una promoción, uno de Autopilot y uno de Intelligence: llegan
    // como una sola lista de contactos por cliente.
    const contacts = new Map([['busy', [at(12), at(22), at(28)]]]);
    const d = evaluatePolicy({
      config: config(),
      effect: promo(['busy'], { source: 'AUTOPILOT', actorRole: null }),
      usage: usage(['busy'], { contactsByCustomer: contacts }),
      now: NOW,
    });
    expect(d.excluded).toEqual([
      { customerId: 'busy', reason: 'MONTHLY_PROMOTION_LIMIT' },
    ]);
    expect(codes(d)).toContain('NO_ELIGIBLE_RECIPIENTS');
  });

  it('una baja o una supresión gana aunque la frecuencia lo permita', () => {
    const d = evaluatePolicy({
      config: config(),
      effect: promo(['revoked', 'suppressed']),
      usage: usage([], {
        consentByCustomer: new Map<string, ConsentStatus>([
          ['revoked', 'REVOKED'],
          ['suppressed', 'SUPPRESSED'],
        ]),
      }),
      now: NOW,
    });
    expect(d.eligibleCustomerIds).toEqual([]);
    expect(d.excluded.map((e) => e.reason)).toEqual([
      'CONSENT_REVOKED',
      'SUPPRESSED',
    ]);
  });
});

describe('policy rules — tope semanal según el tamaño del negocio', () => {
  const cap = (registered: number, contactable: number, percent = 25) =>
    weeklyRecipientCap(
      { weeklyReachPercent: percent },
      { registered, contactable },
    );

  it.each([
    // [registrados, contactables, modo, tope]
    [0, 0, 'ADAPTIVE', null],
    [10, 10, 'ADAPTIVE', null],
    [105, 80, 'ADAPTIVE', null],
    [149, 149, 'ADAPTIVE', null],
    [150, 40, 'PERCENT', 10],
    [500, 500, 'PERCENT', 125],
    [500, 120, 'PERCENT', 30],
    [5000, 5000, 'PERCENT', 1250],
    [5000, 1800, 'PERCENT', 450],
  ])(
    '%i registrados, %i contactables → %s, tope %p',
    (registered, contactable, mode, expected) => {
      expect(cap(registered, contactable)).toEqual({ mode, cap: expected });
    },
  );

  it(`el umbral de base chica es ${SMALL_BUSINESS_CUSTOMER_THRESHOLD} clientes registrados`, () => {
    expect(SMALL_BUSINESS_CUSTOMER_THRESHOLD).toBe(150);
  });

  it('se recalcula con la base: más contactables, más tope', () => {
    expect(cap(1000, 200).cap).toBe(50);
    expect(cap(1000, 400).cap).toBe(100);
    expect(cap(1000, 400, 10).cap).toBe(40);
  });

  it('redondea hacia arriba: una base contactable chica no queda en 0', () => {
    expect(cap(200, 3).cap).toBe(1);
    expect(cap(200, 0).cap).toBe(0);
  });

  it('el % se calcula sobre los contactables, no sobre los registrados', () => {
    // 5000 registrados pero solo 40 con WhatsApp: 10, no 1250.
    expect(cap(5000, 40).cap).toBe(10);
  });

  it('105 clientes: Autopilot no queda bloqueado por el tamaño de la base', () => {
    // 60 destinatarios en una semana de un negocio chico: sin tope por %.
    const d = evaluatePolicy({
      config: config({ messagingBudgetMonthly: 1000 }),
      effect: promo(ids(60)),
      usage: usage(ids(60), {
        base: { registered: 105, contactable: 70 },
        recipientsThisWeek: new Set(ids(20, 'w')),
      }),
      now: NOW,
    });
    expect(codes(d)).not.toContain('WEEKLY_RECIPIENTS_LIMIT');
    expect(d.allowed).toBe(true);
  });

  it('base chica: igual valida presupuesto, consentimiento y frecuencia', () => {
    const d = evaluatePolicy({
      config: config(),
      effect: promo(['ok', 'nope', 'rested']),
      usage: usage([], {
        base: { registered: 10, contactable: 8 },
        messagingSpentMonth: 499,
        consentByCustomer: new Map<string, ConsentStatus>([
          ['ok', 'GRANTED'],
          ['nope', 'UNKNOWN'],
          ['rested', 'GRANTED'],
        ]),
        contactsByCustomer: new Map([
          ['rested', [new Date(NOW.getTime() - 2 * DAY)]],
        ]),
      }),
      now: NOW,
    });
    expect(d.eligibleCustomerIds).toEqual(['ok']);
    // 1 mensaje × 2 = 2 > 1 que queda.
    expect(codes(d)).toEqual(['MESSAGING_BUDGET_EXCEEDED']);
  });

  it('negocio sin clientes: no hay nadie a quien escribir', () => {
    const d = evaluatePolicy({
      config: config(),
      effect: promo([]),
      usage: usage([], { base: { registered: 0, contactable: 0 } }),
      now: NOW,
    });
    expect(codes(d)).toEqual(['NO_ELIGIBLE_RECIPIENTS']);
  });

  it('5000 clientes: el tope semanal frena al pasarse', () => {
    const base = { registered: 5000, contactable: 2000 }; // 25% = 500
    const fits = evaluatePolicy({
      config: config({ messagingBudgetMonthly: 100_000 }),
      effect: promo(ids(100)),
      usage: usage(ids(100), {
        base,
        recipientsThisWeek: new Set(ids(400, 'w')),
      }),
      now: NOW,
    });
    expect(codes(fits)).toEqual([]);
    const over = evaluatePolicy({
      config: config({ messagingBudgetMonthly: 100_000 }),
      effect: promo(ids(101)),
      usage: usage(ids(101), {
        base,
        recipientsThisWeek: new Set(ids(400, 'w')),
      }),
      now: NOW,
    });
    expect(codes(over)).toEqual(['WEEKLY_RECIPIENTS_LIMIT']);
  });

  it('el % nunca habilita a quien no autorizó WhatsApp', () => {
    const d = evaluatePolicy({
      config: config({ weeklyReachPercent: 100 }),
      effect: promo(ids(10)),
      usage: usage(
        ids(10),
        { base: { registered: 500, contactable: 0 } },
        'UNKNOWN',
      ),
      now: NOW,
    });
    expect(d.eligibleCustomerIds).toEqual([]);
    expect(d.allowed).toBe(false);
  });
});

describe('policy rules — topes semanales', () => {
  it('25 destinatarios únicos por semana: 25 entra, 26 no', () => {
    const already = new Set(ids(20, 'w'));
    const fits = evaluatePolicy({
      config: config(),
      effect: promo(ids(5)),
      usage: usage(ids(5), { recipientsThisWeek: already }),
      now: NOW,
    });
    expect(codes(fits)).not.toContain('WEEKLY_RECIPIENTS_LIMIT');
    const over = evaluatePolicy({
      config: config(),
      effect: promo(ids(6)),
      usage: usage(ids(6), { recipientsThisWeek: already }),
      now: NOW,
    });
    expect(codes(over)).toContain('WEEKLY_RECIPIENTS_LIMIT');
  });

  it('volver a contactar a alguien de esta semana no suma un destinatario nuevo', () => {
    const already = new Set(ids(25, 'c'));
    const d = evaluatePolicy({
      config: config(),
      effect: promo(['c0', 'c1']),
      usage: usage(['c0', 'c1'], { recipientsThisWeek: already }),
      now: NOW,
    });
    expect(codes(d)).not.toContain('WEEKLY_RECIPIENTS_LIMIT');
  });

  it('2 campañas nuevas por semana: la tercera no', () => {
    const d = evaluatePolicy({
      config: config(),
      effect: promo(ids(1)),
      usage: usage(ids(1), { newCampaignsThisWeek: 2 }),
      now: NOW,
    });
    expect(codes(d)).toContain('WEEKLY_CAMPAIGNS_LIMIT');
    const autopilot = evaluatePolicy({
      config: config(),
      effect: promo(ids(1), {
        source: 'AUTOPILOT',
        actorRole: null,
        createsCampaign: false,
      }),
      usage: usage(ids(1), { newCampaignsThisWeek: 2 }),
      now: NOW,
    });
    expect(codes(autopilot)).not.toContain('WEEKLY_CAMPAIGNS_LIMIT');
  });
});

describe('policy rules — presupuestos', () => {
  it('mensajería: llegar justo al tope entra; pasarse un centavo no', () => {
    // 10 mensajes × 2 = 20; usado 480 → 500 exacto.
    const exact = evaluatePolicy({
      config: config(),
      effect: promo(ids(10)),
      usage: usage(ids(10), { messagingSpentMonth: 480 }),
      now: NOW,
    });
    expect(codes(exact)).not.toContain('MESSAGING_BUDGET_EXCEEDED');
    const over = evaluatePolicy({
      config: config(),
      effect: promo(ids(10)),
      usage: usage(ids(10), { messagingSpentMonth: 480.01 }),
      now: NOW,
    });
    expect(codes(over)).toContain('MESSAGING_BUDGET_EXCEEDED');
  });

  it('incentivos: el tope mensual se mide sobre lo ya comprometido', () => {
    const d = evaluatePolicy({
      config: config({ maxCampaignSharePercent: 100 }),
      effect: promo(ids(5), { incentive: { unitCost: 100 } }),
      usage: usage(ids(5), { incentiveLiabilityMonth: 1100 }),
      now: NOW,
    });
    expect(codes(d)).toContain('INCENTIVE_BUDGET_EXCEEDED');
    expect(d.cost).toMatchObject({
      messaging: 10,
      incentives: 500,
      total: 510,
    });
  });

  it('premio sin costo estimable: no se ofrece', () => {
    const d = evaluatePolicy({
      config: config(),
      effect: promo(ids(1), { incentive: { unitCost: null } }),
      usage: usage(ids(1)),
      now: NOW,
    });
    expect(codes(d)).toContain('INCENTIVE_COST_UNKNOWN');
  });

  it('una campaña usa hasta el 25% de CADA bolsa: 125 de mensajería, 375 de incentivos', () => {
    expect(campaignCaps(config())).toEqual({ messaging: 125, incentives: 375 });
    // 10 × 37,5 = 375 de incentivos y 20 de mensajería → entra justo.
    const fits = evaluatePolicy({
      config: config(),
      effect: promo(ids(10), { incentive: { unitCost: 37.5 } }),
      usage: usage(ids(10)),
      now: NOW,
    });
    expect(codes(fits)).toEqual([]);
    expect(fits.allowed).toBe(true);
    // 10 × 37,51 = 375,10 → se pasa la parte de incentivos.
    const over = evaluatePolicy({
      config: config(),
      effect: promo(ids(10), { incentive: { unitCost: 37.51 } }),
      usage: usage(ids(10)),
      now: NOW,
    });
    expect(codes(over)).toEqual(['CAMPAIGN_SHARE_EXCEEDED']);
  });

  it('un mensaje sin premio solo mira su bolsa: no lo achica el presupuesto de incentivos', () => {
    // 60 × 2 = 120 ≤ 125 aunque no haya presupuesto de incentivos.
    const d = evaluatePolicy({
      config: config({ incentiveBudgetMonthly: null }),
      effect: promo(ids(60)),
      usage: usage(ids(60), { base: { registered: 100, contactable: 60 } }),
      now: NOW,
    });
    expect(codes(d)).toEqual([]);
    // 63 × 2 = 126 > 125.
    const over = evaluatePolicy({
      config: config({ incentiveBudgetMonthly: null }),
      effect: promo(ids(63)),
      usage: usage(ids(63), { base: { registered: 100, contactable: 63 } }),
      now: NOW,
    });
    expect(codes(over)).toEqual(['CAMPAIGN_SHARE_EXCEEDED']);
  });

  it('la parte por campaña nunca habilita romper una bolsa individual', () => {
    // 50 mensajes × 2 = 100 ≤ 125, pero la mensajería ya usó 450 de 500.
    const d = evaluatePolicy({
      config: config({ weeklyReachPercent: 100 }),
      effect: promo(ids(50)),
      usage: usage(ids(50), { messagingSpentMonth: 450 }),
      now: NOW,
    });
    expect(codes(d)).toEqual(['MESSAGING_BUDGET_EXCEEDED']);
  });
});

describe('policy rules — presupuesto de incentivos del dueño', () => {
  it('sin presupuesto definido: ningún premio con costo, el mensaje solo sí', () => {
    const withPrize = evaluatePolicy({
      config: config({ incentiveBudgetMonthly: null }),
      effect: promo(ids(5), { incentive: { unitCost: 50 } }),
      usage: usage(ids(5)),
      now: NOW,
    });
    expect(codes(withPrize)).toEqual(['INCENTIVE_BUDGET_NOT_SET']);
    const plain = evaluatePolicy({
      config: config({ incentiveBudgetMonthly: null }),
      effect: promo(ids(5)),
      usage: usage(ids(5)),
      now: NOW,
    });
    expect(plain.allowed).toBe(true);
  });

  it('presupuesto 0: el dueño no quiere costos de incentivos', () => {
    const d = evaluatePolicy({
      config: config({ incentiveBudgetMonthly: 0 }),
      effect: promo(ids(2), { incentive: { unitCost: 1 } }),
      usage: usage(ids(2)),
      now: NOW,
    });
    expect(codes(d)).toContain('INCENTIVE_BUDGET_EXCEEDED');
    expect(d.allowed).toBe(false);
  });

  it('presupuesto insuficiente: lo comprometido más esta campaña no entra', () => {
    const d = evaluatePolicy({
      config: config({
        incentiveBudgetMonthly: 300,
        maxCampaignSharePercent: 100,
      }),
      effect: promo(ids(4), { incentive: { unitCost: 60 } }),
      usage: usage(ids(4), { incentiveLiabilityMonth: 100 }),
      now: NOW,
    });
    // 100 + 240 = 340 > 300.
    expect(codes(d)).toEqual(['INCENTIVE_BUDGET_EXCEEDED']);
    const smaller = evaluatePolicy({
      config: config({
        incentiveBudgetMonthly: 300,
        maxCampaignSharePercent: 100,
      }),
      effect: promo(ids(3), { incentive: { unitCost: 60 } }),
      usage: usage(ids(3), { incentiveLiabilityMonth: 100 }),
      now: NOW,
    });
    expect(smaller.allowed).toBe(true);
  });

  it('un cambio de programa con premio también necesita el presupuesto', () => {
    const d = evaluatePolicy({
      config: config({ incentiveBudgetMonthly: null }),
      effect: promo([], {
        kind: 'PROGRAM',
        source: 'INTELLIGENCE',
        createsCampaign: false,
        incentive: { unitCost: 20 },
      }),
      usage: usage([]),
      now: NOW,
    });
    expect(codes(d)).toEqual(['INCENTIVE_BUDGET_NOT_SET']);
  });

  it('un premio de costo cero verificable sale sin presupuesto y no compromete nada', () => {
    const d = evaluatePolicy({
      config: config({ incentiveBudgetMonthly: null }),
      effect: promo(ids(5), {
        incentive: { unitCost: 0, zeroCostVerified: true },
      }),
      usage: usage(ids(5)),
      now: NOW,
    });
    expect(d.allowed).toBe(true);
    expect(d.cost?.incentives).toBe(0);
    // Con presupuesto 0 también: no consume nada.
    const zeroBudget = evaluatePolicy({
      config: config({ incentiveBudgetMonthly: 0 }),
      effect: promo(ids(5), {
        incentive: { unitCost: 0, zeroCostVerified: true },
      }),
      usage: usage(ids(5)),
      now: NOW,
    });
    expect(zeroBudget.allowed).toBe(true);
  });

  it('costo 0 sin verificar, o "verificado" con costo, sigue necesitando presupuesto', () => {
    for (const incentive of [
      { unitCost: 0 },
      { unitCost: 0, zeroCostVerified: false },
      { unitCost: 30, zeroCostVerified: true },
    ]) {
      const d = evaluatePolicy({
        config: config({ incentiveBudgetMonthly: null }),
        effect: promo(ids(2), { incentive }),
        usage: usage(ids(2)),
        now: NOW,
      });
      expect(codes(d)).toEqual(['INCENTIVE_BUDGET_NOT_SET']);
    }
  });
});

describe('policy rules — ventana horaria', () => {
  it('10 a 20 en la hora del negocio, días permitidos', () => {
    const w = config();
    expect(isWithinWindow(w, TZ, new Date('2026-11-10T13:00:00Z'))).toBe(true); // 10:00
    expect(isWithinWindow(w, TZ, new Date('2026-11-10T12:59:00Z'))).toBe(false); // 09:59
    expect(isWithinWindow(w, TZ, new Date('2026-11-10T22:59:00Z'))).toBe(true); // 19:59
    expect(isWithinWindow(w, TZ, new Date('2026-11-10T23:00:00Z'))).toBe(false); // 20:00
    // Domingo 15/11 15:00 — el domingo no está permitido.
    expect(isWithinWindow(w, TZ, new Date('2026-11-15T18:00:00Z'))).toBe(false);
  });

  it('fuera de horario el envío se bloquea; un cambio de programa no', () => {
    const night = new Date('2026-11-11T03:00:00Z'); // 00:00 local
    expect(
      codes(
        evaluatePolicy({
          config: config(),
          effect: promo(ids(1)),
          usage: usage(ids(1)),
          now: night,
        }),
      ),
    ).toContain('OUTSIDE_SENDING_WINDOW');
    const program = evaluatePolicy({
      config: config(),
      effect: promo([], {
        kind: 'PROGRAM',
        source: 'INTELLIGENCE',
        createsCampaign: false,
      }),
      usage: usage([]),
      now: night,
    });
    expect(program.allowed).toBe(true);
  });
});

describe('policy rules — pausa automática', () => {
  const base = {
    sent: 100,
    failed: 0,
    optOuts: 0,
    complaints: 0,
    contacted: 100,
  };

  it('errores: 5 fallos y 20% de los intentos', () => {
    expect(autoPauseReason({ ...base, sent: 20, failed: 5 })).toBe(
      'AUTO_SEND_ERRORS',
    );
    expect(autoPauseReason({ ...base, sent: 21, failed: 5 })).toBeNull(); // 19,2%
    expect(autoPauseReason({ ...base, sent: 0, failed: 4 })).toBeNull();
  });

  it('bajas: 3 y al menos 5% de los contactados', () => {
    expect(autoPauseReason({ ...base, optOuts: 3, contacted: 60 })).toBe(
      'AUTO_OPT_OUTS',
    );
    expect(autoPauseReason({ ...base, optOuts: 3, contacted: 61 })).toBeNull();
    expect(autoPauseReason({ ...base, optOuts: 2, contacted: 10 })).toBeNull();
  });

  it(`quejas: ${AUTO_PAUSE.complaints} alcanzan, y ganan sobre lo demás`, () => {
    expect(autoPauseReason({ ...base, complaints: 2, failed: 50 })).toBe(
      'AUTO_COMPLAINTS',
    );
    expect(autoPauseReason({ ...base, complaints: 1 })).toBeNull();
  });
});
