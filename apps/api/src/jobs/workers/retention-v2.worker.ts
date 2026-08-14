import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { ExperienceVersion, RetentionAssignmentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { createRedisConnection, REDIS_CONFIGURED } from '../redis-connection';
import {
  RETENTION_V2_QUEUE,
  RUN_RETENTION_V2_EVALUATE_JOB,
  RUN_RETENTION_V2_OUTCOMES_JOB,
  SEND_RETENTION_V2_ASSIGNMENT_JOB,
  SEND_RETENTION_V2_MESSAGE_JOB,
  RetentionV2Queue,
  type SendRetentionV2AssignmentJobData,
  type SendRetentionV2MessageJobData,
} from '../retention-v2.queue';
import { RetentionV2EvaluateService } from '../../modules/retention-v2/retention-v2-evaluate.service';
import { RetentionV2SendService } from '../../modules/retention-v2/retention-v2-send.service';
import { RetentionOutcomeService } from '../../modules/retention-v2/retention-outcome.service';
import { RetentionV2MessageDispatchService } from '../../modules/retention-v2/retention-v2-message-dispatch.service';

/**
 * Runs all four halves of the Retention V2 loop:
 *   evaluate → recruit customers into experiments (no sending)
 *   send     → process one assignment, re-validating everything, queues a
 *              Message
 *   dispatch → deliver that Message over WhatsApp, re-validating again
 *   outcomes → detect returns for assignments already exposed (Fase D)
 *
 * All four are retry-safe: send is idempotent by construction (a retry can
 * never produce a second message or reward), dispatch claims its Message
 * atomically before calling the provider (so two workers racing the same
 * message can't both send it), and outcomes is a pure upsert keyed on
 * assignmentId.
 */
@Injectable()
export class RetentionV2Worker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionV2Worker.name);
  private connection?: IORedis;
  private worker?: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluateService: RetentionV2EvaluateService,
    private readonly sendService: RetentionV2SendService,
    private readonly outcomeService: RetentionOutcomeService,
    private readonly dispatchService: RetentionV2MessageDispatchService,
    private readonly queue: RetentionV2Queue,
  ) {}

  onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.worker = new Worker(RETENTION_V2_QUEUE, (job) => this.process(job), {
      connection: this.connection,
    });
  }

  async process(job: Job) {
    if (job.name === RUN_RETENTION_V2_EVALUATE_JOB) {
      return this.runEvaluate();
    }
    if (job.name === SEND_RETENTION_V2_ASSIGNMENT_JOB) {
      const result = await this.sendService.processAssignment(
        (job.data as SendRetentionV2AssignmentJobData).assignmentId,
      );
      // A Message was just queued — hand it to the dispatcher so it
      // actually reaches WhatsApp. Queued here, not inside
      // RetentionV2SendService, so that service stays about the assignment
      // decision only and never depends on the queue.
      if (result.status === 'sent') {
        await this.queue.enqueueSendMessage({ messageId: result.messageId });
      }
      return result;
    }
    if (job.name === SEND_RETENTION_V2_MESSAGE_JOB) {
      return this.dispatchMessage(job);
    }
    if (job.name === RUN_RETENTION_V2_OUTCOMES_JOB) {
      return this.outcomeService.runOnce();
    }
    this.logger.warn(`Unknown retention-v2 job: ${job.name}`);
    return null;
  }

  /**
   * Dispatches one Message, marking it permanently `failed` (instead of
   * leaving it `queued` forever) once BullMQ has exhausted every retry —
   * `job.attemptsMade` is 0-indexed during the run itself, so the current
   * attempt is `attemptsMade + 1`.
   */
  private async dispatchMessage(job: Job) {
    const { messageId } = job.data as SendRetentionV2MessageJobData;
    try {
      return await this.dispatchService.dispatch(messageId);
    } catch (error) {
      const attempts = job.opts.attempts ?? 1;
      const isLastAttempt = job.attemptsMade + 1 >= attempts;
      if (isLastAttempt) {
        await this.dispatchService.markPermanentlyFailed(messageId, error);
      }
      throw error;
    }
  }

  /**
   * Recruits, then queues everything still pending.
   *
   * Queuing is driven off the database rather than off what this run just
   * created, so assignments left PENDING by an earlier run (for example one
   * made outside the owner's sending window) get another chance.
   */
  private async runEvaluate() {
    const result = await this.evaluateService.runDaily();

    const pending = await this.prisma.retentionAssignment.findMany({
      where: {
        status: RetentionAssignmentStatus.PENDING,
        // The engine flag is re-checked here too: if it was switched off after
        // the assignments were created, nothing gets queued.
        business: {
          isActive: true,
          experienceVersion: ExperienceVersion.CHECKIN_V2,
          retentionEngineV2Enabled: true,
        },
      },
      select: { id: true },
      take: 1000,
    });

    for (const assignment of pending) {
      await this.queue.enqueueSendAssignment({ assignmentId: assignment.id });
    }

    this.logger.log(
      `Retention V2 evaluate queued=${pending.length} assigned=${result.assigned}`,
    );
    return { ...result, queued: pending.length };
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.connection?.quit();
  }
}
