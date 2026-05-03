import { MessageChannel, MessageStatus } from '@prisma/client';
import { ReviewRequestWorker } from './review-request.worker';

describe('ReviewRequestWorker', () => {
  it('marks message failed and does not call BSP when customer opted out', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      message: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'message-1',
          businessId: 'business-1',
          customerId: 'customer-1',
          trackingToken: 'token-1',
          channel: MessageChannel.whatsapp,
          status: MessageStatus.queued,
          customer: {
            id: 'customer-1',
            name: 'Paciente',
            phoneE164: '+59898123456',
            optedOut: true,
          },
          business: {
            id: 'business-1',
            messageCountCurrentMonth: 0,
            messageQuotaMonthly: 600,
          },
        }),
        update,
      },
    };
    const bsp = { sendReviewRequest: jest.fn() };
    const worker = new ReviewRequestWorker(prisma as never, bsp as never);

    await worker.process({
      messageId: 'message-1',
      customerId: 'customer-1',
      businessId: 'business-1',
    });

    expect(bsp.sendReviewRequest).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'message-1' },
      data: { status: MessageStatus.failed },
    });
  });
});
