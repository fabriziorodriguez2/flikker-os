/**
 * Reproducible LOCAL end-to-end run of the Fase E §41 retention case —
 * PROGRESS_REMINDER inside a real Retention V2 experiment, closing the loop
 * all the way through RetentionOutcome and the existing metrics.
 *
 * Scenario, exactly as specified:
 *   1. Varios clientes tienen una CustomerRewardGoal 2/3 (activa, sin tocar).
 *   2. Se vuelven AT_RISK (misma regla de segmentación de siempre).
 *   3. Experimento: CONTROL 50% / PROGRESS_REMINDER 50%.
 *   4. El worker de evaluate los asigna (allocation determinística por hash).
 *   5. Para el que cayó en PROGRESS_REMINDER: el mensaje dice
 *      "Te falta una visita…" y NO se emite ningún beneficio ni se toca el
 *      budget de incentivos (Fase E §25-27).
 *   7-10. El cliente vuelve, hace check-in real, la meta se completa a través
 *      del motor de Reward Goals (no del envío de retención) y se crea la
 *      BenefitParticipation — exactamente como en cualquier check-in.
 *   11-13. El outcome worker registra el retorno; las métricas de
 *      RetentionExperimentMetricsService comparan PROGRESS_REMINDER contra
 *      CONTROL sin ninguna lógica paralela.
 *
 * Usage (from apps/api, against the LOCAL database):
 *   npx ts-node -r tsconfig-paths/register scripts/reward-goals-retention-e2e-local.ts
 *
 * Refuses to run against anything that is not localhost. Cleans up everything
 * it created, even on failure.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import {
  ExperienceVersion,
  RetentionAssignmentStatus,
  RetentionObjective,
  RetentionStrategyType,
  VisitVerificationType,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CheckinService } from '../src/modules/checkin/checkin.service';
import { CustomerSessionsRepository } from '../src/modules/checkin/customer-sessions.repository';
import { RetentionV2EvaluateService } from '../src/modules/retention-v2/retention-v2-evaluate.service';
import { RetentionV2SendService } from '../src/modules/retention-v2/retention-v2-send.service';
import { RetentionOutcomeService } from '../src/modules/retention-v2/retention-outcome.service';
import { RetentionExperimentMetricsService } from '../src/modules/retention-v2/retention-experiment-metrics.service';
import { RetentionExperimentsAdminService } from '../src/modules/retention-v2/retention-experiments-admin.service';

const SUFFIX = Date.now();
const CUSTOMER_COUNT = 16; // enough that a ~50/50 split lands someone in each arm

function assert(condition: boolean, label: string) {
  console.log(`  ${condition ? '✓' : '✗'} ${label}`);
  if (!condition) throw new Error(`FAILED: ${label}`);
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
  const checkin = app.get(CheckinService);
  const sessions = app.get(CustomerSessionsRepository);
  const evaluateService = app.get(RetentionV2EvaluateService);
  const sendService = app.get(RetentionV2SendService);
  const outcomeService = app.get(RetentionOutcomeService);
  const metricsService = app.get(RetentionExperimentMetricsService);
  const experimentsAdmin = app.get(RetentionExperimentsAdminService);

  let businessId = '';

  try {
    console.log('\n=== SEED ===');
    const business = await prisma.business.create({
      data: {
        name: 'E2E Reward+Retention',
        slug: `rg-retention-e2e-${SUFFIX}`,
        country: 'UY',
        timezone: 'America/Montevideo',
        currency: 'UYU',
        isActive: true,
        experienceVersion: ExperienceVersion.CHECKIN_V2,
        retentionEngineV2Enabled: true,
        checkinMinHoursBetweenVisits: 0,
        checkinMaxVisitsPerDay: 10,
      },
      select: { id: true },
    });
    businessId = business.id;

    await prisma.retentionSettings.create({
      data: {
        businessId,
        rewardGoalsEnabled: true,
        averageTicketAmount: 500,
        minimumSampleSizeForRecommendations: 3,
        // Wide open on purpose: this script's "now" is real wall-clock time
        // (so the real check-in a few lines below lands after it without any
        // faked Date), and the send step must not flake depending on what
        // weekday/hour it happens to run at.
        sendingHourStart: 0,
        sendingHourEnd: 24,
        allowedSendingDays: [1, 2, 3, 4, 5, 6, 7],
      },
    });
    const incentive = await prisma.retentionIncentiveDefinition.create({
      data: {
        businessId,
        name: 'Upgrade gratis',
        type: 'gift',
        active: true,
        rewardGoalEligible: true,
        expiresInDays: 14,
      },
      select: { id: true },
    });

    const experiment = await prisma.retentionExperiment.create({
      data: {
        businessId,
        name: 'CONTROL vs PROGRESS_REMINDER',
        objective: RetentionObjective.AT_RISK_RECOVERY,
      },
      select: { id: true },
    });
    await prisma.retentionVariant.create({
      data: {
        businessId,
        experimentId: experiment.id,
        name: 'Control',
        strategyType: RetentionStrategyType.CONTROL,
        allocationPercent: 50,
      },
    });
    await prisma.retentionVariant.create({
      data: {
        businessId,
        experimentId: experiment.id,
        name: 'Progress reminder',
        strategyType: RetentionStrategyType.PROGRESS_REMINDER,
        allocationPercent: 50,
      },
    });
    // PROGRESS_REMINDER and CONTROL both fall outside INCENTIVE_STRATEGIES,
    // so `start()` never demands an incentiveDefinitionId here — same
    // lifecycle gate every other experiment goes through, not a shortcut.
    await experimentsAdmin.start(businessId, experiment.id);
    console.log('  experiment CONTROL 50% / PROGRESS_REMINDER 50%, started');

    // Each customer: 3 visits (weekly cadence), a CustomerRewardGoal created
    // right after visit #1 (target 3), 2 more visits count as progress
    // (2/3) — then 20 days of silence, which is what makes them AT_RISK.
    const now = new Date();
    const customerIds: string[] = [];
    for (let i = 0; i < CUSTOMER_COUNT; i++) {
      const customer = await prisma.customer.create({
        data: {
          businessId,
          name: `E2E cliente ${i}`,
          phoneE164: `+59897${SUFFIX.toString().slice(-6)}${String(i).padStart(2, '0')}`,
          origin: 'qr',
        },
        select: { id: true },
      });
      customerIds.push(customer.id);

      const visit1At = new Date(now.getTime() - 34 * 86_400_000);
      const goalActivatedAt = visit1At;
      const visit2At = new Date(now.getTime() - 27 * 86_400_000);
      const visit3At = new Date(now.getTime() - 20 * 86_400_000); // "last visit"

      for (const occurredAt of [visit1At, visit2At, visit3At]) {
        await prisma.visit.create({
          data: {
            businessId,
            customerId: customer.id,
            occurredAt,
            visitDayKey: occurredAt.toISOString().slice(0, 10),
            verificationType: VisitVerificationType.manual,
          },
        });
      }

      await prisma.customerRewardGoal.create({
        data: {
          businessId,
          customerId: customer.id,
          incentiveDefinitionId: incentive.id,
          startingVisitCount: 1,
          targetAdditionalVisits: 3,
          reasonCode: 'NEW_SECOND_VISIT',
          segmentAtCreation: 'NEW',
          createdAt: goalActivatedAt,
          activatedAt: goalActivatedAt,
        },
      });
    }
    console.log(
      `  ${CUSTOMER_COUNT} customers, each with an ACTIVE goal at 2/3 and 20 days of silence (AT_RISK)`,
    );

    console.log('\n=== EVALUATE (recruitment) ===');
    const evaluateResult = await evaluateService.runDaily(now);
    assert(
      evaluateResult.assigned === CUSTOMER_COUNT,
      'every customer recruited',
    );

    const assignments = await prisma.retentionAssignment.findMany({
      where: { businessId },
      include: { variant: true },
    });
    const progressAssignments = assignments.filter(
      (a) => a.variant.strategyType === RetentionStrategyType.PROGRESS_REMINDER,
    );
    const controlAssignments = assignments.filter(
      (a) => a.variant.strategyType === RetentionStrategyType.CONTROL,
    );
    assert(
      progressAssignments.length > 0,
      `${progressAssignments.length} landed in PROGRESS_REMINDER`,
    );
    assert(
      controlAssignments.length > 0,
      `${controlAssignments.length} landed in CONTROL`,
    );

    console.log('\n=== SEND (within the sending window) ===');
    // Same reference instant as recruitment — the window is wide open (see
    // above), so this never depends on what day/hour the script is run.
    const sendAt = now;
    for (const assignment of assignments) {
      await sendService.processAssignment(assignment.id, sendAt);
    }

    const sentProgress = await prisma.retentionAssignment.findMany({
      where: { id: { in: progressAssignments.map((a) => a.id) } },
    });
    assert(
      sentProgress.every((a) => a.status === RetentionAssignmentStatus.SENT),
      'PROGRESS_REMINDER assignments were sent',
    );

    const goalsAfterSend = await prisma.customerRewardGoal.findMany({
      where: {
        businessId,
        customerId: { in: progressAssignments.map((a) => a.customerId) },
      },
    });
    assert(
      goalsAfterSend.every(
        (g) => g.status === 'ACTIVE' && g.benefitParticipationId === null,
      ),
      'no se emitió ningún beneficio todavía — el mensaje solo recuerda progreso existente',
    );
    const messageCountAfterSend = await prisma.message.count({
      where: { businessId },
    });
    assert(
      messageCountAfterSend === progressAssignments.length,
      'ningún incentivo se emitió al enviar — cero costo promocional adicional',
    );

    console.log(
      '\n=== 7-10. El cliente en PROGRESS_REMINDER vuelve y hace check-in ===',
    );
    const chosenAssignment = progressAssignments[0];
    const chosenCustomerId = chosenAssignment.customerId;
    const source = await prisma.visitSource.create({
      data: { businessId, name: 'QR mostrador', token: `tok-${SUFFIX}` },
      select: { token: true, id: true },
    });
    const session = await sessions.issue(businessId, chosenCustomerId);
    const checkinResult = await checkin.checkin(source.token, session.rawToken);
    assert(
      checkinResult.status === 'checked_in',
      'visita real registrada vía check-in',
    );
    assert(
      checkinResult.personal.rewardGoal.unlockedNow === true,
      'la meta se completó (2/3 → 3/3) y pasó a UNLOCKED',
    );
    assert(
      Boolean(checkinResult.personal.rewardGoal.benefit?.code),
      'se creó la BenefitParticipation recién ahora, al completar la meta real',
    );

    console.log('\n=== 11. RetentionOutcome registra el retorno ===');
    const windowEnd = new Date(
      sendAt.getTime() +
        (
          await prisma.retentionExperiment.findUniqueOrThrow({
            where: { id: experiment.id },
            select: { attributionWindowDays: true },
          })
        ).attributionWindowDays *
          86_400_000 +
        86_400_000, // one day past the window, to force finalization for everyone else
    );
    const outcomeRun = await outcomeService.runOnce(windowEnd);
    assert(
      outcomeRun.processed === assignments.length,
      'el worker de outcomes procesó todas las asignaciones expuestas',
    );

    const chosenOutcome = await prisma.retentionOutcome.findUnique({
      where: { assignmentId: chosenAssignment.id },
    });
    assert(
      chosenOutcome?.returned === true,
      'el retorno del cliente quedó registrado como RetentionOutcome',
    );

    console.log(
      '\n=== 12-13. Las métricas comparan PROGRESS_REMINDER vs CONTROL normalmente ===',
    );
    const results = await metricsService.forExperiment(
      businessId,
      experiment.id,
    );
    const progressStats = results.variants.find(
      (v) => v.strategyType === RetentionStrategyType.PROGRESS_REMINDER,
    )!;
    const controlStats = results.variants.find(
      (v) => v.strategyType === RetentionStrategyType.CONTROL,
    )!;
    console.log(
      `  CONTROL: ${controlStats.stats.returnedCount}/${controlStats.stats.exposedCount} · PROGRESS_REMINDER: ${progressStats.stats.returnedCount}/${progressStats.stats.exposedCount}`,
    );
    assert(
      progressStats.stats.returnedCount >= 1,
      'PROGRESS_REMINDER tiene al menos un retorno real contado en las métricas existentes',
    );
    assert(
      progressStats.economics.knownPromotionalCost === 0 &&
        progressStats.economics.estimatedPromotionalCost === 0,
      'PROGRESS_REMINDER nunca tuvo costo promocional — nunca emitió un incentivo',
    );

    console.log('\n=== ALL CHECKS PASSED ===');
  } finally {
    console.log('\n=== CLEANUP ===');
    if (businessId) {
      await prisma.retentionOutcome.deleteMany({ where: { businessId } });
      await prisma.retentionDecisionLog.deleteMany({ where: { businessId } });
      await prisma.customerEvent.deleteMany({ where: { businessId } });
      await prisma.message.deleteMany({ where: { businessId } });
      await prisma.retentionAssignment.deleteMany({ where: { businessId } });
      await prisma.retentionVariant.deleteMany({ where: { businessId } });
      await prisma.retentionExperiment.deleteMany({ where: { businessId } });
      await prisma.benefitParticipation.deleteMany({ where: { businessId } });
      await prisma.benefit.deleteMany({ where: { businessId } });
      await prisma.customerRewardGoal.deleteMany({ where: { businessId } });
      await prisma.retentionIncentiveDefinition.deleteMany({
        where: { businessId },
      });
      await prisma.retentionSettings.deleteMany({ where: { businessId } });
      await prisma.customerSession.deleteMany({ where: { businessId } });
      await prisma.visit.deleteMany({ where: { businessId } });
      await prisma.visitSource.deleteMany({ where: { businessId } });
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
