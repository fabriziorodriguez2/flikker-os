/**
 * Reproducible LOCAL end-to-end run of the Fase G §46 case — Safe
 * Auto-Optimization moving FUTURE allocation toward the economically best
 * variant, without ever touching an existing assignment.
 *
 * Scenario, exactly as specified:
 *   Business CHECKIN_V2, Retention V2 ON, optimizationMode=AUTOMATIC.
 *   Allocation: CONTROL 15% · REMINDER 30% · PROGRESS_REMINDER 30% · 10% OFF 25%.
 *   Simulated sample (100 exposed per variant): CONTROL 10% · REMINDER 13% ·
 *   PROGRESS 24% · 10% OFF 25% return rate.
 *   Economía: PROGRESS_REMINDER carries NO incentive (Fase E/F — it never
 *   emits a benefit of its own), so its net value beats 10% OFF's despite a
 *   slightly LOWER raw return rate — winnerReturn ≠ winnerEconomic, and the
 *   optimizer must follow the economic one (Fase G §10/§13/§35).
 *
 * Demonstrates, in order:
 *   1. datos insuficientes → no cambia nada (checked against a fresh,
 *      unseeded experiment before seeding the real one);
 *   2. winner claro → aumenta gradualmente (respecting maxAllocationChange);
 *   3. control nunca desaparece;
 *   4. exploración nunca desaparece;
 *   5. IA nunca participa (this whole file never touches `src/modules/ai`);
 *   6. allocations anteriores quedan auditables (RetentionOptimizationRun);
 *   7. rollback funciona, creando una fila nueva, no borrando historial;
 *   8. assignments existentes nunca cambian;
 *   9. solo las asignaciones nuevas (recruited AFTER the apply) usan la
 *      nueva distribución — probado con reclutamiento real, no simulado.
 *
 * Usage (from apps/api, against the LOCAL database):
 *   npx ts-node -r tsconfig-paths/register scripts/retention-optimization-e2e-local.ts
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import {
  ExperienceVersion,
  OptimizationMode,
  RetentionAssignmentStatus,
  RetentionObjective,
  RetentionStrategyType,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RetentionOptimizationService } from '../src/modules/retention-v2/retention-optimization.service';
import { RetentionExperimentMetricsService } from '../src/modules/retention-v2/retention-experiment-metrics.service';
import { RetentionExperimentsAdminService } from '../src/modules/retention-v2/retention-experiments-admin.service';
import { RetentionV2EvaluateService } from '../src/modules/retention-v2/retention-v2-evaluate.service';

const SUFFIX = Date.now();

function assert(condition: boolean, label: string) {
  console.log(`  ${condition ? '✓' : '✗'} ${label}`);
  if (!condition) throw new Error(`FAILED: ${label}`);
}

async function seedAtRiskCustomer(
  prisma: PrismaService,
  businessId: string,
  name: string,
  now: Date,
) {
  const customer = await prisma.customer.create({
    data: {
      businessId,
      name,
      phoneE164: `+59895${SUFFIX.toString().slice(-5)}${Math.random().toString().slice(2, 4)}`,
      origin: 'qr',
    },
    select: { id: true },
  });
  // Weekly cadence, then 20 days silent → AT_RISK (same pattern used across
  // every prior Retention V2 E2E script in this repo).
  for (const daysAgo of [34, 27, 20]) {
    const occurredAt = new Date(now.getTime() - daysAgo * 86_400_000);
    await prisma.visit.create({
      data: {
        businessId,
        customerId: customer.id,
        occurredAt,
        visitDayKey: occurredAt.toISOString().slice(0, 10),
        verificationType: 'manual',
      },
    });
  }
  return customer.id;
}

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
  const assignmentIds: string[] = [];
  for (let i = 0; i < input.total; i++) {
    const customer = await prisma.customer.create({
      data: {
        businessId: input.businessId,
        name: `Sample ${input.variantId} ${i}`,
        phoneE164: `+59894${SUFFIX.toString().slice(-5)}${String(i).padStart(3, '0')}`,
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
    assignmentIds.push(assignment.id);
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
  return assignmentIds;
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
  const optimization = app.get(RetentionOptimizationService);
  const metrics = app.get(RetentionExperimentMetricsService);
  const experimentsAdmin = app.get(RetentionExperimentsAdminService);
  const evaluateService = app.get(RetentionV2EvaluateService);

  let businessId = '';

  try {
    console.log(
      '\n=== SEED: business, AUTOMATIC mode, 4-variant experiment ===',
    );
    const business = await prisma.business.create({
      data: {
        name: 'Café Optimización',
        slug: `opt-e2e-${SUFFIX}`,
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
        minimumSampleSizeForRecommendations: 10,
        optimizationMode: OptimizationMode.AUTOMATIC,
        minimumControlPercent: 10,
        minimumExplorationPercent: 15,
        maxAllocationChangePerOptimization: 15,
        optimizationCooldownHours: 72,
        minimumMeaningfulUpliftPoints: 5,
      },
    });

    const discountIncentive = await prisma.retentionIncentiveDefinition.create({
      data: {
        businessId,
        name: '10% OFF',
        type: 'discount',
        active: true,
        automationEligible: true,
        percentageValue: 15,
      },
      select: { id: true },
    });

    const experiment = await prisma.retentionExperiment.create({
      data: {
        businessId,
        name: 'Reminder vs Progress vs Discount',
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
        allocationPercent: 15,
      },
      select: { id: true },
    });
    const reminder = await prisma.retentionVariant.create({
      data: {
        businessId,
        experimentId: experiment.id,
        name: 'Reminder',
        strategyType: RetentionStrategyType.REMINDER,
        allocationPercent: 30,
      },
      select: { id: true },
    });
    const progress = await prisma.retentionVariant.create({
      data: {
        businessId,
        experimentId: experiment.id,
        name: 'Progress',
        strategyType: RetentionStrategyType.PROGRESS_REMINDER,
        allocationPercent: 30,
      },
      select: { id: true },
    });
    const discount = await prisma.retentionVariant.create({
      data: {
        businessId,
        experimentId: experiment.id,
        name: '10% OFF',
        strategyType: RetentionStrategyType.STRONG_BENEFIT,
        allocationPercent: 25,
        incentiveDefinitionId: discountIncentive.id,
      },
      select: { id: true },
    });
    await experimentsAdmin.start(businessId, experiment.id);
    console.log('  15/30/30/25 — RUNNING, optimizationMode=AUTOMATIC');

    console.log('\n=== 1. Sin datos todavía → preview no propone nada ===');
    const emptyPreview = await optimization.preview(businessId, experiment.id);
    assert(
      emptyPreview.status === 'SKIPPED',
      'sin exposición todavía, no hay cambio que proponer',
    );

    console.log(
      '\n=== SEED: 100 asignaciones+outcomes reales por variante ===',
    );
    const now = new Date();
    const exposedAt = new Date(now.getTime() - 15 * 86_400_000);
    const controlAssignmentIds = await seedVariantOutcomes(prisma, {
      businessId,
      experimentId: experiment.id,
      variantId: control.id,
      status: RetentionAssignmentStatus.OBSERVING,
      exposedAt,
      total: 100,
      returned: 10, // 10%
    });
    await seedVariantOutcomes(prisma, {
      businessId,
      experimentId: experiment.id,
      variantId: reminder.id,
      status: RetentionAssignmentStatus.SENT,
      exposedAt,
      total: 100,
      returned: 13, // 13%
    });
    await seedVariantOutcomes(prisma, {
      businessId,
      experimentId: experiment.id,
      variantId: progress.id,
      status: RetentionAssignmentStatus.SENT,
      exposedAt,
      total: 100,
      returned: 24, // 24% — but ZERO promo cost
    });
    await seedVariantOutcomes(prisma, {
      businessId,
      experimentId: experiment.id,
      variantId: discount.id,
      status: RetentionAssignmentStatus.SENT,
      exposedAt,
      total: 100,
      returned: 25, // 25% — HIGHEST raw return, but costs 15% of ticket
    });
    console.log('  400 filas reales sembradas (100 por variante)');

    console.log(
      '\n=== Verificación independiente: winnerReturn ≠ winnerEconomic ===',
    );
    const results = await metrics.forExperiment(businessId, experiment.id);
    const candidates = results.variants.filter(
      (v) => v.variantId !== control.id,
    );
    const bestByReturn = candidates.reduce((a, b) =>
      b.stats.returnRate > a.stats.returnRate ? b : a,
    );
    const bestByEconomics = candidates.reduce((a, b) =>
      (b.economics.estimatedNetIncrementalValue ?? -Infinity) >
      (a.economics.estimatedNetIncrementalValue ?? -Infinity)
        ? b
        : a,
    );
    console.log(
      `  10% OFF return=${(candidates.find((c) => c.variantId === discount.id)!.stats.returnRate * 100).toFixed(0)}% netValue=${candidates.find((c) => c.variantId === discount.id)!.economics.estimatedNetIncrementalValue}`,
    );
    console.log(
      `  Progress  return=${(candidates.find((c) => c.variantId === progress.id)!.stats.returnRate * 100).toFixed(0)}% netValue=${candidates.find((c) => c.variantId === progress.id)!.economics.estimatedNetIncrementalValue}`,
    );
    assert(
      bestByReturn.variantId === discount.id,
      'winnerReturn = 10% OFF (mayor retorno crudo)',
    );
    assert(
      bestByEconomics.variantId === progress.id,
      'winnerEconomic = Progress (mejor valor neto, sin costo promocional)',
    );

    console.log(
      '\n=== 2. Preview: el optimizador sigue el objetivo económico, no el retorno crudo ===',
    );
    const preview = await optimization.preview(businessId, experiment.id);
    assert(preview.status === 'PREVIEWED', 'preview generado');
    assert(
      preview.winnerVariantId === progress.id,
      'el ganador elegido es Progress, no 10% OFF',
    );
    assert(
      preview.objectiveUsed === 'BEST_ECONOMIC_VARIANT',
      'objective = BEST_ECONOMIC_VARIANT',
    );

    const proposed = preview.proposedAllocations as Record<string, number>;
    const sum = Object.values(proposed).reduce((a, b) => a + b, 0);
    assert(sum === 100, `la propuesta suma exactamente 100 (${sum})`);
    assert(
      proposed[control.id] >= 10,
      `CONTROL nunca baja de 10% (quedó en ${proposed[control.id]}%)`,
    );
    const exploration = proposed[reminder.id] + proposed[discount.id];
    assert(
      exploration >= 15,
      `exploración combinada nunca baja de 15% (quedó en ${exploration}%)`,
    );
    assert(
      proposed[progress.id] > 30,
      `Progress aumenta (de 30% a ${proposed[progress.id]}%)`,
    );
    assert(
      proposed[progress.id] - 30 <= 15,
      'el aumento respeta el máximo de 15 puntos por ronda',
    );

    console.log('\n=== 3. Aplicar la recomendación ===');
    const applied = await optimization.apply(businessId, experiment.id);
    assert(applied.status === 'APPLIED', 'la optimización se aplicó');

    const variantsAfter = await prisma.retentionVariant.findMany({
      where: { experimentId: experiment.id },
      select: { id: true, allocationPercent: true },
    });
    const allocationAfter = Object.fromEntries(
      variantsAfter.map((v) => [v.id, v.allocationPercent]),
    );
    const matchesProposal = Object.keys(proposed).every(
      (variantId) => allocationAfter[variantId] === proposed[variantId],
    );
    assert(
      matchesProposal,
      'la allocation real en la base coincide exactamente con la propuesta aplicada',
    );
    console.log(
      `  Control ${allocationAfter[control.id]}% · Reminder ${allocationAfter[reminder.id]}% · Progress ${allocationAfter[progress.id]}% · 10% OFF ${allocationAfter[discount.id]}%`,
    );

    console.log(
      '\n=== 4. Auditable: RetentionOptimizationRun quedó registrado ===',
    );
    const history1 = await optimization.history(businessId, experiment.id);
    assert(history1.length >= 1, 'hay al menos una fila de historial');
    assert(
      history1[0].status === 'APPLIED',
      'la más reciente es la que acabamos de aplicar',
    );

    console.log('\n=== 8. Assignments existentes NUNCA cambian ===');
    const sampleOldAssignment = await prisma.retentionAssignment.findUnique({
      where: { id: controlAssignmentIds[0] },
      select: { variantId: true },
    });
    assert(
      sampleOldAssignment?.variantId === control.id,
      'una asignación vieja sigue en su variante original',
    );

    console.log(
      '\n=== 9. Solo las asignaciones NUEVAS usan la nueva distribución ===',
    );
    const newCustomerIds: string[] = [];
    for (let i = 0; i < 60; i++) {
      newCustomerIds.push(
        await seedAtRiskCustomer(prisma, businessId, `Nuevo ${i}`, now),
      );
    }
    await evaluateService.runDaily(now);
    const newAssignments = await prisma.retentionAssignment.findMany({
      where: {
        businessId,
        experimentId: experiment.id,
        customerId: { in: newCustomerIds },
      },
      select: { variantId: true },
    });
    assert(
      newAssignments.length > 0,
      `${newAssignments.length} clientes nuevos reclutados`,
    );
    const progressShareNew =
      newAssignments.filter((a) => a.variantId === progress.id).length /
      newAssignments.length;
    console.log(
      `  Progress entre los reclutados NUEVOS: ${(progressShareNew * 100).toFixed(0)}% (antes era 30%)`,
    );
    assert(
      progressShareNew > 0.3,
      'la proporción de Progress entre los NUEVOS reclutas ya refleja la distribución aumentada',
    );

    console.log(
      '\n=== 7. Rollback: crea una fila nueva, restaura la allocation anterior ===',
    );
    const rolledBack = await optimization.rollback(businessId, experiment.id);
    assert(rolledBack.status === 'ROLLED_BACK', 'rollback aplicado');
    const variantsRestored = await prisma.retentionVariant.findMany({
      where: { experimentId: experiment.id },
      select: { id: true, allocationPercent: true },
    });
    const allocationRestored = Object.fromEntries(
      variantsRestored.map((v) => [v.id, v.allocationPercent]),
    );
    assert(
      allocationRestored[control.id] === 15 &&
        allocationRestored[reminder.id] === 30 &&
        allocationRestored[progress.id] === 30 &&
        allocationRestored[discount.id] === 25,
      'la allocation original (15/30/30/25) quedó restaurada',
    );

    const history2 = await optimization.history(businessId, experiment.id);
    assert(
      history2.length === history1.length + 1,
      'el rollback agregó una fila nueva, nunca borró la anterior',
    );
    assert(
      history2.some((r) => r.status === 'APPLIED') &&
        history2.some((r) => r.status === 'ROLLED_BACK'),
      'el historial conserva TANTO el APPLIED original COMO el ROLLED_BACK nuevo',
    );

    console.log('\n=== ALL CHECKS PASSED ===');
  } finally {
    console.log('\n=== CLEANUP ===');
    if (businessId) {
      await prisma.retentionOutcome.deleteMany({ where: { businessId } });
      await prisma.retentionDecisionLog.deleteMany({ where: { businessId } });
      await prisma.retentionOptimizationRun.deleteMany({
        where: { businessId },
      });
      await prisma.retentionAssignment.deleteMany({ where: { businessId } });
      await prisma.retentionVariant.deleteMany({ where: { businessId } });
      await prisma.retentionExperiment.deleteMany({ where: { businessId } });
      await prisma.retentionIncentiveDefinition.deleteMany({
        where: { businessId },
      });
      await prisma.retentionSettings.deleteMany({ where: { businessId } });
      await prisma.visit.deleteMany({ where: { businessId } });
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
