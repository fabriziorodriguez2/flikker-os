/**
 * Reproducible LOCAL end-to-end run of the Fase F §49 message case — AI-written
 * PROGRESS_REMINDER copy, with a real fallback run right after it.
 *
 * Scenario, exactly as specified:
 *   1. Business: CHECKIN_V2, Retention V2 ON, AI ON (aiCopyEnabled + AI_ENABLED).
 *   2. Cliente: AT_RISK, con una CustomerRewardGoal 2/3 (reward = "Upgrade").
 *   3. Strategy: PROGRESS_REMINDER.
 *   4. El motor determinístico decide TODO (segmento, goal, elegibilidad,
 *      ventana de envío) — nada de esto cambia por tener AI activado.
 *   5. La IA recibe solo el contexto permitido (Fase F §8) y genera el copy.
 *   6. El validador lo aprueba (no inventa nada) → Message queda queued con
 *      copySource=AI.
 *   7. Se repite con el proveedor fallando (fetch rechaza) → Message sigue
 *      quedando queued, esta vez con copySource=DETERMINISTIC_FALLBACK — el
 *      envío nunca se pierde ni se bloquea por una caída de OpenAI.
 *
 * `OPENAI_API_KEY`/`AI_ENABLED` are set here, in-process, before Nest boots —
 * no real OpenAI call is ever made; `globalThis.fetch` is swapped for a
 * controllable stub for the duration of this script only.
 *
 * Usage (from apps/api, against the LOCAL database):
 *   npx ts-node -r tsconfig-paths/register scripts/ai-layer-message-e2e-local.ts
 *
 * Refuses to run against anything that is not localhost. Cleans up everything
 * it created, even on failure. Restores the original fetch/env on exit.
 */
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
import { RetentionV2SendService } from '../src/modules/retention-v2/retention-v2-send.service';
import { RetentionExperimentsAdminService } from '../src/modules/retention-v2/retention-experiments-admin.service';

const SUFFIX = Date.now();
const originalFetch = globalThis.fetch;

function assert(condition: boolean, label: string) {
  console.log(`  ${condition ? '✓' : '✗'} ${label}`);
  if (!condition) throw new Error(`FAILED: ${label}`);
}

/** Stub for the OpenAI Chat Completions endpoint — never a real network call. */
function mockOpenAiSuccess(text: string): typeof fetch {
  return (() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ text }) } }],
          usage: { prompt_tokens: 40, completion_tokens: 12 },
        }),
        { status: 200 },
      ),
    )) as unknown as typeof fetch;
}

