import { RetentionRepository } from './retention.repository';

function makePrisma() {
  const tx = {
    retentionSequence: {
      upsert: jest.fn().mockResolvedValue({ id: 'seq-1' }),
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'seq-1', enabled: true, steps: [] }),
    },
    retentionStep: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  return { prisma, tx };
}

describe('RetentionRepository.save', () => {
  it('upserts the sequence, clears old steps, and recreates them scoped to the business', async () => {
    const { prisma, tx } = makePrisma();
    const repo = new RetentionRepository(prisma as never);

    await repo.save('biz-1', true, [
      { offsetDays: 20, messageBody: 'Hola' },
      { offsetDays: 45, messageBody: 'Volvé' },
    ]);

    expect(tx.retentionSequence.upsert).toHaveBeenCalledWith({
      where: { businessId: 'biz-1' },
      create: { businessId: 'biz-1', enabled: true },
      update: { enabled: true },
    });
    expect(tx.retentionStep.deleteMany).toHaveBeenCalledWith({
      where: { sequenceId: 'seq-1' },
    });
    expect(tx.retentionStep.createMany).toHaveBeenCalledWith({
      data: [
        {
          sequenceId: 'seq-1',
          businessId: 'biz-1',
          offsetDays: 20,
          messageBody: 'Hola',
        },
        {
          sequenceId: 'seq-1',
          businessId: 'biz-1',
          offsetDays: 45,
          messageBody: 'Volvé',
        },
      ],
    });
  });

  it('does not call createMany when there are no steps', async () => {
    const { prisma, tx } = makePrisma();
    const repo = new RetentionRepository(prisma as never);

    await repo.save('biz-1', false, []);

    expect(tx.retentionStep.deleteMany).toHaveBeenCalled();
    expect(tx.retentionStep.createMany).not.toHaveBeenCalled();
  });
});
