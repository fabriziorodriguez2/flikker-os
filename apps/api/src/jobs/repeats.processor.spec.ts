import { RepeatsProcessor } from './repeats.processor';

describe('RepeatsProcessor anti-spam', () => {
  it('returns true when same campaign contacted same customer in last 14 days', async () => {
    const prisma = {
      campaignExecution: {
        findFirst: jest.fn().mockResolvedValue({ id: 'execution-1' }),
      },
    };
    const processor = new RepeatsProcessor(prisma as never, {} as never);

    await expect(
      processor.wasContactedRecently(
        'campaign-1',
        'customer-1',
        new Date('2026-05-03T12:00:00Z'),
      ),
    ).resolves.toBe(true);

    expect(prisma.campaignExecution.findFirst).toHaveBeenCalledWith({
      where: {
        campaignId: 'campaign-1',
        customerId: 'customer-1',
        executedAt: { gte: new Date('2026-04-19T12:00:00Z') },
      },
      select: { id: true },
    });
  });

  it('returns false when there is no recent execution', async () => {
    const prisma = {
      campaignExecution: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const processor = new RepeatsProcessor(prisma as never, {} as never);

    await expect(
      processor.wasContactedRecently(
        'campaign-1',
        'customer-1',
        new Date('2026-05-03T12:00:00Z'),
      ),
    ).resolves.toBe(false);
  });
});
