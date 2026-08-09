/**
 * Reproducible LOCAL end-to-end run of the Fase F §50 insight case — the AI
 * explanation layer never gets to change what the deterministic experiment
 * metrics/winner engine (Fase D) already decided.
 *
 * Scenario, exactly as specified:
 *   CONTROL 10% return · UPGRADE 22%ish return · 10% OFF 23%ish return.
 *   Economía: UPGRADE deja mejor valor económico neto (menor costo por
 *   redención) aunque 10% OFF haya conseguido apenas más retornos.
 *   `RetentionExperimentMetricsService.forExperiment()` (Fase D, no tocado
 *   en esta fase) determina winner = BEST_INCREMENTAL_VALUE(UPGRADE).
 *   La IA escribe una explicación — se verifica que:
 *     1. Una explicación consistente ("el upgrade rinde mejor") se acepta.
 *     2. Una explicación que contradice el motor ("recomiendo 10% OFF") se
 *        rechaza — Y el winner recalculado sigue siendo exactamente el mismo,
 *        probando que la IA nunca pudo tocarlo.
 *
 * Usage (from apps/api, against the LOCAL database):
 *   npx ts-node -r tsconfig-paths/register scripts/ai-layer-insight-e2e-local.ts
 */
// Must be set before AppModule/AiConfigService are ever constructed — env is
// read once, at DI-instantiation time (same reason ai-layer-message-e2e-local.ts
// sets these at the very top of the file, before any other import runs).
process.env.AI_ENABLED = 'true';
process.env.OPENAI_API_KEY = 'sk-test-local-only';

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import {
  ExperienceVersion,
  RetentionAssignmentStatus,
  RetentionObjective,
  RetentionStrategyType,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RetentionExperimentMetricsService } from '../src/modules/retention-v2/retention-experiment-metrics.service';
import { AiRecommendationExplanationService } from '../src/modules/ai/recommendation-explanation.service';

const SUFFIX = Date.now();

function assert(condition: boolean, label: string) {
  console.log(`  ${condition ? '✓' : '✗'} ${label}`);
  if (!condition) throw new Error(`FAILED: ${label}`);
}

