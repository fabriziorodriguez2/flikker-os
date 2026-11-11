import {
  AUTO_PAUSE,
  autoPauseReason,
  configBlockers,
  effectiveConsent,
  evaluatePolicy,
  isWithinWindow,
  roleMayProduce,
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
    acceptedVersion: 1,
    confirmedCurrency: 'UYU',
    confirmedTimezone: TZ,
    businessCurrency: 'UYU',
    businessTimezone: TZ,
    paused: false,
    pausedReason: null,
    messagingBudgetMonthly: 500,
    incentiveBudgetMonthly: 1500,
    maxUniqueRecipientsPerWeek: 25,
    maxNewCampaignsPerWeek: 2,
    maxCampaignSharePercent: 25,
    minDaysBetweenPromotions: 14,
    maxPromotionsPer30Days: 2,
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
      config: config({ maxUniqueRecipientsPerWeek: null }),
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

  it('1 promoción cada 14 días: a los 13,9 días no, a los 14 sí', () => {
    const contacts = new Map([
      ['recent', [at(13.9)]],
      ['exact', [at(14)]],
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

  it('máximo 2 en 30 días; lo de hace más de 30 no cuenta', () => {
    const contacts = new Map([
      ['two', [at(15), at(29)]],
      ['old', [at(15), at(31)]],
    ]);
    const d = evaluatePolicy({
      config: config(),
      effect: promo(['two', 'old']),
      usage: usage(['two', 'old'], { contactsByCustomer: contacts }),
      now: NOW,
    });
    expect(d.eligibleCustomerIds).toEqual(['old']);
    expect(d.excluded).toEqual([
      { customerId: 'two', reason: 'MONTHLY_PROMOTION_LIMIT' },
    ]);
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

  it('una campaña puede usar hasta el 25% de las dos bolsas juntas (500 de 2000)', () => {
    // 10 × (2 + 48) = 500 → entra justo.
    const fits = evaluatePolicy({
      config: config(),
      effect: promo(ids(10), { incentive: { unitCost: 48 } }),
      usage: usage(ids(10)),
      now: NOW,
    });
    expect(codes(fits)).toEqual([]);
    expect(fits.allowed).toBe(true);
    // 10 × (2 + 48,01) = 500,10 → se pasa.
    const over = evaluatePolicy({
      config: config(),
      effect: promo(ids(10), { incentive: { unitCost: 48.01 } }),
      usage: usage(ids(10)),
      now: NOW,
    });
    expect(codes(over)).toEqual(['CAMPAIGN_SHARE_EXCEEDED']);
  });

  it('el 25% combinado nunca habilita romper una bolsa individual', () => {
    // Sin premio, 100 mensajes × 2 = 200 ≤ 500 (25%), pero la mensajería ya
    // usó 400 de 500: la bolsa individual manda.
    const d = evaluatePolicy({
      config: config({ maxUniqueRecipientsPerWeek: 1000 }),
      effect: promo(ids(100)),
      usage: usage(ids(100), { messagingSpentMonth: 400 }),
      now: NOW,
    });
    expect(codes(d)).toEqual(['MESSAGING_BUDGET_EXCEEDED']);
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
