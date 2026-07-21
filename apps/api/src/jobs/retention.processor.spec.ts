import { RetentionProcessor } from './retention.processor';

describe('RetentionProcessor.runDaily', () => {
  it('queues one send per candidate and enqueues the job', async () => {
    const prisma = {
      retentionSequence: {
        findMany: jest.fn().mockResolvedValue([
          {
            businessId: 'biz-1',
            steps: [{ id: 'step-20', offsetDays: 20 }],
          },
        ]),
      },
      customer: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'cust-1' }, { id: 'cust-2' }]),
      },
      message: { create: jest.fn() },
      retentionSend: { create: jest.fn() },
      $transaction: jest.fn((cb: (t: unknown) => unknown) =>
        cb({
          message: {
            create: jest.fn().mockResolvedValue({ id: 'msg' }),
          },
          retentionSend: {
            create: jest.fn().mockResolvedValue({ id: 'send' }),
          },
        }),
      ),
    };
    const queue = { enqueueSendRetentionMessage: jest.fn() };

    const processor = new RetentionProcessor(prisma as never, queue as never);
    const result = await processor.runDaily(new Date('2026-07-20T10:00:00'));

    expect(result.queued).toBe(2);
    expect(queue.enqueueSendRetentionMessage).toHaveBeenCalledTimes(2);
    expect(queue.enqueueSendRetentionMessage).toHaveBeenCalledWith({
      retentionSendId: 'send',
    });
  });

  it('selects customers registered offsetDays ago, opted in, without a prior send for that offset', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      retentionSequence: {
        findMany: jest.fn().mockResolvedValue([
          {
            businessId: 'biz-1',
            steps: [{ id: 'step-20', offsetDays: 20 }],
          },
        ]),
      },
      customer: { findMany },
      $transaction: jest.fn(),
    };
    const queue = { enqueueSendRetentionMessage: jest.fn() };

    const processor = new RetentionProcessor(prisma as never, queue as never);
    await processor.runDaily(new Date('2026-07-20T10:00:00'));

    // 20 days before 2026-07-20 is 2026-06-30 (local midnight window).
    expect(findMany).toHaveBeenCalledWith({
      where: {
        businessId: 'biz-1',
        isActive: true,
        optedOut: false,
        createdAt: {
          gte: new Date(2026, 5, 30),
          lt: new Date(2026, 6, 1),
        },
        retentionSends: { none: { offsetDays: 20 } },
      },
      select: { id: true },
    });
  });

  it('does not enqueue when the send could not be created (duplicate race)', async () => {
    const prisma = {
      retentionSequence: {
        findMany: jest.fn().mockResolvedValue([
          {
            businessId: 'biz-1',
            steps: [{ id: 'step-20', offsetDays: 20 }],
          },
        ]),
      },
      customer: {
        findMany: jest.fn().mockResolvedValue([{ id: 'cust-1' }]),
      },
      $transaction: jest.fn().mockRejectedValue(new Error('unique violation')),
    };
    const queue = { enqueueSendRetentionMessage: jest.fn() };

    const processor = new RetentionProcessor(prisma as never, queue as never);
    const result = await processor.runDaily(new Date('2026-07-20T10:00:00'));

    expect(result.queued).toBe(0);
    expect(queue.enqueueSendRetentionMessage).not.toHaveBeenCalled();
  });
});
