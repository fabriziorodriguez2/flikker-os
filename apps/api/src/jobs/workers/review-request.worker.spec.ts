import { MessageChannel, MessageStatus } from '@prisma/client';
import { ReviewRequestWorker } from './review-request.worker';

type MessageOverrides = {
  status?: MessageStatus;
  optedOut?: boolean;
  /** `undefined` = mensaje anterior a la columna (queda NULL). */
  originatingVisitId?: string | null;
};

function buildHarness(overrides: MessageOverrides = {}) {
  const update = jest.fn().mockResolvedValue({});
  const prisma = {
    message: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'message-1',
        businessId: 'business-1',
        customerId: 'customer-1',
        trackingToken: 'token-1',
        channel: MessageChannel.whatsapp,
        status: overrides.status ?? MessageStatus.queued,
        originatingVisitId:
          overrides.originatingVisitId === undefined
            ? 'visit-1'
            : overrides.originatingVisitId,
        customer: {
          id: 'customer-1',
          name: 'Paciente',
          phoneE164: '+59898123456',
          optedOut: overrides.optedOut ?? false,
        },
        business: {
          id: 'business-1',
          name: 'Bar Fraternidad',
          messageCountCurrentMonth: 0,
          messageQuotaMonthly: 600,
          reviewRequestsPausedUntil: null,
        },
      }),
      update,
    },
    googleReview: { findFirst: jest.fn().mockResolvedValue(null) },
    business: { update: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const bsp = {
    sendReviewRequest: jest
      .fn()
      .mockResolvedValue({ whatsappMessageId: 'wamid-1' }),
  };
  const feedbackRepository = {
    hasFeedbackForVisit: jest.fn().mockResolvedValue(false),
  };
  const worker = new ReviewRequestWorker(
    prisma as never,
    bsp as never,
    feedbackRepository as never,
  );

  const run = () =>
    worker.process({
      messageId: 'message-1',
      customerId: 'customer-1',
      businessId: 'business-1',
    });

  return { prisma, bsp, feedbackRepository, update, run };
}

describe('ReviewRequestWorker', () => {
  const originalAppUrl = process.env.APP_PUBLIC_URL;

  afterEach(() => {
    if (originalAppUrl === undefined) delete process.env.APP_PUBLIC_URL;
    else process.env.APP_PUBLIC_URL = originalAppUrl;
  });

  it('marks message failed and does not call BSP when customer opted out', async () => {
    const { bsp, update, run } = buildHarness({ optedOut: true });

    await run();

    expect(bsp.sendReviewRequest).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'message-1' },
      data: { status: MessageStatus.failed },
    });
  });

  // Test 1 del pedido: cliente CHECKIN_V2 que todavía no dejó feedback recibe
  // el recordatorio, con una URL construida desde APP_PUBLIC_URL.
  it('envía el recordatorio con una URL armada desde APP_PUBLIC_URL cuando no hay feedback', async () => {
    process.env.APP_PUBLIC_URL = 'https://flikker.site';
    const { bsp, feedbackRepository, run } = buildHarness();

    await run();

    // Se pregunta por LA visita que originó el mensaje, no por el cliente.
    expect(feedbackRepository.hasFeedbackForVisit).toHaveBeenCalledWith(
      'visit-1',
    );
    expect(bsp.sendReviewRequest).toHaveBeenCalledTimes(1);
    expect(bsp.sendReviewRequest.mock.calls[0][0].trackingUrl).toBe(
      'https://flikker.site/r/token-1',
    );
  });

  // Test 3 del pedido: la URL nunca vuelve a las rutas de V1.
  it('nunca genera una ruta legacy (/l/... ni /qr/.../review)', async () => {
    process.env.APP_PUBLIC_URL = 'https://flikker.site';
    const { bsp, run } = buildHarness();

    await run();

    const { trackingUrl } = bsp.sendReviewRequest.mock.calls[0][0] as {
      trackingUrl: string;
    };
    expect(trackingUrl).not.toMatch(/\/l\//);
    expect(trackingUrl).not.toMatch(/\/qr\//);
    expect(trackingUrl).not.toMatch(/\/review\b/);
    expect(trackingUrl).toMatch(/^https:\/\/flikker\.site\/r\/[^/]+$/);
    // Y jamás el customerId en la URL.
    expect(trackingUrl).not.toContain('customer-1');
  });

  // Test 2 del pedido: el estado se re-verifica al momento del envío, no al
  // momento de programar el job.
  it('no manda nada si esa visita ya tiene feedback, y lo marca skipped (no failed)', async () => {
    const { bsp, update, feedbackRepository, run } = buildHarness();
    feedbackRepository.hasFeedbackForVisit.mockResolvedValue(true);

    await run();

    expect(bsp.sendReviewRequest).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'message-1' },
      data: { status: MessageStatus.skipped },
    });
    // Nunca `failed`, y nunca queda `queued` esperando un reintento.
    expect(update).toHaveBeenCalledTimes(1);
  });

  // Punto 1 del pedido: una visita POSTERIOR no cambia la decisión de este
  // recordatorio. El chequeo es por `originatingVisitId`, no por "la última".
  it('una visita posterior sin feedback no altera la decisión del recordatorio anterior', async () => {
    const { bsp, feedbackRepository, run } = buildHarness();
    // La visita que originó el mensaje YA tiene feedback; el cliente volvió
    // después y esa visita nueva todavía no. Igual se saltea.
    feedbackRepository.hasFeedbackForVisit.mockImplementation(
      (visitId: string) => Promise.resolve(visitId === 'visit-1'),
    );

    await run();

    expect(feedbackRepository.hasFeedbackForVisit).toHaveBeenCalledWith(
      'visit-1',
    );
    expect(feedbackRepository.hasFeedbackForVisit).not.toHaveBeenCalledWith(
      'visit-2',
    );
    expect(bsp.sendReviewRequest).not.toHaveBeenCalled();
  });

  it('un mensaje salteado no se vuelve a tomar en un reintento', async () => {
    const { bsp, update, feedbackRepository, run } = buildHarness({
      status: MessageStatus.skipped,
    });

    await run();

    expect(bsp.sendReviewRequest).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(feedbackRepository.hasFeedbackForVisit).not.toHaveBeenCalled();
  });

  it('un mensaje viejo sin visita asociada se envía como siempre', async () => {
    const { bsp, feedbackRepository, run } = buildHarness({
      originatingVisitId: null,
    });

    await run();

    expect(feedbackRepository.hasFeedbackForVisit).not.toHaveBeenCalled();
    expect(bsp.sendReviewRequest).toHaveBeenCalledTimes(1);
  });

  // Test 4 del pedido: un reintento del job sobre una fila ya procesada no
  // vuelve a mandar el mensaje.
  it('no duplica el mensaje si el job se reintenta sobre una fila ya enviada', async () => {
    const { bsp, update, feedbackRepository, run } = buildHarness({
      status: MessageStatus.sent,
    });

    await run();

    expect(bsp.sendReviewRequest).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(feedbackRepository.hasFeedbackForVisit).not.toHaveBeenCalled();
  });
});
