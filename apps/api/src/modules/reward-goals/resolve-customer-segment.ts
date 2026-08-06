import { PrismaService } from '../../prisma/prisma.service';
import { computeVisitFrequency } from '../retention-v2/visit-frequency';
import { segmentCustomer } from '../retention-v2/segmentation';

/**
 * Shared by `RewardGoalOrchestratorService` (per-visit) and
 * `RewardGoalSweepService` (periodic reconciliation/dry-run) so segmentation
 * is computed exactly once, the same way, everywhere Reward Goals needs it —
 * reusing Retention V2's own pure functions, never a second segmentation
 * model (Fase E §24).
 */
export async function resolveCustomerSegment(
  prisma: PrismaService,
  businessId: string,
  customerId: string,
  now: Date,
) {
  const [visits, lastIntervention] = await Promise.all([
    prisma.visit.findMany({
      where: { businessId, customerId },
      select: { occurredAt: true },
    }),
    prisma.retentionAssignment.findFirst({
      where: { customerId, sentAt: { not: null } },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true },
    }),
  ]);

  const frequency = computeVisitFrequency(
    visits.map((v) => v.occurredAt),
    now,
  );
  const { segment } = segmentCustomer({
    frequency,
    lastInterventionAt: lastIntervention?.sentAt ?? null,
    now,
  });

  return { segment, visitCount: frequency.visitCount };
}
