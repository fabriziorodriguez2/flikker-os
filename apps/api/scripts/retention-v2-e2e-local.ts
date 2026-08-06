/**
 * Reproducible LOCAL end-to-end run of Retention Engine V2.
 *
 * Seeds a throwaway business + customer, runs evaluate and send, checks the
 * result, runs both again to prove idempotency, then deletes everything it
 * created. No WhatsApp is ever sent: the send step only creates a queued
 * `Message` row, which is exactly where the existing pipeline takes over.
 *
 * Usage (from apps/api, against the LOCAL database):
 *   npx ts-node -r tsconfig-paths/register scripts/retention-v2-e2e-local.ts
 *
 * Refuses to run against anything that is not localhost.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import {
  ExperienceVersion,
  MessageStatus,
  RetentionAssignmentStatus,
  RetentionExperimentStatus,
  RetentionObjective,
  RetentionStrategyType,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RetentionV2EvaluateService } from '../src/modules/retention-v2/retention-v2-evaluate.service';
import { RetentionV2SendService } from '../src/modules/retention-v2/retention-v2-send.service';

const SLUG = `zz-retention-v2-e2e-${Date.now()}`;

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
  const evaluate = app.get(RetentionV2EvaluateService);
  const send = app.get(RetentionV2SendService);

  let businessId = '';

  try {
    console.log('\n=== SEED ===');
    const business = await prisma.business.create({
      data: {
        name: 'E2E Retention V2',
        slug: SLUG,
        country: 'UY',
        timezone: 'America/Montevideo',
        currency: 'UYU',
        isActive: true,
        // The two flags that hand this business to the V2 engine.
        experienceVersion: ExperienceVersion.CHECKIN_V2,
        retentionEngineV2Enabled: true,
      },
      select: { id: true },
    });
    businessId = business.id;
    console.log(`  business ${SLUG}`);

    const experiment = await prisma.retentionExperiment.create({
      data: {
        businessId,
        name: 'E2E at-risk recovery',
        objective: RetentionObjective.AT_RISK_RECOVERY,
        status: RetentionExperimentStatus.RUNNING,
        variants: {
          create: [
            {
              businessId,
              name: 'Control',
              strategyType: RetentionStrategyType.CONTROL,
              allocationPercent: 50,
            },
            {
              businessId,
              name: 'Recordatorio',
              strategyType: RetentionStrategyType.REMINDER,
              allocationPercent: 50,
            },
          ],
        },
      },
      select: { id: true },
    });
    console.log('  experiment RUNNING with CONTROL + REMINDER');

    // Several customers so at least one lands in each arm.
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const customer = await prisma.customer.create({
        data: {
          businessId,
          name: `E2E Cliente ${i}`,
          phoneE164: `+5989900${String(i).padStart(4, '0')}`,
          origin: 'qr',
        },
        select: { id: true },
      });
      // Weekly cadence, last visit 20 days ago → AT_RISK.
      for (let v = 4; v >= 0; v--) {
        const occurredAt = new Date(now.getTime() - (20 + v * 7) * 86_400_000);
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
    }
    console.log('  12 customers with a weekly cadence, 20 days out (AT_RISK)');

    console.log('\n=== EVALUATE ===');
    const firstRun = await evaluate.runDaily(now);
    const assignments = await prisma.retentionAssignment.findMany({
      where: { businessId },
      include: { variant: true },
    });
    assert(firstRun.assigned > 0, `recruited ${firstRun.assigned} customers`);
    assert(
      assignments.every((a) => a.status === RetentionAssignmentStatus.PENDING),
      'every assignment starts PENDING (evaluate never sends)',
    );

    const controls = assignments.filter(
      (a) => a.variant.strategyType === RetentionStrategyType.CONTROL,
    );
    const reminders = assignments.filter(
      (a) => a.variant.strategyType === RetentionStrategyType.REMINDER,
    );
    assert(controls.length > 0, `${controls.length} landed in CONTROL`);
    assert(reminders.length > 0, `${reminders.length} landed in REMINDER`);

    console.log('\n=== EVALUATE (again) ===');
    const secondRun = await evaluate.runDaily(now);
    assert(secondRun.assigned === 0, 'a re-run recruits nobody twice');

    console.log('\n=== SEND ===');
    // Force a time inside the default sending window (Wed 12:00 local).
    const sendAt = new Date('2026-09-02T15:00:00.000Z');
    for (const assignment of assignments) {
      await send.processAssignment(assignment.id, sendAt);
    }

    const afterSend = await prisma.retentionAssignment.findMany({
      where: { businessId },
      include: { variant: true, message: true },
    });
    const controlsAfter = afterSend.filter(
      (a) => a.variant.strategyType === RetentionStrategyType.CONTROL,
    );
    const remindersAfter = afterSend.filter(
      (a) => a.variant.strategyType === RetentionStrategyType.REMINDER,
    );

    assert(
      controlsAfter.every(
        (a) =>
          a.status === RetentionAssignmentStatus.OBSERVING &&
          a.messageId === null &&
          a.benefitParticipationId === null,
      ),
      'CONTROL: OBSERVING, no message, no reward',
    );
    assert(
      remindersAfter.every(
        (a) =>
          a.status === RetentionAssignmentStatus.SENT &&
          a.messageId !== null &&
          a.message?.status === MessageStatus.queued,
      ),
      'REMINDER: SENT with a queued Message (existing pipeline takes over)',
    );

    const messageCount = await prisma.message.count({ where: { businessId } });
    assert(
      messageCount === remindersAfter.length,
      `exactly ${remindersAfter.length} messages created`,
    );

    console.log('\n=== SEND (again) ===');
    for (const assignment of assignments) {
      await send.processAssignment(assignment.id, sendAt);
    }
    const messageCountAfterRetry = await prisma.message.count({
      where: { businessId },
    });
    assert(
      messageCountAfterRetry === messageCount,
      'a second pass creates no extra messages (idempotent)',
    );

    console.log('\n=== AUDIT ===');
    const logs = await prisma.retentionDecisionLog.groupBy({
      by: ['decisionCode'],
      where: { businessId },
      _count: { _all: true },
    });
    for (const log of logs) {
      console.log(`  ${log.decisionCode}: ${log._count._all}`);
    }
    assert(
      logs.some((l) => l.decisionCode === 'CONTROL_ACTIVE'),
      'CONTROL_ACTIVE recorded',
    );
    assert(
      logs.some((l) => l.decisionCode === 'MESSAGE_QUEUED'),
      'MESSAGE_QUEUED recorded',
    );

    console.log('\n=== ALL CHECKS PASSED ===');
    void experiment;
  } finally {
    if (businessId) {
      console.log('\n=== CLEANUP ===');
      await prisma.retentionDecisionLog.deleteMany({ where: { businessId } });
      await prisma.retentionAssignment.deleteMany({ where: { businessId } });
      await prisma.retentionVariant.deleteMany({ where: { businessId } });
      await prisma.retentionExperiment.deleteMany({ where: { businessId } });
      await prisma.retentionSettings.deleteMany({ where: { businessId } });
      await prisma.message.deleteMany({ where: { businessId } });
      await prisma.visit.deleteMany({ where: { businessId } });
      await prisma.benefitParticipation.deleteMany({ where: { businessId } });
      await prisma.benefit.deleteMany({ where: { businessId } });
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
