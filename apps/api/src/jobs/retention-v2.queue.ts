import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createRedisConnection, REDIS_CONFIGURED } from './redis-connection';

export const RETENTION_V2_QUEUE = 'retention-v2';
export const RUN_RETENTION_V2_EVALUATE_JOB = 'run-retention-v2-evaluate';
export const SEND_RETENTION_V2_ASSIGNMENT_JOB = 'send-retention-v2-assignment';
export const SEND_RETENTION_V2_MESSAGE_JOB = 'send-retention-v2-message';
export const RUN_RETENTION_V2_OUTCOMES_JOB = 'run-retention-v2-outcomes';

export interface SendRetentionV2AssignmentJobData {
  assignmentId: string;
}

export interface SendRetentionV2MessageJobData {
  messageId: string;
}

/**
 * Queue for Retention Engine V2, following the same one-queue-per-domain shape
 * the other jobs use (a repeating cron registered on boot plus per-item jobs).
 *
 * Cadence: the evaluation sweep runs once a day at 09:00. Physical visits move
 * on a scale of days, so anything more frequent would only re-scan unchanged
 * behaviour — and the send step is separately rate-limited by the owner's
 * cooldown and monthly cap anyway.
 */
@Injectable()
export class RetentionV2Queue implements OnModuleInit, OnModuleDestroy {
  private connection?: IORedis;
  private queue?: Queue;

  async onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.queue = new Queue(RETENTION_V2_QUEUE, {
      connection: this.connection,
    });
    await this.queue.add(
      RUN_RETENTION_V2_EVALUATE_JOB,
      {},
      {
        jobId: RUN_RETENTION_V2_EVALUATE_JOB,
        repeat: {
          pattern: process.env.RETENTION_V2_EVALUATE_CRON ?? '0 9 * * *',
        },
        removeOnComplete: 30,
        removeOnFail: false,
      },
    );
    // Outcome detection (Fase D): visits move on a scale of days, but a few
    // passes a day lets a return get its outcome written same-day instead of
    // waiting for tomorrow's evaluate run — without needing per-minute polling.
    await this.queue.add(
      RUN_RETENTION_V2_OUTCOMES_JOB,
      {},
      {
        jobId: RUN_RETENTION_V2_OUTCOMES_JOB,
        repeat: {
          pattern: process.env.RETENTION_V2_OUTCOMES_CRON ?? '0 */4 * * *',
        },
        removeOnComplete: 30,
        removeOnFail: false,
      },
    );
  }

  /**
   * Queues one assignment for processing. `jobId` is the assignment id, so
   * BullMQ de-duplicates re-queues of the same assignment while one is still
   * pending — a first line of defence on top of the DB constraints.
   */
  async enqueueSendAssignment(data: SendRetentionV2AssignmentJobData) {
    if (!this.queue) return null;
    return this.queue.add(SEND_RETENTION_V2_ASSIGNMENT_JOB, data, {
      jobId: `retention-v2-send:${data.assignmentId}`,
      attempts: 3,
      removeOnComplete: 100,
      removeOnFail: false,
    });
  }

  async enqueueEvaluateRun() {
    if (!this.queue) return null;
    return this.queue.add(RUN_RETENTION_V2_EVALUATE_JOB, {}, { attempts: 1 });
  }

  /**
   * Queues one Message for actual WhatsApp dispatch. `jobId` is the message
   * id, so a re-enqueue of the same message (should never happen, but see
   * `RetentionV2Worker`) de-dupes at the queue level too. `attempts: 3` is
   * what makes retry real here — unlike the assignment job above, the
   * dispatcher throws on a transient send failure specifically so BullMQ
   * retries it.
   */
  async enqueueSendMessage(data: SendRetentionV2MessageJobData) {
    if (!this.queue) return null;
    return this.queue.add(SEND_RETENTION_V2_MESSAGE_JOB, data, {
      jobId: `retention-v2-message:${data.messageId}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: 100,
      removeOnFail: false,
    });
  }

  /**
   * Reencola un mensaje que `dispatch()` dejó explícitamente `queued`
   * (fuera de horario, esperando el turno de prioridad) — nunca el mismo
   * `jobId` que el intento que se está terminando ahora mismo (todavía
   * puede seguir "activo" en BullMQ en ese instante), así que se deja que
   * BullMQ genere uno nuevo. La idempotencia real sigue siendo del Message
   * (`status: queued`, claim atómico en `dispatch()`), no de esta cola.
   */
  async enqueueDeferredRetry(
    data: SendRetentionV2MessageJobData,
    delayMs: number,
  ) {
    if (!this.queue) return null;
    return this.queue.add(SEND_RETENTION_V2_MESSAGE_JOB, data, {
      delay: delayMs,
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: 100,
      removeOnFail: false,
    });
  }

  async onModuleDestroy() {
    await this.queue?.close();
    await this.connection?.quit();
  }
}
