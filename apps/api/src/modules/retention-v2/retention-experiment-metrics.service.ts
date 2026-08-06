import { Injectable, NotFoundException } from '@nestjs/common';
import { RetentionStrategyType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EXPOSED_STATUSES } from './exposure';
import {
  computeVariantStats,
  determineWinner,
  estimatedIncrementalReturns,
  twoProportionZTest,
  upliftPercentagePoints,
  type SignificanceRead,
  type VariantCounts,
  type VariantStats,
  type WinnerConclusion,
} from './experiment-metrics';
import { computeEconomics, type EconomicsResult } from './experiment-economics';

export interface VariantResult {
  variantId: string;
  variantName: string;
  strategyType: RetentionStrategyType;
  stats: VariantStats;
  /** Null for CONTROL itself, and for any variant while data is insufficient. */
  upliftPercentagePoints: number | null;
  estimatedIncrementalReturns: number | null;
  economics: EconomicsResult;
  significanceVsControl: SignificanceRead | null;
}

export interface ExperimentResults {
  experimentId: string;
  experimentName: string;
  attributionWindowDays: number;
  controlVariantId: string | null;
  variants: VariantResult[];
  winner: WinnerConclusion;
}

/**
 * Turns raw `RetentionAssignment`/`RetentionOutcome` rows into the numbers
 * the dashboard and API show (Fase D §10-23). Computed on read, from
 * aggregate queries — nothing is materialized, which is the right call at
 * MVP volumes (Fase D §41) and keeps this service the single place the
 * per-variant arithmetic can drift from the pure modules it calls into.
 */
@Injectable()
export class RetentionExperimentMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async forExperiment(
    businessId: string,
    experimentId: string,
  ): Promise<ExperimentResults> {
    const experiment = await this.prisma.retentionExperiment.findFirst({
      where: { businessId, id: experimentId },
      select: {
        id: true,
        name: true,
        attributionWindowDays: true,
        variants: {
          select: {
            id: true,
            name: true,
            strategyType: true,
            incentiveDefinition: {
              select: {
                estimatedCost: true,
                percentageValue: true,
                fixedValue: true,
              },
            },
          },
        },
      },
    });
    if (!experiment) throw new NotFoundException('Experiment not found');

    const settings = await this.prisma.retentionSettings.findUnique({
      where: { businessId },
      select: {
        minimumSampleSizeForRecommendations: true,
        averageTicketAmount: true,
        estimatedMarginPercent: true,
      },
    });
    const minimumSampleSize =
      settings?.minimumSampleSizeForRecommendations ?? 30;
    const averageTicketAmount =
      settings?.averageTicketAmount != null
        ? Number(settings.averageTicketAmount)
        : null;
    const estimatedMarginPercent = settings?.estimatedMarginPercent ?? null;

    const statsByVariant = new Map<string, VariantStats>();
    const variantMeta = new Map<string, (typeof experiment.variants)[number]>();
    for (const variant of experiment.variants) {
      variantMeta.set(variant.id, variant);
      const counts = await this.countsFor(variant.id);
      statsByVariant.set(
        variant.id,
        computeVariantStats(counts, minimumSampleSize),
      );
    }

    const controlVariant = experiment.variants.find(
      (v) => v.strategyType === RetentionStrategyType.CONTROL,
    );
    const controlStats = controlVariant
      ? statsByVariant.get(controlVariant.id)
      : undefined;

    const results: VariantResult[] = experiment.variants.map((variant) => {
      const stats = statsByVariant.get(variant.id)!;
      const isControl = variant.strategyType === RetentionStrategyType.CONTROL;

      const uplift =
        !isControl &&
        controlStats &&
        stats.evidenceState !== 'INSUFFICIENT_DATA' &&
        controlStats.evidenceState !== 'INSUFFICIENT_DATA'
          ? upliftPercentagePoints(stats.returnRate, controlStats.returnRate)
          : null;
      const incrementalReturns =
        uplift === null
          ? null
          : estimatedIncrementalReturns(uplift, stats.exposedCount);

      const economics = computeEconomics({
        returnedCount: stats.returnedCount,
        confirmedReturnedCount: stats.confirmedReturnedCount,
        estimatedIncrementalReturns: incrementalReturns,
        averageTicketAmount,
        estimatedMarginPercent,
        incentiveDefinition: variant.incentiveDefinition
          ? {
              estimatedCost:
                variant.incentiveDefinition.estimatedCost != null
                  ? Number(variant.incentiveDefinition.estimatedCost)
                  : null,
              percentageValue: variant.incentiveDefinition.percentageValue,
              fixedValue:
                variant.incentiveDefinition.fixedValue != null
                  ? Number(variant.incentiveDefinition.fixedValue)
                  : null,
            }
          : null,
      });

      const significanceVsControl =
        !isControl && controlStats
          ? twoProportionZTest(
              controlStats.returnedCount,
              controlStats.exposedCount,
              stats.returnedCount,
              stats.exposedCount,
            )
          : null;

      return {
        variantId: variant.id,
        variantName: variant.name,
        strategyType: variant.strategyType,
        stats,
        upliftPercentagePoints: uplift,
        estimatedIncrementalReturns: incrementalReturns,
        economics,
        significanceVsControl,
      };
    });

    const winner = determineWinner(
      controlStats,
      results
        .filter((r) => r.strategyType !== RetentionStrategyType.CONTROL)
        .map((r) => ({
          stats: r.stats,
          netIncrementalValue: r.economics.estimatedNetIncrementalValue,
        })),
    );

    return {
      experimentId: experiment.id,
      experimentName: experiment.name,
      attributionWindowDays: experiment.attributionWindowDays,
      controlVariantId: controlVariant?.id ?? null,
      variants: results,
      winner,
    };
  }

  private async countsFor(variantId: string): Promise<VariantCounts> {
    const [assignedCount, exposedCount, outcomes] = await Promise.all([
      this.prisma.retentionAssignment.count({ where: { variantId } }),
      this.prisma.retentionAssignment.count({
        where: { variantId, status: { in: EXPOSED_STATUSES } },
      }),
      this.prisma.retentionOutcome.findMany({
        where: { variantId },
        select: {
          returned: true,
          confirmedByRedemption: true,
          daysToReturn: true,
        },
      }),
    ]);

    const returned = outcomes.filter((o) => o.returned);
    const confirmed = returned.filter((o) => o.confirmedByRedemption);

    return {
      variantId,
      assignedCount,
      exposedCount,
      returnedCount: returned.length,
      confirmedReturnedCount: confirmed.length,
      daysToReturnSamples: returned
        .map((o) => o.daysToReturn)
        .filter((d): d is number => d !== null),
    };
  }
}
