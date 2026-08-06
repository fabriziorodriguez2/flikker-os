import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { localDayKey } from '../../common/utils/timezone.util';
import { DECISION_CODES } from './retention-decision-log.service';

/**
 * The Fase C.5 §9 "modo observación" panel: today's dry-run decisions in the
 * owner's local calendar day, translated into the handful of counters the
 * panel shows. No new instrumentation — this reads the exact same
 * RetentionDecisionLog rows the real engine writes, which is what makes the
 * dry-run report trustworthy once the owner switches sending on: the same
 * query would explain a live day too.
 */
export interface DryRunReport {
  date: string;
  analyzed: number;
  detectedAtRisk: number;
  wouldControl: number;
  wouldSend: number;
  wouldOfferIncentive: number;
  /** Fase E §32 — reward goals the engine would have created today, by reason. */
  wouldCreateRewardGoals: number;
  rewardGoalsByReason: Record<string, number>;
}

@Injectable()
export class RetentionDryRunReportService {
  constructor(private readonly prisma: PrismaService) {}

  async today(
    businessId: string,
    now: Date = new Date(),
  ): Promise<DryRunReport> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    if (!business) throw new NotFoundException('Business not found');

    const dayKey = localDayKey(now, business.timezone);
    // A 2-day DB window is a superset of any local calendar day for any real
    // timezone offset; refined to the exact local day in memory below — the
    // same pattern RetentionBudgetService uses for its monthly window.
    const windowStart = new Date(now.getTime() - 2 * 86_400_000);

    const logs = await this.prisma.retentionDecisionLog.findMany({
      where: { businessId, createdAt: { gte: windowStart } },
      select: {
        decisionCode: true,
        customerId: true,
        createdAt: true,
        metadata: true,
      },
    });
    const today = logs.filter(
      (log) => localDayKey(log.createdAt, business.timezone) === dayKey,
    );

    const countOf = (code: string) =>
      today.filter((l) => l.decisionCode === code).length;

    // "Analyzed" is every customer this run reached a segmentation decision
    // for — recruited, controlled, sent, offered, or explicitly skipped —
    // deduplicated, since one customer can log more than one row per day.
    const analyzed = new Set(
      today.filter((l) => l.customerId).map((l) => l.customerId),
    ).size;

    const detectedAtRisk =
      countOf(DECISION_CODES.DRY_RUN_WOULD_CONTROL) +
      countOf(DECISION_CODES.DRY_RUN_WOULD_SEND) +
      countOf(DECISION_CODES.DRY_RUN_WOULD_OFFER_INCENTIVE) +
      countOf(DECISION_CODES.ASSIGNED);

    const rewardGoalLogs = today.filter(
      (l) => l.decisionCode === DECISION_CODES.DRY_RUN_WOULD_CREATE_REWARD_GOAL,
    );
    const rewardGoalsByReason: Record<string, number> = {};
    for (const log of rewardGoalLogs) {
      const reasonCode =
        log.metadata &&
        typeof log.metadata === 'object' &&
        'reasonCode' in log.metadata
          ? String((log.metadata as Record<string, unknown>).reasonCode)
          : 'UNKNOWN';
      rewardGoalsByReason[reasonCode] =
        (rewardGoalsByReason[reasonCode] ?? 0) + 1;
    }

    return {
      date: dayKey,
      analyzed,
      detectedAtRisk,
      wouldControl: countOf(DECISION_CODES.DRY_RUN_WOULD_CONTROL),
      wouldSend: countOf(DECISION_CODES.DRY_RUN_WOULD_SEND),
      wouldOfferIncentive: countOf(
        DECISION_CODES.DRY_RUN_WOULD_OFFER_INCENTIVE,
      ),
      wouldCreateRewardGoals: rewardGoalLogs.length,
      rewardGoalsByReason,
    };
  }
}
