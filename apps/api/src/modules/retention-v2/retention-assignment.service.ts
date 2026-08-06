import { Injectable, Logger } from '@nestjs/common';
import { CustomerSegment, Prisma, RetentionStrategyType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { pickVariant, validateAllocation } from './allocation';
import type { VisitFrequency } from './visit-frequency';

export interface AssignmentInput {
  experimentId: string;
  businessId: string;
  customerId: string;
  segment: CustomerSegment;
  frequency: VisitFrequency;
}

export type AssignmentOutcome =
  | {
      status: 'assigned';
      assignmentId: string;
      strategyType: RetentionStrategyType;
    }
  | { status: 'already_assigned'; assignmentId: string }
  | { status: 'skipped'; reason: 'INVALID_ALLOCATION' | 'NO_VARIANT' };

@Injectable()
export class RetentionAssignmentService {
  private readonly logger = new Logger(RetentionAssignmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recruits a customer into an experiment, exactly once.
   *
   * Idempotency has two layers: the deterministic bucket always resolves to the
   * same variant, and unique(experimentId, customerId) makes a concurrent
   * second insert fail cleanly instead of creating a duplicate. A worker that
   * runs twice therefore produces the same single assignment.
   *
   * Assigning is NOT sending. A CONTROL assignment is a real participant that
   * deliberately receives nothing — that is what makes uplift measurable.
   */
  async assign(input: AssignmentInput): Promise<AssignmentOutcome> {
    const variants = await this.prisma.retentionVariant.findMany({
      where: { experimentId: input.experimentId },
      select: {
        id: true,
        strategyType: true,
        allocationPercent: true,
        active: true,
      },
    });

    const validation = validateAllocation(variants);
    if (!validation.valid) {
      this.logger.warn(
        `Experiment ${input.experimentId} has an invalid allocation: ${validation.errors.join('; ')}`,
      );
      return { status: 'skipped', reason: 'INVALID_ALLOCATION' };
    }

    const variant = pickVariant(input.experimentId, input.customerId, variants);
    if (!variant) return { status: 'skipped', reason: 'NO_VARIANT' };

    try {
      const created = await this.prisma.retentionAssignment.create({
        data: {
          experimentId: input.experimentId,
          variantId: variant.id,
          businessId: input.businessId,
          customerId: input.customerId,
          // Snapshotted: the live values keep moving, and a report of what the
          // engine decided must stay reproducible.
          segmentAtAssignment: input.segment,
          visitCountAtAssignment: input.frequency.visitCount,
          daysSinceLastVisit: input.frequency.daysSinceLastVisit ?? 0,
          typicalIntervalDays: input.frequency.typicalIntervalDays,
        },
        select: { id: true },
      });

      return {
        status: 'assigned',
        assignmentId: created.id,
        strategyType: variant.strategyType,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Another run won the race — return its assignment rather than failing.
        const existing = await this.prisma.retentionAssignment.findUnique({
          where: {
            experimentId_customerId: {
              experimentId: input.experimentId,
              customerId: input.customerId,
            },
          },
          select: { id: true },
        });
        if (existing) {
          return { status: 'already_assigned', assignmentId: existing.id };
        }
      }
      throw error;
    }
  }

  /** Participants per variant — the denominator for return rate. */
  countByVariant(experimentId: string) {
    return this.prisma.retentionAssignment.groupBy({
      by: ['variantId'],
      where: { experimentId },
      _count: { _all: true },
    });
  }
}
