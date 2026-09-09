import { OwnerNotificationsWorker } from './owner-notifications.worker';

/**
 * Fuente única de verdad por experiencia (pedido explícito): LEGACY sigue
 * leyendo `FeedbackResponse` exactamente como siempre; Check-in V2 lee
 * `CheckinFeedback` — nunca la tabla del otro lado, y nunca las dos a la vez.
 */
function makeHarness() {
  const prisma = {
    feedbackResponse: { findFirst: jest.fn() },
    checkinFeedback: { findFirst: jest.fn() },
    membership: {
      findMany: jest.fn().mockResolvedValue([
        {
          user: {
            email: 'owner@cafe.test',
            notificationEmail: null,
            notificationWhatsapp: null,
          },
        },
      ]),
    },
  };
  const whatsAppBspService = { sendText: jest.fn().mockResolvedValue({}) };
  const emailService = { send: jest.fn().mockResolvedValue(true) };
  const ownerNotificationsQueue = {};

  const worker = new OwnerNotificationsWorker(
    prisma as never,
    whatsAppBspService as never,
    emailService as never,
    ownerNotificationsQueue as never,
  );

  return { prisma, whatsAppBspService, emailService, worker };
}

describe('OwnerNotificationsWorker.processLowFeedback — fuente por experiencia', () => {
  it('CHECKIN_V2: lee CheckinFeedback, nunca FeedbackResponse', async () => {
    const { prisma, worker, emailService } = makeHarness();
    prisma.checkinFeedback.findFirst.mockResolvedValue({
      id: 'cf-1',
      score: 2,
      comment: 'Tardaron mucho',
      business: { name: 'Café Test', phone: null },
      customer: { name: 'Ana' },
    });

    await worker.processLowFeedback({
      source: 'checkin_v2',
      businessId: 'biz-1',
      checkinFeedbackId: 'cf-1',
    });

    expect(prisma.checkinFeedback.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cf-1', businessId: 'biz-1' },
      }),
    );
    expect(prisma.feedbackResponse.findFirst).not.toHaveBeenCalled();
    expect(emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['owner@cafe.test'],
        subject: expect.stringContaining('2/5'),
      }),
    );
  });

  it('LEGACY: sigue leyendo FeedbackResponse exactamente como antes, nunca CheckinFeedback', async () => {
    const { prisma, worker, emailService } = makeHarness();
    prisma.feedbackResponse.findFirst.mockResolvedValue({
      id: 'fr-1',
      score: 2,
      comment: null,
      business: { name: 'Café Test', phone: null },
      customer: { name: 'Ana' },
    });

    await worker.processLowFeedback({
      source: 'legacy',
      businessId: 'biz-1',
      feedbackResponseId: 'fr-1',
    });

    expect(prisma.feedbackResponse.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'fr-1', businessId: 'biz-1' },
      }),
    );
    expect(prisma.checkinFeedback.findFirst).not.toHaveBeenCalled();
    expect(emailService.send).toHaveBeenCalled();
  });

  it('score alto: nunca llega acá para empezar (invariante — el disparo con score>=4 no ocurre en el caller), pero si llegara, igual notifica lo que se le pida', async () => {
    // Esta suite prueba la LECTURA, no el gating de score — el gating real
    // (score<4 dispara, score>=4 no) se prueba donde se decide si encolar:
    // `reward-goal-feedback.service.spec.ts` (V2) y `feedback.service.spec.ts`
    // (LEGACY). Acá solo se confirma que el worker no vuelve a filtrar por
    // su cuenta — hace lo que el job le pide, siempre.
    const { prisma, worker, emailService } = makeHarness();
    prisma.checkinFeedback.findFirst.mockResolvedValue({
      id: 'cf-2',
      score: 5,
      comment: null,
      business: { name: 'Café Test', phone: null },
      customer: { name: 'Ana' },
    });

    await worker.processLowFeedback({
      source: 'checkin_v2',
      businessId: 'biz-1',
      checkinFeedbackId: 'cf-2',
    });

    expect(emailService.send).toHaveBeenCalled();
  });

  it('id inexistente para esa fuente: no notifica, no explota', async () => {
    const { prisma, worker, emailService, whatsAppBspService } = makeHarness();
    prisma.checkinFeedback.findFirst.mockResolvedValue(null);

    await worker.processLowFeedback({
      source: 'checkin_v2',
      businessId: 'biz-1',
      checkinFeedbackId: 'cf-inexistente',
    });

    expect(emailService.send).not.toHaveBeenCalled();
    expect(whatsAppBspService.sendText).not.toHaveBeenCalled();
  });
});