/** Seeds N assignments + their outcomes for one variant, real Postgres rows. */
async function seedVariantOutcomes(
  prisma: PrismaService,
  input: {
    businessId: string;
    experimentId: string;
    variantId: string;
    status: RetentionAssignmentStatus;
    exposedAt: Date;
    total: number;
    returned: number;
  },
) {
  for (let i = 0; i < input.total; i++) {
    const customer = await prisma.customer.create({
      data: {
        businessId: input.businessId,
        name: `E2E ${input.variantId} ${i}`,
        phoneE164: `+59896${SUFFIX.toString().slice(-5)}${String(i).padStart(2, '0')}`,
        origin: 'qr',
      },
      select: { id: true },
    });
    const assignment = await prisma.retentionAssignment.create({
      data: {
        businessId: input.businessId,
        customerId: customer.id,
        experimentId: input.experimentId,
        variantId: input.variantId,
        status: input.status,
        segmentAtAssignment: 'AT_RISK',
        visitCountAtAssignment: 1,
        daysSinceLastVisit: 20,
        exposedAt: input.exposedAt,
        sentAt:
          input.status === RetentionAssignmentStatus.SENT
            ? input.exposedAt
            : null,
      },
      select: { id: true },
    });
    const returned = i < input.returned;
    await prisma.retentionOutcome.create({
      data: {
        businessId: input.businessId,
        assignmentId: assignment.id,
        experimentId: input.experimentId,
        variantId: input.variantId,
        customerId: customer.id,
        returned,
        confirmedByRedemption:
          returned && input.status === RetentionAssignmentStatus.SENT,
        returnedAt: returned
          ? new Date(input.exposedAt.getTime() + 5 * 86_400_000)
          : null,
        daysToReturn: returned ? 5 : null,
        observedWithinWindow: true,
      },
    });
  }
}

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error('Refusing to run: DATABASE_URL is not a local database');
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const prisma = app.get(PrismaService);
  const metrics = app.get(RetentionExperimentMetricsService);
  const explanationService = app.get(AiRecommendationExplanationService);

  let businessId = '';

  try {
    console.log('\n=== SEED: experimento real con 3 variantes ===');
    const business = await prisma.business.create({
      data: {
        name: 'Café Trinidad',
        slug: `ai-insight-e2e-${SUFFIX}`,
        country: 'UY',
        timezone: 'America/Montevideo',
        currency: 'UYU',
        isActive: true,
        experienceVersion: ExperienceVersion.CHECKIN_V2,
        retentionEngineV2Enabled: true,
      },
      select: { id: true },
    });
    businessId = business.id;

    await prisma.retentionSettings.create({
      data: {
        businessId,
        averageTicketAmount: 1000,
        estimatedMarginPercent: 50,
        minimumSampleSizeForRecommendations: 5,
        aiInsightsEnabled: true, // Fase F §5
      },
    });

    const upgrade = await prisma.retentionIncentiveDefinition.create({
      data: {
        businessId,
        name: 'Upgrade',
        type: 'gift',
        active: true,
        estimatedCost: 80, // known, fixed — cheap per redemption
      },
      select: { id: true },
    });
    const discount = await prisma.retentionIncentiveDefinition.create({
      data: {
        businessId,
        name: '10% OFF',
        type: 'discount',
        active: true,
        percentageValue: 15, // estimated from averageTicketAmount — pricier per redemption
      },
      select: { id: true },
    });

    const experiment = await prisma.retentionExperiment.create({
      data: {
        businessId,
        name: 'Upgrade vs 10% OFF',
        objective: RetentionObjective.AT_RISK_RECOVERY,
      },
      select: { id: true },
    });
    const control = await prisma.retentionVariant.create({
      data: {
        businessId,
        experimentId: experiment.id,
        name: 'Control',
        strategyType: RetentionStrategyType.CONTROL,
        allocationPercent: 34,
      },
      select: { id: true },
    });
    const upgradeVariant = await prisma.retentionVariant.create({
      data: {
        businessId,
        experimentId: experiment.id,
        name: 'Upgrade',
        strategyType: RetentionStrategyType.SOFT_BENEFIT,
        allocationPercent: 33,
        incentiveDefinitionId: upgrade.id,
      },
      select: { id: true },
    });
    const discountVariant = await prisma.retentionVariant.create({
      data: {
        businessId,
        experimentId: experiment.id,
        name: '10% OFF',
        strategyType: RetentionStrategyType.STRONG_BENEFIT,
        allocationPercent: 33,
        incentiveDefinitionId: discount.id,
      },
      select: { id: true },
    });

    const exposedAt = new Date(Date.now() - 20 * 86_400_000);
    await seedVariantOutcomes(prisma, {
      businessId,
      experimentId: experiment.id,
      variantId: control.id,
      status: RetentionAssignmentStatus.OBSERVING,
      exposedAt,
      total: 30,
      returned: 3, // 10%
    });
    await seedVariantOutcomes(prisma, {
      businessId,
      experimentId: experiment.id,
      variantId: upgradeVariant.id,
      status: RetentionAssignmentStatus.SENT,
      exposedAt,
      total: 30,
      returned: 7, // ~23%
    });
    await seedVariantOutcomes(prisma, {
      businessId,
      experimentId: experiment.id,
      variantId: discountVariant.id,
      status: RetentionAssignmentStatus.SENT,
      exposedAt,
      total: 30,
      returned: 8, // ~27% — MORE returns than Upgrade, but costs more per redemption
    });
    console.log('  30 asignaciones + outcomes reales por variante');

    console.log('\n=== El motor determinístico (Fase D) calcula el winner ===');
    const results = await metrics.forExperiment(businessId, experiment.id);
    const upgradeResult = results.variants.find(
      (v) => v.variantId === upgradeVariant.id,
    )!;
    const discountResult = results.variants.find(
      (v) => v.variantId === discountVariant.id,
    )!;
    console.log(
      `  UPGRADE: returnRate=${(upgradeResult.stats.returnRate * 100).toFixed(1)}% netValue=${upgradeResult.economics.estimatedNetIncrementalValue}`,
    );
    console.log(
      `  10% OFF: returnRate=${(discountResult.stats.returnRate * 100).toFixed(1)}% netValue=${discountResult.economics.estimatedNetIncrementalValue}`,
    );
    assert(
      discountResult.stats.returnRate > upgradeResult.stats.returnRate,
      '10% OFF consiguió más retornos que Upgrade',
    );
    assert(
      (upgradeResult.economics.estimatedNetIncrementalValue ?? 0) >
        (discountResult.economics.estimatedNetIncrementalValue ?? 0),
      'pero Upgrade deja mejor valor económico neto',
    );
    assert(
      results.winner.kind === 'BEST_INCREMENTAL_VALUE' &&
        results.winner.variantId === upgradeVariant.id,
      'winner = BEST_INCREMENTAL_VALUE(Upgrade)',
    );

    console.log('\n=== Explicación AI consistente → aceptada ===');
    // No real OpenAI call: exercised via the same provider abstraction the
    // send-message E2E uses, with the SDK-free fetch stub swapped in.
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      headline: 'El upgrade está rindiendo mejor',
                      explanation:
                        'El upgrade consigue casi el mismo retorno que el descuento, pero con mejor valor económico estimado.',
                    }),
                  },
                },
              ],
              usage: { prompt_tokens: 60, completion_tokens: 30 },
            }),
            { status: 200 },
          ),
        )) as unknown as typeof fetch;

      const consistent = await explanationService.explain(
        businessId,
        experiment.id,
      );
      assert(consistent !== null, 'la explicación consistente se aceptó');
      assert(
        Boolean(consistent?.headline) && Boolean(consistent?.explanation),
        'trae headline + explanation',
      );

      console.log(
        '\n=== Explicación AI que CONTRADICE al motor → rechazada, winner intacto ===',
      );
      globalThis.fetch = (() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      headline: 'El descuento es la mejor opción',
                      explanation:
                        'Recomendamos usar 10% OFF porque convierte más clientes.',
                    }),
                  },
                },
              ],
            }),
            { status: 200 },
          ),
        )) as unknown as typeof fetch;

      const contradicting = await explanationService.explain(
        businessId,
        experiment.id,
      );
      assert(
        contradicting === null,
        'la explicación que contradice al motor fue rechazada',
      );

      const resultsAfter = await metrics.forExperiment(
        businessId,
        experiment.id,
      );
      assert(
        resultsAfter.winner.kind === 'BEST_INCREMENTAL_VALUE' &&
          resultsAfter.winner.variantId === upgradeVariant.id,
        'el winner recalculado sigue siendo Upgrade — la IA nunca lo tocó',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    console.log('\n=== ALL CHECKS PASSED ===');
  } finally {
    console.log('\n=== CLEANUP ===');
    if (businessId) {
      await prisma.retentionOutcome.deleteMany({ where: { businessId } });
      await prisma.aiUsageEvent.deleteMany({ where: { businessId } });
      await prisma.retentionAssignment.deleteMany({ where: { businessId } });
      await prisma.retentionVariant.deleteMany({ where: { businessId } });
      await prisma.retentionExperiment.deleteMany({ where: { businessId } });
      await prisma.retentionIncentiveDefinition.deleteMany({
        where: { businessId },
      });
      await prisma.retentionSettings.deleteMany({ where: { businessId } });
      await prisma.customer.deleteMany({ where: { businessId } });
      await prisma.business.delete({ where: { id: businessId } });
      console.log('  removed every seeded row');
    }
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(
      `\nERROR: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
