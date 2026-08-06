import { ExperienceVersion, RetentionAssignmentStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { RetentionV2Worker } from './retention-v2.worker';
import {
  RUN_RETENTION_V2_EVALUATE_JOB,
  RUN_RETENTION_V2_OUTCOMES_JOB,
  SEND_RETENTION_V2_ASSIGNMENT_JOB,
} from '../retention-v2.queue';

function makeDeps(pending: { id: string }[] = []) {
  return {
    prisma: {
      retentionAssignment: {
        findMany: jest.fn().mockResolvedValue(pending),
      },
    },
    evaluate: {
      runDaily: jest
        .fn()
        .mockResolvedValue({ businesses: 1, assigned: 3, ms: 5 }),
    },
    send: {
      processAssignment: jest.fn().mockResolvedValue({ status: 'sent' }),
    },
    outcomes: {
      runOnce: jest.fn().mockResolvedValue({
        processed: 5,
        returned: 2,
        confirmed: 1,
        closedNoReturn: 1,
        stillOpen: 1,
      }),
    },
    queue: { enqueueSendAssignment: jest.fn().mockResolvedValue(undefined) },
  };
}

function makeWorker(deps: ReturnType<typeof makeDeps>) {
  return new RetentionV2Worker(
    deps.prisma as never,
    deps.evaluate as never,
    deps.send as never,
    deps.outcomes as never,
    deps.queue as never,
  );
}

const job = (name: string, data: unknown = {}) => ({ name, data }) as Job;

describe('RetentionV2Worker — evaluate job', () => {
  it('recruits first, then queues one send per pending assignment', async () => {
    const deps = makeDeps([{ id: 'a1' }, { id: 'a2' }]);
    const worker = makeWorker(deps);

    const result = await worker.process(job(RUN_RETENTION_V2_EVALUATE_JOB));

    expect(deps.evaluate.runDaily).toHaveBeenCalledTimes(1);
    expect(deps.queue.enqueueSendAssignment.mock.calls).toEqual([
      [{ assignmentId: 'a1' }],
      [{ assignmentId: 'a2' }],
    ]);
    expect(result).toEqual({ businesses: 1, assigned: 3, ms: 5, queued: 2 });
  });

  it('never sends during the evaluate pass itself', async () => {
    const deps = makeDeps([{ id: 'a1' }]);
    const worker = makeWorker(deps);

    await worker.process(job(RUN_RETENTION_V2_EVALUATE_JOB));

    expect(deps.send.processAssignment).not.toHaveBeenCalled();
  });

  it('queues off the database, so assignments left pending earlier get retried', async () => {
    // The evaluate pass recruited nobody new, but an older assignment is still
    // waiting (for example one created outside the owner's sending window).
    const deps = makeDeps([{ id: 'from-yesterday' }]);
    deps.evaluate.runDaily.mockResolvedValue({
      businesses: 1,
      assigned: 0,
      ms: 1,
    });
    const worker = makeWorker(deps);

    await worker.process(job(RUN_RETENTION_V2_EVALUATE_JOB));

    expect(deps.queue.enqueueSendAssignment).toHaveBeenCalledWith({
      assignmentId: 'from-yesterday',
    });
  });

  it('re-checks the engine flags when queuing, not just when recruiting', async () => {
    const deps = makeDeps();
    const worker = makeWorker(deps);

    await worker.process(job(RUN_RETENTION_V2_EVALUATE_JOB));

    expect(deps.prisma.retentionAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: RetentionAssignmentStatus.PENDING,
          business: {
            isActive: true,
            experienceVersion: ExperienceVersion.CHECKIN_V2,
            retentionEngineV2Enabled: true,
          },
        },
      }),
    );
  });

  it('caps how much a single run can queue', async () => {
    const deps = makeDeps();
    const worker = makeWorker(deps);

    await worker.process(job(RUN_RETENTION_V2_EVALUATE_JOB));

    const args = deps.prisma.retentionAssignment.findMany.mock.calls[0][0] as {
      take?: number;
    };
    expect(typeof args.take).toBe('number');
  });
});

describe('RetentionV2Worker — send job', () => {
  it('delegates to the send service, which owns every re-validation', async () => {
    const deps = makeDeps();
    const worker = makeWorker(deps);

    const result = await worker.process(
      job(SEND_RETENTION_V2_ASSIGNMENT_JOB, { assignmentId: 'a1' }),
    );

    expect(deps.send.processAssignment).toHaveBeenCalledWith('a1');
    expect(result).toEqual({ status: 'sent' });
  });

  it('lets a send failure bubble up so BullMQ can retry it', async () => {
    const deps = makeDeps();
    deps.send.processAssignment.mockRejectedValue(new Error('provider down'));
    const worker = makeWorker(deps);

    await expect(
      worker.process(
        job(SEND_RETENTION_V2_ASSIGNMENT_JOB, { assignmentId: 'a1' }),
      ),
    ).rejects.toThrow('provider down');
  });

  it('ignores an unknown job instead of crashing the worker', async () => {
    const deps = makeDeps();
    const worker = makeWorker(deps);

    expect(await worker.process(job('something-else'))).toBeNull();
    expect(deps.send.processAssignment).not.toHaveBeenCalled();
    expect(deps.evaluate.runDaily).not.toHaveBeenCalled();
  });
});

describe('RetentionV2Worker — outcomes job (Fase D)', () => {
  it('delegates to the outcome service and returns its summary', async () => {
    const deps = makeDeps();
    const worker = makeWorker(deps);

    const result = await worker.process(job(RUN_RETENTION_V2_OUTCOMES_JOB));

    expect(deps.outcomes.runOnce).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      processed: 5,
      returned: 2,
      confirmed: 1,
      closedNoReturn: 1,
      stillOpen: 1,
    });
  });

  it('never touches send or evaluate', async () => {
    const deps = makeDeps();
    const worker = makeWorker(deps);

    await worker.process(job(RUN_RETENTION_V2_OUTCOMES_JOB));

    expect(deps.send.processAssignment).not.toHaveBeenCalled();
    expect(deps.evaluate.runDaily).not.toHaveBeenCalled();
  });
});
