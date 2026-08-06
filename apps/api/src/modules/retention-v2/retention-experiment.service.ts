import { Injectable } from '@nestjs/common';
import {
  CustomerSegment,
  RetentionExperimentStatus,
  RetentionObjective,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { validateAllocation } from './allocation';

/**
 * Runtime-only view of experiments. No CRUD yet — experiments are seeded by
 * hand for now; the workers just need to find a valid, running one.
 */

/** Which objective a segment is recruited for. */
const SEGMENT_OBJECTIVE: Partial<Record<CustomerSegment, RetentionObjective>> =
  {
    [CustomerSegment.NEW]: RetentionObjective.SECOND_VISIT,
    [CustomerSegment.AT_RISK]: RetentionObjective.AT_RISK_RECOVERY,
    [CustomerSegment.INACTIVE]: RetentionObjective.INACTIVE_RECOVERY,
    // REPEAT, FREQUENT and RECOVERED map to nothing on purpose: a healthy or
    // just-won-back customer is never chased automatically.
  };

export function objectiveForSegment(
  segment: CustomerSegment,
): RetentionObjective | null {
  return SEGMENT_OBJECTIVE[segment] ?? null;
}

@Injectable()
export class RetentionExperimentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Running experiments for a business, keeping only those whose variant set is
   * still valid. An experiment with a broken allocation (no CONTROL, shares not
   * summing to 100) is silently unusable rather than producing an unreadable
   * result.
   */
  async findUsableRunning(businessId: string) {
    const experiments = await this.prisma.retentionExperiment.findMany({
      where: { businessId, status: RetentionExperimentStatus.RUNNING },
      include: {
        variants: {
          select: {
            id: true,
            strategyType: true,
            allocationPercent: true,
            active: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return experiments.filter((e) => validateAllocation(e.variants).valid);
  }

  /**
   * Picks the experiment that should recruit this customer.
   *
   * An experiment scoped to a segment wins over an open one, so a business can
   * run a targeted campaign alongside a general fallback. Returns null when
   * nothing applies — the customer is simply left alone.
   */
  resolveApplicable<
    T extends {
      objective: RetentionObjective;
      segment: CustomerSegment | null;
    },
  >(experiments: T[], segment: CustomerSegment): T | null {
    const objective = objectiveForSegment(segment);
    if (!objective) return null;

    const matching = experiments.filter((e) => e.objective === objective);
    return (
      matching.find((e) => e.segment === segment) ??
      matching.find((e) => e.segment === null) ??
      null
    );
  }

  /** Whether an experiment is still RUNNING — re-checked right before sending. */
  async isRunning(experimentId: string): Promise<boolean> {
    const experiment = await this.prisma.retentionExperiment.findUnique({
      where: { id: experimentId },
      select: { status: true },
    });
    return experiment?.status === RetentionExperimentStatus.RUNNING;
  }
}
