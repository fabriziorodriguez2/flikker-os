import { IntelligenceActionKind } from '@prisma/client';
import {
  ACTION_FIELDS,
  ACTION_MODE,
  actionJsonSchema,
  canonicalJson,
  computeDataVersion,
  computeIdempotencyKey,
  computePlanHash,
  isExplicitActionRequest,
  parseActionParams,
} from './action-plan';

const CAMPAIGN = '2c1f0c2e-1111-4a11-8a11-000000000001';

describe('parseActionParams — schema estricto', () => {
  it('acepta exactamente las claves del schema y recorta textos', () => {
    expect(
      parseActionParams('CREATE_CAMPAIGN_DRAFT', {
        name: '  Mesas de verano ',
        description: null,
        channel: 'QR_TABLE',
        destination: 'LANDING_ONLY',
      }),
    ).toEqual({
      name: 'Mesas de verano',
      description: null,
      channel: 'QR_TABLE',
      destination: 'LANDING_ONLY',
    });
  });

  it('rechaza claves extra: el negocio nunca viene del modelo', () => {
    expect(
      parseActionParams('PAUSE_CAMPAIGN', {
        campaignId: CAMPAIGN,
        businessId: CAMPAIGN,
      }),
    ).toBeNull();
  });

  it.each([
    ['falta una clave', 'PAUSE_CAMPAIGN', {}],
    ['id que no es UUID', 'PAUSE_CAMPAIGN', { campaignId: "1' OR 1=1" }],
    [
      'canal de mensajería',
      'CREATE_CAMPAIGN_DRAFT',
      {
        name: 'x',
        description: null,
        channel: 'WHATSAPP',
        destination: 'LANDING_ONLY',
      },
    ],
    [
      'sellos fuera de rango',
      'UPDATE_STAMPS_CARD',
      { stampsRequired: 50, feedbackBonusEnabled: false },
    ],
    [
      'entero como texto',
      'UPDATE_STAMPS_CARD',
      { stampsRequired: '8', feedbackBonusEnabled: false },
    ],
    [
      'fecha imposible',
      'SCHEDULE_CAMPAIGN',
      { campaignId: CAMPAIGN, startsOn: '2026-02-30', endsOn: null },
    ],
    [
      'estado de misión no permitido',
      'SET_MISSION_STATUS',
      { missionId: CAMPAIGN, status: 'ENDED' },
    ],
    ['null donde no se permite', 'PAUSE_CAMPAIGN', { campaignId: null }],
    ['un array', 'PAUSE_CAMPAIGN', [CAMPAIGN]],
  ] as const)('rechaza: %s', (_label, kind, raw) => {
    expect(parseActionParams(kind, raw)).toBeNull();
  });

  it('el beneficio de una promoción y el premio de una misión son opcionales', () => {
    expect(
      parseActionParams('SEND_PROMOTION', {
        audience: 'ausentes',
        message: 'Te esperamos esta semana',
        benefitId: null,
      }),
    ).toMatchObject({ benefitId: null });
  });

  it('cada operación tiene modo, campos y JSON Schema estricto', () => {
    for (const kind of Object.values(IntelligenceActionKind)) {
      expect(ACTION_MODE[kind]).toBeDefined();
      const schema = actionJsonSchema(kind);
      expect(schema.additionalProperties).toBe(false);
      expect(schema.required).toEqual(Object.keys(ACTION_FIELDS[kind]));
    }
    expect(ACTION_MODE.SEND_PROMOTION).toBe('DRY_RUN');
    expect(ACTION_MODE.PAUSE_CAMPAIGN).toBe('CONFIRM');
    expect(ACTION_MODE.CREATE_CAMPAIGN_DRAFT).toBe('DRAFT');
  });
});

describe('huellas', () => {
  const params = { campaignId: CAMPAIGN };

  it('el JSON canónico no depende del orden de las claves', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(
      canonicalJson({ a: [2, { c: 4, d: 3 }], b: 1 }),
    );
  });

  it('las fechas cuentan en la huella (un Date no es "{}")', () => {
    expect(canonicalJson([new Date('2026-11-10T00:00:00Z')])).toBe(
      '["2026-11-10T00:00:00.000Z"]',
    );
    expect(computeDataVersion([new Date(1)])).not.toBe(
      computeDataVersion([new Date(2)]),
    );
  });

  it('el planHash cambia si cambian los parámetros o la versión de los datos', () => {
    const base = computePlanHash('PAUSE_CAMPAIGN', params, 'v1');
    expect(computePlanHash('PAUSE_CAMPAIGN', params, 'v1')).toBe(base);
    expect(computePlanHash('PAUSE_CAMPAIGN', params, 'v2')).not.toBe(base);
    expect(
      computePlanHash(
        'PAUSE_CAMPAIGN',
        { campaignId: CAMPAIGN.replace('1', '2') },
        'v1',
      ),
    ).not.toBe(base);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
  });

  it('la idempotencia es por mensaje del dueño + operación + parámetros', () => {
    const key = computeIdempotencyKey('m1', 'PAUSE_CAMPAIGN', params);
    expect(computeIdempotencyKey('m1', 'PAUSE_CAMPAIGN', params)).toBe(key);
    expect(computeIdempotencyKey('m2', 'PAUSE_CAMPAIGN', params)).not.toBe(key);
  });
});

describe('isExplicitActionRequest — Modo B solo a pedido', () => {
  it.each([
    'Pausá la campaña de mesas',
    'pausala',
    'Activá el 2x1 como beneficio',
    'Cambiá la tarjeta a 8 sellos',
    'quiero pausar la campaña',
    '¿Podés activar la misión de octubre?',
    'Necesito cambiar los sellos a 6',
    'Programá la campaña para hoy',
    'Simulame una promo: mandá un mensaje a los ausentes',
  ])('pedido: %s', (text) => {
    expect(isExplicitActionRequest(text)).toBe(true);
  });

  it.each([
    '¿Por qué Autopilot no está activo?',
    '¿Cómo programo una campaña?',
    '¿Qué campañas tengo activas?',
    'Compará octubre con septiembre',
    '¿Conviene cambiar la tarjeta de sellos?',
    'Armá un borrador de campaña para las mesas',
    'El programa de sellos funciona bien',
  ])('no es pedido: %s', (text) => {
    expect(isExplicitActionRequest(text)).toBe(false);
  });
});
