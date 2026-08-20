import { validateChatbotDataAnswer } from './chatbot-answer-validator';

describe('validateChatbotDataAnswer', () => {
  const payload = { returningCustomers: 17, inactiveCustomers: 22, month: 8 };

  it('acepta una respuesta donde todos los números vienen del payload', () => {
    const result = validateChatbotDataAnswer(
      'Este mes volvieron 17 clientes y hay 22 inactivos.',
      payload,
    );
    expect(result).toEqual({ valid: true });
  });

  it('acepta números con coma decimal (es-UY) presentes en el payload', () => {
    const result = validateChatbotDataAnswer(
      'Vuelven 1,7 veces más seguido.',
      { upliftFactor: 1.7 },
    );
    expect(result).toEqual({ valid: true });
  });

  it('rechaza un número que no está en el payload (inventado)', () => {
    const result = validateChatbotDataAnswer(
      'Este mes volvieron 999 clientes.',
      payload,
    );
    expect(result).toEqual({ valid: false, reason: 'UNGROUNDED_NUMBER' });
  });

  it('rechaza una respuesta vacía', () => {
    expect(validateChatbotDataAnswer('   ', payload)).toEqual({
      valid: false,
      reason: 'EMPTY',
    });
  });

  it('rechaza una respuesta con URL', () => {
    const result = validateChatbotDataAnswer(
      'Mirá más en https://flikker.site/algo',
      payload,
    );
    expect(result).toEqual({ valid: false, reason: 'CONTAINS_URL' });
  });

  it('rechaza una respuesta con un número tipo teléfono', () => {
    const result = validateChatbotDataAnswer(
      'Llamanos al 099123456 para más info.',
      payload,
    );
    expect(result).toEqual({
      valid: false,
      reason: 'CONTAINS_PHONE_LIKE_NUMBER',
    });
  });

  it('rechaza una respuesta demasiado larga', () => {
    const long = 'x'.repeat(50);
    const result = validateChatbotDataAnswer(long, payload, 40);
    expect(result).toEqual({ valid: false, reason: 'TOO_LONG' });
  });

  it('una respuesta sin ningún número siempre es válida (no hay nada que fundamentar)', () => {
    const result = validateChatbotDataAnswer(
      'Todavía no tenés suficientes datos para esto.',
      payload,
    );
    expect(result).toEqual({ valid: true });
  });
});
