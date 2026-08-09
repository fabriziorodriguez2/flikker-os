import {
  validateGeneratedCopy,
  type CopySourceOfTruth,
} from './copy-validator';

function sourceOfTruth(
  overrides: Partial<CopySourceOfTruth> = {},
): CopySourceOfTruth {
  return {
    percentageValue: null,
    fixedValue: null,
    expiresInDays: null,
    allowFreeWording: false,
    allowRaffleWording: false,
    maxLength: 480,
    ...overrides,
  };
}

describe('validateGeneratedCopy — basic shape', () => {
  it('accepts plain, on-topic copy', () => {
    const result = validateGeneratedCopy(
      'Hola Ana, hace un tiempo que no te vemos por Café Uno. ¡Te esperamos, escaneá el QR!',
      sourceOfTruth(),
    );
    expect(result.valid).toBe(true);
  });

  it('rejects empty text', () => {
    expect(validateGeneratedCopy('   ', sourceOfTruth())).toEqual({
      valid: false,
      reason: 'EMPTY',
    });
  });

  it('rejects text over the max length', () => {
    const text = 'a'.repeat(500);
    expect(
      validateGeneratedCopy(text, sourceOfTruth({ maxLength: 100 })),
    ).toEqual({
      valid: false,
      reason: 'TOO_LONG',
    });
  });
});

describe('validateGeneratedCopy — Fase F §12: never a URL', () => {
  it('rejects any http(s) URL', () => {
    const result = validateGeneratedCopy(
      'Mirá tu progreso en https://flikker.com/track/123',
      sourceOfTruth(),
    );
    expect(result).toEqual({ valid: false, reason: 'CONTAINS_URL' });
  });

  it('rejects a bare www. link', () => {
    const result = validateGeneratedCopy(
      'Entrá a www.flikker.com para ver más',
      sourceOfTruth(),
    );
    expect(result).toEqual({ valid: false, reason: 'CONTAINS_URL' });
  });
});

describe('validateGeneratedCopy — never a phone-like number', () => {
  it('rejects a long digit sequence', () => {
    const result = validateGeneratedCopy(
      'Llamanos al 099123456 para más info',
      sourceOfTruth(),
    );
    expect(result).toEqual({
      valid: false,
      reason: 'CONTAINS_PHONE_LIKE_NUMBER',
    });
  });

  it('does not flag a short visit count', () => {
    const result = validateGeneratedCopy(
      'Te faltan 2 visitas para tu recompensa',
      sourceOfTruth(),
    );
    expect(result.valid).toBe(true);
  });
});

describe('validateGeneratedCopy — Fase F §10/§45: AI never introduces a commercial fact', () => {
  it('rejects an invented percentage when none was authorized', () => {
    const result = validateGeneratedCopy(
      'Tenés un 15% de descuento esperándote',
      sourceOfTruth({ percentageValue: null }),
    );
    expect(result).toEqual({ valid: false, reason: 'UNAUTHORIZED_PERCENTAGE' });
  });

  it('rejects a percentage that does not match the authorized one', () => {
    const result = validateGeneratedCopy(
      'Tenés un 15% de descuento esperándote',
      sourceOfTruth({ percentageValue: 10 }),
    );
    expect(result).toEqual({ valid: false, reason: 'UNAUTHORIZED_PERCENTAGE' });
  });

  it('accepts the exact authorized percentage', () => {
    const result = validateGeneratedCopy(
      'Tenés un 10% de descuento esperándote, vení a buscarlo',
      sourceOfTruth({ percentageValue: 10 }),
    );
    expect(result.valid).toBe(true);
  });

  it('rejects an invented amount when none was authorized', () => {
    const result = validateGeneratedCopy(
      'Te regalamos $500 en tu próxima compra',
      sourceOfTruth({ fixedValue: null }),
    );
    expect(result).toEqual({ valid: false, reason: 'UNAUTHORIZED_AMOUNT' });
  });

  it('rejects an invented expiry window', () => {
    const result = validateGeneratedCopy(
      'Es válido por 5 días',
      sourceOfTruth({ expiresInDays: null }),
    );
    expect(result).toEqual({ valid: false, reason: 'UNAUTHORIZED_EXPIRY' });
  });

  it('rejects an expiry that does not match the authorized one', () => {
    const result = validateGeneratedCopy(
      'Es válido por 5 días',
      sourceOfTruth({ expiresInDays: 7 }),
    );
    expect(result).toEqual({ valid: false, reason: 'UNAUTHORIZED_EXPIRY' });
  });

  it('accepts the exact authorized expiry', () => {
    const result = validateGeneratedCopy(
      'Es válido por 7 días, no te lo pierdas',
      sourceOfTruth({ expiresInDays: 7 }),
    );
    expect(result.valid).toBe(true);
  });

  it('rejects "gratis" when the incentive is not actually free', () => {
    const result = validateGeneratedCopy(
      'Vas a tener tu producto gratis',
      sourceOfTruth({ allowFreeWording: false }),
    );
    expect(result).toEqual({ valid: false, reason: 'UNAUTHORIZED_FREE_CLAIM' });
  });

  it('accepts "gratis" when the incentive really is free', () => {
    const result = validateGeneratedCopy(
      'Vas a tener tu producto gratis, vení a buscarlo',
      sourceOfTruth({ allowFreeWording: true }),
    );
    expect(result.valid).toBe(true);
  });

  it('rejects raffle wording when this is not a raffle', () => {
    const result = validateGeneratedCopy(
      'Ya estás participando del sorteo',
      sourceOfTruth({ allowRaffleWording: false }),
    );
    expect(result).toEqual({
      valid: false,
      reason: 'UNAUTHORIZED_RAFFLE_CLAIM',
    });
  });
});

describe('validateGeneratedCopy — Fase F §16: never internal segmentation language', () => {
  it('rejects "riesgo de abandono"', () => {
    const result = validateGeneratedCopy(
      'Notamos que estás en riesgo de abandono',
      sourceOfTruth(),
    );
    expect(result).toEqual({
      valid: false,
      reason: 'INTERNAL_SEGMENT_LANGUAGE',
    });
  });

  it('rejects "te estamos trackeando"', () => {
    const result = validateGeneratedCopy(
      'Te estamos trackeando desde tu última visita',
      sourceOfTruth(),
    );
    expect(result).toEqual({
      valid: false,
      reason: 'INTERNAL_SEGMENT_LANGUAGE',
    });
  });
});

describe('validateGeneratedCopy — required CTA intent', () => {
  it('rejects copy missing every required keyword', () => {
    const result = validateGeneratedCopy(
      'Esperamos que estés muy bien.',
      sourceOfTruth({ requiredIntentKeywords: ['qr', 'escane'] }),
    );
    expect(result).toEqual({ valid: false, reason: 'MISSING_REQUIRED_CTA' });
  });

  it('accepts copy mentioning at least one required keyword', () => {
    const result = validateGeneratedCopy(
      'Te esperamos, escaneá el QR cuando vuelvas.',
      sourceOfTruth({ requiredIntentKeywords: ['qr', 'escane'] }),
    );
    expect(result.valid).toBe(true);
  });
});
