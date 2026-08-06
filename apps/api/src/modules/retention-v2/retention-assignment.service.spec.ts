import { Prisma, RetentionStrategyType } from '@prisma/client';
import { CustomerSegment } from '@prisma/client';
import { RetentionAssignmentService } from './retention-assignment.service';
import { computeVisitFrequency } from './visit-frequency';

const NOW = new Date('2026-08-31T12:00:00.000Z');
const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

const VALID_VARIANTS = [
  {
    id: 'v-control',
    strategyType: RetentionStrategyType.CONTROL,
    allocationPercent: 15,
    active: true,
  },
  {
    id: 'v-reminder',
    strategyType: RetentionStrategyType.REMINDER,
    allocationPercent: 85,
    active: true,
  },
];

function makePrisma(variants = VALID_VARIANTS) {
  return {
    retentionVariant: { findMany: jest.fn().mockResolvedValue(variants) },
    retentionAssignment: {
      create: jest.fn().mockResolvedValue({ id: 'assign-1' }),
      findUnique: jest.fn(),
      groupBy: jest.fn(),
    },
  };
}

function input(customerId = 'cust-1') {
  return {
    experimentId: 'exp-1',
    businessId: 'biz-1',
    customerId,
    segment: CustomerSegment.AT_RISK,
    frequency: computeVisitFrequency(
      [d('2026-07-01'), d('2026-07-08'), d('2026-07-15')],
      NOW,
    ),
  };
}

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('RetentionAssignmentService.assign', () => {
  it('recruits a customer and snapshots the behaviour that justified it', async () => {
    const prisma = makePrisma();
    const service = new RetentionAssignmentService(prisma as never);

    const result = await service.assign(input());

    expect(result.status).toBe('assigned');
    const data = (
      prisma.retentionAssignment.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      }
    ).data;
    expect(data.segmentAtAssignment).toBe(CustomerSegment.AT_RISK);
    expect(data.visitCountAtAssignment).toBe(3);
    expect(data.typicalIntervalDays).toBe(7);
    expect(data.daysSinceLastVisit).toBe(47);
  });

  it('is idempotent: a concurrent duplicate returns the existing assignment', async () => {
    const prisma = makePrisma();
    prisma.retentionAssignment.create.mockRejectedValue(p2002());
    prisma.retentionAssignment.findUnique.mockResolvedValue({ id: 'existing' });
    const service = new RetentionAssignmentService(prisma as never);

    const result = await service.assign(input());

    expect(result).toEqual({
      status: 'already_assigned',
      assignmentId: 'existing',
    });
  });

  it('assigns the same customer to the same variant on a re-run', async () => {
    const prisma = makePrisma();
    const service = new RetentionAssignmentService(prisma as never);

    await service.assign(input('cust-42'));
    await service.assign(input('cust-42'));

    const first = (
      prisma.retentionAssignment.create.mock.calls[0][0] as {
        data: { variantId: string };
      }
    ).data.variantId;
    const second = (
      prisma.retentionAssignment.create.mock.calls[1][0] as {
        data: { variantId: string };
      }
    ).data.variantId;
    expect(first).toBe(second);
  });

  it('refuses to recruit into an experiment with no CONTROL', async () => {
    const prisma = makePrisma([
      {
        id: 'v-reminder',
        strategyType: RetentionStrategyType.REMINDER,
        allocationPercent: 100,
        active: true,
      },
    ]);
    const service = new RetentionAssignmentService(prisma as never);

    const result = await service.assign(input());

    expect(result).toEqual({
      status: 'skipped',
      reason: 'INVALID_ALLOCATION',
    });
    expect(prisma.retentionAssignment.create).not.toHaveBeenCalled();
  });

  it('refuses to recruit when the percentages do not sum to 100', async () => {
    const prisma = makePrisma([
      {
        id: 'v-control',
        strategyType: RetentionStrategyType.CONTROL,
        allocationPercent: 15,
        active: true,
      },
      {
        id: 'v-reminder',
        strategyType: RetentionStrategyType.REMINDER,
        allocationPercent: 30,
        active: true,
      },
    ]);
    const service = new RetentionAssignmentService(prisma as never);

    const result = await service.assign(input());
    expect(result.status).toBe('skipped');
  });

  it('rethrows unexpected database errors instead of swallowing them', async () => {
    const prisma = makePrisma();
    prisma.retentionAssignment.create.mockRejectedValue(new Error('db down'));
    const service = new RetentionAssignmentService(prisma as never);

    await expect(service.assign(input())).rejects.toThrow('db down');
  });

  it('control assignments are real participants — assigning is not sending', async () => {
    // Find a customer the hash routes to control, and confirm the row is
    // created just like any other: CONTROL must be measurable.
    const prisma = makePrisma();
    const service = new RetentionAssignmentService(prisma as never);

    let controlFound = false;
    for (let i = 0; i < 200 && !controlFound; i++) {
      prisma.retentionAssignment.create.mockClear();
      const result = await service.assign(input(`cust-${i}`));
      if (
        result.status === 'assigned' &&
        result.strategyType === RetentionStrategyType.CONTROL
      ) {
        controlFound = true;
        expect(prisma.retentionAssignment.create).toHaveBeenCalledTimes(1);
      }
    }
    expect(controlFound).toBe(true);
  });
});