function mockOpenAiDown(): typeof fetch {
  return (() =>
    Promise.reject(
      new Error('simulated OpenAI outage'),
    )) as unknown as typeof fetch;
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
  const sendService = app.get(RetentionV2SendService);
  const experimentsAdmin = app.get(RetentionExperimentsAdminService);

  let businessId = '';

  try {
    console.log('\n=== SEED: business CHECKIN_V2, Retention V2 ON, AI ON ===');
    const business = await prisma.business.create({
      data: {
        name: 'Café Ana',
        slug: `ai-msg-e2e-${SUFFIX}`,
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
        rewardGoalsEnabled: true,
        aiCopyEnabled: true, // Fase F §5 — business-level opt-in
        sendingHourStart: 0,
        sendingHourEnd: 24,
        allowedSendingDays: [1, 2, 3, 4, 5, 6, 7],
      },
    });
    const incentive = await prisma.retentionIncentiveDefinition.create({
      data: {
        businessId,
        name: 'Upgrade',
        type: 'gift',
        active: true,
        rewardGoalEligible: true,
      },
      select: { id: true },
    });
    const experiment = await prisma.retentionExperiment.create({
      data: {
        businessId,
        name: 'Progress reminder pilot',
        objective: RetentionObjective.AT_RISK_RECOVERY,
      },
      select: { id: true },
    });
    // A CONTROL share is mandatory for the experiment to reach RUNNING
    // (`validateAllocation`) — this script assigns the test customer to
    // PROGRESS_REMINDER directly, so the exact split does not matter here.
    await prisma.retentionVariant.create({
      data: {
        businessId,
        experimentId: experiment.id,
        name: 'Control',
        strategyType: RetentionStrategyType.CONTROL,
        allocationPercent: 20,
      },
    });
    const variant = await prisma.retentionVariant.create({
      data: {
        businessId,
        experimentId: experiment.id,
        name: 'Progress reminder',
        strategyType: RetentionStrategyType.PROGRESS_REMINDER,
        allocationPercent: 80,
      },
      select: { id: true },
    });
    await experimentsAdmin.start(businessId, experiment.id);
    console.log('  business + incentive + experiment/variant ready (RUNNING)');

    console.log('\n=== 2. Cliente AT_RISK con CustomerRewardGoal 2/3 ===');
    const customer = await prisma.customer.create({
      data: {
        businessId,
        name: 'Diego',
        phoneE164: `+59897${SUFFIX.toString().slice(-6)}`,
        origin: 'qr',
      },
      select: { id: true },
    });
    const now = new Date();
    const goalActivatedAt = new Date(now.getTime() - 34 * 86_400_000);
    for (const daysAgo of [34, 27, 20]) {
      await prisma.visit.create({
        data: {
          businessId,
          customerId: customer.id,
          occurredAt: new Date(now.getTime() - daysAgo * 86_400_000),
          visitDayKey: new Date(now.getTime() - daysAgo * 86_400_000)
            .toISOString()
            .slice(0, 10),
          verificationType: 'manual',
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
    console.log(
      '  goal 2/3 ("Upgrade") active, last visit 20 days ago (AT_RISK)',
    );

    console.log(
      '\n=== 3-4. Assignment PROGRESS_REMINDER, motor determinístico decide todo ===',
    );
    const assignment = await prisma.retentionAssignment.create({
      data: {
        businessId,
        customerId: customer.id,
        experimentId: experiment.id,
        variantId: variant.id,
        status: RetentionAssignmentStatus.PENDING,
        segmentAtAssignment: 'AT_RISK',
        visitCountAtAssignment: 3,
        daysSinceLastVisit: 20,
      },
      select: { id: true },
    });

    console.log(
      '\n=== 5-6. AI genera copy, validador aprueba → copySource=AI ===',
    );
    globalThis.fetch = mockOpenAiSuccess(
      'Te falta una visita para desbloquear tu upgrade en Café Ana. Escaneá el QR/NFC la próxima vez que vengas.',
    );
    const sent = await sendService.processAssignment(assignment.id, now);
    assert(sent.status === 'sent', 'assignment enviado');
    if (sent.status !== 'sent') throw new Error('unreachable');

    const message = await prisma.message.findUnique({
      where: { id: sent.messageId },
      select: { copySource: true, status: true, aiUsageEventId: true },
    });
    assert(message?.status === 'queued', 'Message quedó queued');
    assert(message?.copySource === 'AI', 'copySource=AI');
    assert(
      Boolean(message?.aiUsageEventId),
      'quedó vinculado a un AiUsageEvent',
    );

    const usageEvent = await prisma.aiUsageEvent.findUnique({
      where: { id: message!.aiUsageEventId! },
      select: {
        useCase: true,
        success: true,
        fallbackUsed: true,
        businessId: true,
      },
    });
    assert(
      usageEvent?.useCase === 'PROGRESS_REMINDER_MESSAGE',
      'useCase correcto',
    );
    assert(
      usageEvent?.success === true && usageEvent?.fallbackUsed === false,
      'AiUsageEvent success=true fallbackUsed=false',
    );

    console.log(
      '\n=== 7. Proveedor caído → copySource=DETERMINISTIC_FALLBACK, el envío no se pierde ===',
    );
    // A second, independent customer/assignment — the first one is already
    // SENT (terminal), so this proves the fallback path on a fresh send, not
    // a retry of the same one.
    const customer2 = await prisma.customer.create({
      data: {
        businessId,
        name: 'Valentina',
        phoneE164: `+59898${SUFFIX.toString().slice(-6)}`,
        origin: 'qr',
      },
      select: { id: true },
    });
    for (const daysAgo of [34, 27, 20]) {
      await prisma.visit.create({
        data: {
          businessId,
          customerId: customer2.id,
          occurredAt: new Date(now.getTime() - daysAgo * 86_400_000),
          visitDayKey: new Date(now.getTime() - daysAgo * 86_400_000)
            .toISOString()
            .slice(0, 10),
          verificationType: 'manual',
        },
      });
    }
    await prisma.customerRewardGoal.create({
      data: {
        businessId,
        customerId: customer2.id,
        incentiveDefinitionId: incentive.id,
        startingVisitCount: 1,
        targetAdditionalVisits: 3,
        reasonCode: 'NEW_SECOND_VISIT',
        segmentAtCreation: 'NEW',
        createdAt: goalActivatedAt,
        activatedAt: goalActivatedAt,
      },
    });
    const assignment2 = await prisma.retentionAssignment.create({
      data: {
        businessId,
        customerId: customer2.id,
        experimentId: experiment.id,
        variantId: variant.id,
        status: RetentionAssignmentStatus.PENDING,
        segmentAtAssignment: 'AT_RISK',
        visitCountAtAssignment: 3,
        daysSinceLastVisit: 20,
      },
      select: { id: true },
    });

    globalThis.fetch = mockOpenAiDown();
    const sentDuringOutage = await sendService.processAssignment(
      assignment2.id,
      now,
    );
    assert(
      sentDuringOutage.status === 'sent',
      'assignment sigue enviándose aunque OpenAI esté caído',
    );
    if (sentDuringOutage.status !== 'sent') throw new Error('unreachable');

    const messageDuringOutage = await prisma.message.findUnique({
      where: { id: sentDuringOutage.messageId },
      select: { copySource: true, status: true },
    });
    assert(
      messageDuringOutage?.status === 'queued',
      'Message sigue queued durante la caída',
    );
    assert(
      messageDuringOutage?.copySource === 'DETERMINISTIC_FALLBACK',
      'copySource=DETERMINISTIC_FALLBACK',
    );

    console.log('\n=== ALL CHECKS PASSED ===');
  } finally {
    globalThis.fetch = originalFetch;
    console.log('\n=== CLEANUP ===');
    if (businessId) {
      await prisma.aiUsageEvent.deleteMany({ where: { businessId } });
      await prisma.retentionDecisionLog.deleteMany({ where: { businessId } });
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
    globalThis.fetch = originalFetch;
    console.error(
      `\nERROR: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
