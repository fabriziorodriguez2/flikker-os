import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createRedisConnection, REDIS_CONFIGURED } from './redis-connection';

export const LIFECYCLE_EMAILS_QUEUE = 'lifecycle-emails';
export const RUN_LIFECYCLE_EMAILS_SWEEP_JOB = 'run-lifecycle-emails-sweep';

/**
 * Cola propia para los sweeps diarios de email (sellos por vencer,
 * cumpleaños) — mismo patrón que `RewardGoalQueue`/`RetentionV2Queue`: una
 * cola chica por concern, para que un incidente en una nunca bloquee otra.
 * "Casi llegás"/"Te extrañamos" por email NO pasan por acá — se mandan
 * desde `RetentionV2MessageDispatchService`, en el mismo momento en que ya
 * se manda el WhatsApp de esa automatización, no en un sweep aparte.
 */
@Injectable()
export class LifecycleEmailsQueue implements OnModuleInit, OnModuleDestroy {
  private connection?: IORedis;
  private queue?: Queue;

  async onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.queue = new Queue(LIFECYCLE_EMAILS_QUEUE, {
      connection: this.connection,
    });
    await this.queue.add(
      RUN_LIFECYCLE_EMAILS_SWEEP_JOB,
      {},
      {
        jobId: RUN_LIFECYCLE_EMAILS_SWEEP_JOB,
        repeat: {
          // Antes que Retention V2 (`RETENTION_V2_EVALUATE_CRON`, default
          // `0 9 * * *`) — a propósito: el cooldown global de 24h le da el
          // slot del día a quien reclama primero, y la prioridad pedida es
          // Cumpleaños/Sellos por vencer antes que Casi llegás/Te
          // extrañamos.
          pattern: process.env.LIFECYCLE_EMAILS_SWEEP_CRON ?? '55 8 * * *',
        },
        removeOnComplete: 30,
        removeOnFail: false,
      },
    );
  }

  async enqueueSweepRun() {
    if (!this.queue) return null;
    return this.queue.add(RUN_LIFECYCLE_EMAILS_SWEEP_JOB, {}, { attempts: 1 });
  }

  async onModuleDestroy() {
    await this.queue?.close();
    await this.connection?.quit();
  }
}
