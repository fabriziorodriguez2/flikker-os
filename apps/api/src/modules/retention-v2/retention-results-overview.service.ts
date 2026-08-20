import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  RetentionExperimentMetricsService,
  type ExperimentResults,
} from './retention-experiment-metrics.service';

/** The Fase D §24 dashboard summary: one card's worth of numbers per experiment. */
export interface ExperimentOverview {
  experimentId: string;
  experimentName: string;
  status: string;
  exposedCount: number;
  returnedCount: number;
  confirmedReturnedCount: number;
  controlReturnRate: number | null;
  bestVariant: { variantId: string; variantName: string } | null;
  upliftBestVariant: number | null;
  estimatedIncrementalReturns: number | null;
  incrementalRevenueEstimate: number | null;
  winner: ExperimentResults['winner'];
}

/**
 * Fase D §40 `GET /retention-v2/results/overview` — every experiment for the
 * business, reduced to the handful of numbers the dashboard's "RESULTADOS"
 * section shows before drilling into one experiment's full variant table.
 */
@Injectable()
export class RetentionResultsOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: RetentionExperimentMetricsService,
  ) {}

  async forBusiness(businessId: string): Promise<ExperimentOverview[]> {
    const experiments = await this.prisma.retentionExperiment.findMany({
      where: { businessId },
      select: { id: true, status: true },
      orderBy: { createdAt: 'desc' },
    });

    // PERF: cada experimento es independiente — antes se pedía uno por vez
    // (`for` + `await`), serializando N round-trips a la base. `Promise.all`
    // mantiene el mismo resultado exacto (mismo orden que `experiments`,
    // mismos datos por experimento) pidiéndolos todos en paralelo.
    const results = await Promise.all(
      experiments.map((experiment) =>
        this.metrics.forExperiment(businessId, experiment.id),
      ),
    );
    return experiments.map((experiment, i) =>
      this.summarize(experiment.status, results[i]),
    );
  }

  private summarize(
    status: string,
    results: ExperimentResults,
  ): ExperimentOverview {
    const control = results.variants.find(
      (v) => v.variantId === results.controlVariantId,
    );
    const winner = results.winner;
    const winnerVariant =
      winner.kind === 'NO_CONCLUSION'
        ? null
        : (results.variants.find((v) => v.variantId === winner.variantId) ??
          null);

    return {
      experimentId: results.experimentId,
      experimentName: results.experimentName,
      status,
      exposedCount: results.variants.reduce(
        (sum, v) => sum + v.stats.exposedCount,
        0,
      ),
      returnedCount: results.variants.reduce(
        (sum, v) => sum + v.stats.returnedCount,
        0,
      ),
      confirmedReturnedCount: results.variants.reduce(
        (sum, v) => sum + v.stats.confirmedReturnedCount,
        0,
      ),
      controlReturnRate: control?.stats.returnRate ?? null,
      bestVariant: winnerVariant
        ? {
            variantId: winnerVariant.variantId,
            variantName: winnerVariant.variantName,
          }
        : null,
      upliftBestVariant: winnerVariant?.upliftPercentagePoints ?? null,
      estimatedIncrementalReturns:
        winnerVariant?.estimatedIncrementalReturns ?? null,
      incrementalRevenueEstimate:
        winnerVariant?.economics.incrementalRevenueEstimate ?? null,
      winner: results.winner,
    };
  }
}
