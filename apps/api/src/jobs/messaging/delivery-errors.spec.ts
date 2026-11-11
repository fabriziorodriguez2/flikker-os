import { WhatsAppProviderError } from '../whatsapp-provider';
import {
  classifyDeliveryError,
  recipientHash,
  sanitizeProviderMessage,
} from './delivery-errors';

const providerError = (message: string, status?: number, code?: string) =>
  new WhatsAppProviderError(message, status, code);

describe('classifyDeliveryError', () => {
  it('un timeout es AMBIGUO: el mensaje pudo haber salido, nunca se reenvía solo', () => {
    const v = classifyDeliveryError(
      providerError('WaSenderAPI request timed out'),
    );
    expect(v).toMatchObject({
      errorClass: 'AMBIGUOUS',
      retryable: false,
      safeToResend: false,
    });
  });

  it('un corte de red sin respuesta también es AMBIGUO', () => {
    expect(
      classifyDeliveryError(
        providerError('WaSenderAPI request failed: fetch failed'),
      ).errorClass,
    ).toBe('AMBIGUOUS');
    expect(classifyDeliveryError(new Error('socket hang up')).errorClass).toBe(
      'AMBIGUOUS',
    );
  });

  it('respuesta OK sin id: el proveedor lo tomó, no se reenvía', () => {
    expect(
      classifyDeliveryError(
        providerError(
          'WaSenderAPI accepted the request but returned no message id',
        ),
      ),
    ).toMatchObject({ errorClass: 'AMBIGUOUS', safeToResend: false });
  });

  it('falta de API key: nunca salió nada, y frena el remitente', () => {
    expect(
      classifyDeliveryError(
        providerError('WASENDER_API_KEY is required to send WhatsApp messages'),
      ),
    ).toMatchObject({
      errorClass: 'ACCOUNT_RESTRICTED',
      safeToResend: true,
      pausesSender: true,
    });
  });

  it.each([
    [429, 'Too many requests'],
    [400, 'Account protection: You can only send 1 message every 5 seconds'],
  ])('límite de velocidad (%s): se reintenta sin riesgo', (status, msg) => {
    expect(
      classifyDeliveryError(
        providerError(`WaSenderAPI send failed: ${msg}`, status),
      ),
    ).toMatchObject({
      errorClass: 'RATE_LIMITED',
      retryable: true,
      safeToResend: true,
      pausesSender: false,
    });
  });

  it('sesión desconectada: reintentar más tarde y frenar el remitente', () => {
    expect(
      classifyDeliveryError(
        providerError('WaSenderAPI send failed: Session is not connected', 400),
      ),
    ).toMatchObject({
      errorClass: 'SESSION_UNAVAILABLE',
      retryable: true,
      safeToResend: true,
      pausesSender: true,
    });
  });

  it.each([
    [401, 'Unauthenticated.'],
    [403, 'Forbidden'],
    [402, 'No active subscription'],
    [400, 'This account has been banned'],
  ])(
    'cuenta o credenciales (%s): no se reintenta y frena el remitente',
    (status, msg) => {
      expect(
        classifyDeliveryError(
          providerError(`WaSenderAPI send failed: ${msg}`, status),
        ),
      ).toMatchObject({
        errorClass: 'ACCOUNT_RESTRICTED',
        retryable: false,
        pausesSender: true,
      });
    },
  );

  it('número inválido: falla definitiva solo para ese destinatario', () => {
    expect(
      classifyDeliveryError(
        providerError(
          'WaSenderAPI send failed: The to field must be a valid phone number',
          422,
        ),
      ),
    ).toMatchObject({
      errorClass: 'RECIPIENT_INVALID',
      retryable: false,
      safeToResend: true,
      pausesSender: false,
    });
  });

  it('5xx con respuesta: el proveedor no lo tomó, se reintenta', () => {
    expect(
      classifyDeliveryError(
        providerError('WaSenderAPI send failed: oops', 502),
      ),
    ).toMatchObject({
      errorClass: 'PROVIDER_ERROR',
      retryable: true,
      safeToResend: true,
    });
  });

  it('otro 4xx desconocido: no salió, pero reintentar daría lo mismo', () => {
    expect(
      classifyDeliveryError(
        providerError('WaSenderAPI send failed: weird', 418),
      ),
    ).toMatchObject({
      errorClass: 'PROVIDER_ERROR',
      retryable: false,
      safeToResend: true,
    });
  });

  it('conserva el código HTTP y el del proveedor', () => {
    expect(
      classifyDeliveryError(
        providerError('WaSenderAPI send failed: x', 503, 'E1'),
      ),
    ).toMatchObject({ httpStatus: 503, errorCode: 'E1' });
  });
});

describe('sanitizeProviderMessage / recipientHash', () => {
  it('tapa secuencias largas de dígitos y recorta', () => {
    expect(sanitizeProviderMessage('invalid +59891234567 x')).toBe(
      'invalid +[num] x',
    );
    expect(sanitizeProviderMessage('a'.repeat(500))).toHaveLength(300);
  });

  it('el hash es estable y no contiene el número', () => {
    const h = recipientHash('+59891234567');
    expect(h).toBe(recipientHash(' +59891234567 '));
    expect(h).not.toContain('59891234567');
    expect(h).toHaveLength(64);
  });
});
