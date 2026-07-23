import { RaffleProcessor } from './raffle.processor';

const TZ = 'America/Montevideo'; // UTC-3, no DST

function makeBenefit(
  overrides: Partial<{ id: string; businessId: string }> = {},
) {
  return {
    id: overrides.id ?? 'benefit-1',
    businessId: overrides.businessId ?? 'biz-1',
    business: { timezone: TZ },
  };
}

describe('RaffleProcessor.runTick', () => {
  it('skips a benefit when it is not the last day of the month locally', async () => {
    const prisma = {
      benefit: { findMany: jest.fn().mockResolvedValue([makeBenefit()]) },
      raffleDraw: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    const queue = { enqueueSendRaffleNotifications: jest.fn() };
    const processor = new RaffleProcessor(prisma as never, queue as never);

    // 2026-07-30T23:50:00-03:00 — one day before month end.
    const result = await processor.runTick(new Date('2026-07-31T02:50:00Z'));

    expect(result.drawn).toBe(0);
    expect(prisma.raffleDraw.findUnique).not.toHaveBeenCalled();
    expect(queue.enqueueSendRaffleNotifications).not.toHaveBeenCalled();
  });

  it('skips on the last day of the month but before the 23:50 local window', async () => {
    const prisma = {
      benefit: { findMany: jest.fn().mockResolvedValue([makeBenefit()]) },
      raffleDraw: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    const queue = { enqueueSendRaffleNotifications: jest.fn() };
    const processor = new RaffleProcessor(prisma as never, queue as never);

    // 2026-07-31T10:00:00-03:00 — last day, but too early.
    const result = await processor.runTick(new Date('2026-07-31T13:00:00Z'));

    expect(result.drawn).toBe(0);
    expect(prisma.raffleDraw.findUnique).not.toHaveBeenCalled();
  });

  it('skips when this period was already drawn', async () => {
    const prisma = {
      benefit: { findMany: jest.fn().mockResolvedValue([makeBenefit()]) },
      raffleDraw: {
        findUnique: jest.fn().mockResolvedValue({ id: 'existing-draw' }),
      },
      $transaction: jest.fn(),
    };
    const queue = { enqueueSendRaffleNotifications: jest.fn() };
    const processor = new RaffleProcessor(prisma as never, queue as never);

    const result = await processor.runTick(new Date('2026-08-01T02:50:00Z'));

    expect(result.drawn).toBe(0);
    expect(prisma.raffleDraw.findUnique).toHaveBeenCalledWith({
      where: {
        benefitId_periodKey: { benefitId: 'benefit-1', periodKey: '2026-07' },
      },
      select: { id: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(queue.enqueueSendRaffleNotifications).not.toHaveBeenCalled();
  });

  it('draws a winner, closes the open cycle, and enqueues the notification', async () => {
    const updateMany = jest.fn();
    const tx = {
      benefitParticipation: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'p1', customerId: 'cust-1' },
          { id: 'p2', customerId: 'cust-2' },
        ]),
        updateMany,
      },
      raffleDraw: { create: jest.fn().mockResolvedValue({ id: 'draw-1' }) },
    };
    const prisma = {
      benefit: { findMany: jest.fn().mockResolvedValue([makeBenefit()]) },
      raffleDraw: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    };
    const queue = { enqueueSendRaffleNotifications: jest.fn() };
    const processor = new RaffleProcessor(prisma as never, queue as never);

    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
    const result = await processor.runTick(new Date('2026-08-01T02:50:00Z'));
    randomSpy.mockRestore();

    expect(result.drawn).toBe(1);
    expect(tx.raffleDraw.create).toHaveBeenCalledWith({
      data: {
        benefitId: 'benefit-1',
        businessId: 'biz-1',
        periodKey: '2026-07',
        winnerCustomerId: 'cust-1',
        participantsCount: 2,
        drawnAt: new Date('2026-08-01T02:50:00Z'),
      },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { benefitId: 'benefit-1', raffleDrawId: null },
      data: { raffleDrawId: 'draw-1' },
    });
    expect(queue.enqueueSendRaffleNotifications).toHaveBeenCalledWith({
      drawId: 'draw-1',
    });
  });

  it('does not draw or enqueue when there are no open participants', async () => {
    const tx = {
      benefitParticipation: { findMany: jest.fn().mockResolvedValue([]) },
      raffleDraw: { create: jest.fn() },
    };
    const prisma = {
      benefit: { findMany: jest.fn().mockResolvedValue([makeBenefit()]) },
      raffleDraw: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    };
    const queue = { enqueueSendRaffleNotifications: jest.fn() };
    const processor = new RaffleProcessor(prisma as never, queue as never);

    const result = await processor.runTick(new Date('2026-08-01T02:50:00Z'));

    expect(result.drawn).toBe(0);
    expect(tx.raffleDraw.create).not.toHaveBeenCalled();
    expect(queue.enqueueSendRaffleNotifications).not.toHaveBeenCalled();
  });
});
