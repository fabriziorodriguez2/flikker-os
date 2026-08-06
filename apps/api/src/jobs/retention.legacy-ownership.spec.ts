import { ExperienceVersion } from '@prisma/client';
import { RetentionProcessor } from './retention.processor';

/**
 * Ownership of retention automation. Exactly one engine may own a business, so
 * a customer can never be contacted twice for the same thing.
 *
 * These tests assert the WHERE clause the legacy processor sends to Prisma,
 * because that clause is the whole safety mechanism: if it stops excluding V2
 * businesses, both engines start messaging the same people.
 */
function makePrisma(sequences: unknown[] = []) {
  const tx = {
    message: { create: jest.fn().mockResolvedValue({ id: 'msg-1' }) },
    retentionSend: { create: jest.fn().mockResolvedValue({ id: 'send-1' }) },
  };
  return {
    retentionSequence: { findMany: jest.fn().mockResolvedValue(sequences) },
    customer: { findMany: jest.fn().mockResolvedValue([]) },
    // createQueuedSend wraps both inserts in a transaction.
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
    tx,
  };
}

function makeQueue() {
  return {
    enqueueSendRetentionMessage: jest.fn().mockResolvedValue(undefined),
  };
}

describe('legacy retention processor — engine ownership', () => {
  it('excludes businesses on CHECKIN_V2 with the V2 engine enabled', async () => {
    const prisma = makePrisma();
    const processor = new RetentionProcessor(
      prisma as never,
      makeQueue() as never,
    );

    await processor.runDaily();

    const where = (
      prisma.retentionSequence.findMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
      }
    ).where;

    expect(where.enabled).toBe(true);
    expect(where.NOT).toEqual({
      business: {
        experienceVersion: ExperienceVersion.CHECKIN_V2,
        retentionEngineV2Enabled: true,
      },
    });
  });

  it('keeps processing when only ONE of the two conditions holds', async () => {
    // The exclusion is an AND of both flags. A CHECKIN_V2 business with the
    // engine off, or a LEGACY business with the flag on, must still be served
    // by legacy — otherwise a business would fall out of every engine.
    const prisma = makePrisma();
    const processor = new RetentionProcessor(
      prisma as never,
      makeQueue() as never,
    );

    await processor.runDaily();

    const where = (
      prisma.retentionSequence.findMany.mock.calls[0][0] as {
        where: { NOT: { business: Record<string, unknown> } };
      }
    ).where;

    // Both keys present ⇒ Prisma requires both to match before excluding.
    expect(Object.keys(where.NOT.business).sort()).toEqual([
      'experienceVersion',
      'retentionEngineV2Enabled',
    ]);
  });

  it('still queues sends for the businesses it does own', async () => {
    const prisma = makePrisma([
      { businessId: 'legacy-biz', steps: [{ id: 'step-1', offsetDays: 10 }] },
    ]);
    prisma.customer.findMany.mockResolvedValue([{ id: 'cust-1' }]);
    const queue = makeQueue();
    const processor = new RetentionProcessor(prisma as never, queue as never);

    const result = await processor.runDaily();

    expect(result.sequences).toBe(1);
    expect(queue.enqueueSendRetentionMessage).toHaveBeenCalled();
  });

  it('queues nothing when every sequence was excluded', async () => {
    // A V2-owned business returns no sequences → legacy sends nothing at all,
    // which is what prevents the double contact.
    const prisma = makePrisma([]);
    const queue = makeQueue();
    const processor = new RetentionProcessor(prisma as never, queue as never);

    const result = await processor.runDaily();

    expect(result.queued).toBe(0);
    expect(queue.enqueueSendRetentionMessage).not.toHaveBeenCalled();
  });
});
