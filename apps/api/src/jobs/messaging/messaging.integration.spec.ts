import { randomUUID } from 'crypto';
import { DeliveryAttemptStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  createTestBusiness,
  makeTestSuffix,
} from '../../modules/reviews/reviews.test-helpers';
import { WhatsAppProviderError } from '../whatsapp-provider';
import { recipientHash } from './delivery-errors';
import { MessagingService, SENDER_PAUSE_MS } from './messaging.service';

// Proveedor falso: ningún test de este archivo puede llegar a WhatsApp.
const mockSendText = jest.fn();
const mockIsAvailable = jest.fn();
jest.mock('../whatsapp-provider.factory', () => ({
  getWhatsAppProvider: () => ({
    name: 'fake',
    isAvailable: (): unknown => mockIsAvailable(),
    sendText: (input: unknown): unknown => mockSendText(input),
  }),
}));

/**
 * La capa de mensajería contra Postgres real: lo que se prueba es que un
 * mismo envío lógico nunca llegue dos veces al proveedor, y que un error de
 * sesión o de cuenta frene al remitente en vez de insistir.
 */
describe('MessagingService (integration)', () => {
  let prisma: PrismaService;
  let messaging: MessagingService;
  let available = false;
  let businessId = '';
  const s = makeTestSuffix();
  const ORIGINAL_SESSION = process.env.WHATSAPP_SENDER_SESSION;
  const NOW = new Date('2026-11-14T15:00:00Z');

  const input = (key: string) => ({
    businessId,
    customerId: randomUUID(),
    purpose: 'TEST',
    idempotencyKey: `${s}:${key}`,
    to: '+59891234567',
    text: 'Hola',
  });

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;
    prisma = new PrismaService();
    try {
      await prisma.$connect();
      businessId = (await createTestBusiness(prisma, `msg-${s}`)).id;
      messaging = new MessagingService(prisma);
      available = true;
    } catch {
      available = false;
    }
  });

  beforeEach(() => {
    // Una sesión por test: la pausa de un test no contamina al siguiente.
    process.env.WHATSAPP_SENDER_SESSION = `test-${s}-${randomUUID().slice(0, 6)}`;
    mockSendText.mockReset();
    mockIsAvailable.mockReset().mockResolvedValue(true);
  });

  afterAll(async () => {
    process.env.WHATSAPP_SENDER_SESSION = ORIGINAL_SESSION;
    if (!available) {
      await prisma?.$disconnect().catch(() => undefined);
      return;
    }
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('registra negocio, sesión, proveedor y destinatario (sin el número)', async () => {
    if (!available) return;
    mockSendText.mockResolvedValue({
      providerMessageId: 'p-1',
      status: 'accepted',
    });

    const outcome = await messaging.send(input('ok'), NOW);

    expect(outcome).toMatchObject({ status: 'sent', providerMessageId: 'p-1' });
    const row = await prisma.messageDeliveryAttempt.findFirstOrThrow({
      where: { idempotencyKey: `${s}:ok` },
    });
    expect(row).toMatchObject({
      businessId,
      provider: 'fake',
      senderSession: process.env.WHATSAPP_SENDER_SESSION,
      recipientHash: recipientHash('+59891234567'),
      status: DeliveryAttemptStatus.ACCEPTED,
      providerMessageId: 'p-1',
    });
    expect(JSON.stringify(row)).not.toContain('59891234567');
  });

  it('el mismo envío lógico repetido no vuelve a llamar al proveedor', async () => {
    if (!available) return;
    mockSendText.mockResolvedValue({
      providerMessageId: 'p-2',
      status: 'accepted',
    });

    expect((await messaging.send(input('dup'), NOW)).status).toBe('sent');
    expect(await messaging.send(input('dup'), NOW)).toEqual({
      status: 'duplicate',
    });
    expect(mockSendText).toHaveBeenCalledTimes(1);
  });

  it('dos intentos concurrentes con la misma clave: el proveedor recibe uno solo', async () => {
    if (!available) return;
    mockSendText.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ providerMessageId: 'p-3', status: 'accepted' }),
            50,
          ),
        ),
    );

    const results = await Promise.all([
      messaging.send(input('race'), NOW),
      messaging.send(input('race'), NOW),
      messaging.send(input('race'), NOW),
    ]);

    expect(mockSendText).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.status === 'sent')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'duplicate')).toHaveLength(2);
  });

  it('un rechazo seguro (5xx) libera la clave: el reintento sí sale', async () => {
    if (!available) return;
    mockSendText
      .mockRejectedValueOnce(
        new WhatsAppProviderError('WaSenderAPI send failed: down', 503),
      )
      .mockResolvedValueOnce({ providerMessageId: 'p-4', status: 'accepted' });

    const first = await messaging.send(input('retry'), NOW);
    expect(first).toMatchObject({
      status: 'failed',
      errorClass: 'PROVIDER_ERROR',
      retryable: true,
      safeToResend: true,
    });
    expect((await messaging.send(input('retry'), NOW)).status).toBe('sent');
    expect(mockSendText).toHaveBeenCalledTimes(2);
  });

  it('un timeout deja la clave tomada: nunca se reenvía solo', async () => {
    if (!available) return;
    mockSendText.mockRejectedValue(
      new WhatsAppProviderError('WaSenderAPI request timed out'),
    );

    expect(await messaging.send(input('timeout'), NOW)).toMatchObject({
      status: 'failed',
      errorClass: 'AMBIGUOUS',
      safeToResend: false,
    });
    expect(await messaging.send(input('timeout'), NOW)).toEqual({
      status: 'duplicate',
    });
    expect(mockSendText).toHaveBeenCalledTimes(1);
    const row = await prisma.messageDeliveryAttempt.findFirstOrThrow({
      where: { idempotencyKey: `${s}:timeout` },
    });
    expect(row.status).toBe(DeliveryAttemptStatus.UNKNOWN);
  });

  it('sesión caída: pausa el remitente para todos los envíos un rato', async () => {
    if (!available) return;
    mockSendText.mockRejectedValueOnce(
      new WhatsAppProviderError(
        'WaSenderAPI send failed: Session is not connected',
        400,
      ),
    );

    expect(await messaging.send(input('s1'), NOW)).toMatchObject({
      errorClass: 'SESSION_UNAVAILABLE',
    });

    // Otro envío, otra clave: ni siquiera se le pregunta al proveedor.
    const later = new Date(NOW.getTime() + 60_000);
    expect(await messaging.send(input('s2'), later)).toMatchObject({
      status: 'failed',
      errorClass: 'SENDER_PAUSED',
      retryable: true,
      safeToResend: true,
    });
    expect(await messaging.isChannelAvailable(businessId, later)).toBe(false);
    expect(mockSendText).toHaveBeenCalledTimes(1);

    // Pasada la pausa, se vuelve a probar.
    mockSendText.mockResolvedValueOnce({
      providerMessageId: 'p-5',
      status: 'accepted',
    });
    const afterPause = new Date(NOW.getTime() + SENDER_PAUSE_MS + 60_000);
    expect((await messaging.send(input('s3'), afterPause)).status).toBe('sent');
    expect(await messaging.isChannelAvailable(businessId, afterPause)).toBe(
      true,
    );
  });

  it('un número inválido no pausa al remitente', async () => {
    if (!available) return;
    mockSendText
      .mockRejectedValueOnce(
        new WhatsAppProviderError(
          'WaSenderAPI send failed: The to field must be a valid phone number',
          422,
        ),
      )
      .mockResolvedValueOnce({ providerMessageId: 'p-6', status: 'accepted' });

    expect(await messaging.send(input('bad'), NOW)).toMatchObject({
      errorClass: 'RECIPIENT_INVALID',
      retryable: false,
    });
    expect((await messaging.send(input('next'), NOW)).status).toBe('sent');
  });
});
