import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createRedisConnection, REDIS_CONFIGURED } from './redis-connection';

export const OWNER_LIFECYCLE_EMAILS_QUEUE = 'owner-lifecycle-emails';
export const RUN_OWNER_LIFECYCLE_EMAILS_SWEEP_JOB =
  'run-owner-lifecycle-emails-sweep';

/**
 * Cola propia para el sweep horario de emails al dueño/manager (primera
 * semana, semanal/mensual, primer mes, trial por terminar, hitos) —
 * `repeat` nativo de BullMQ, mismo patrón que `LifecycleEmailsQueue`, no el
 * `setInterval` de `owner-notifications.worker.ts` (que sigue siendo
 * exclusivo de LEGACY). Horario, no diario: los triggers de fecha (día 7,
 * lunes 9am, día 1 del mes, etc.) necesitan revisarse en cada hora local de
 * cada negocio, no una vez al día en un horario fijo de servidor.
 */
@Injectable()
export class OwnerLifecycleEmailsQueue
  implements OnModuleInit, OnModuleDestroy
{
  private connection?: IORedis;
  private queue?: Queue;

  async onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.queue = new Queue(OWNER_LIFECYCLE_EMAILS_QUEUE, {
      connection: this.connection,
    });
    await this.queue.add(
      RUN_OWNER_LIFECYCLE_EMAILS_SWEEP_JOB,
      {},
      {
        jobId: RUN_OWNER_LIFECYCLE_EMAILS_SWEEP_JOB,
        repeat: {
          pattern: process.env.OWNER_LIFECYCLE_EMAILS_SWEEP_CRON ?? '0 * * * *',
        },
        removeOnComplete: 30,
        removeOnFail: false,
      },
    );
  }

  async enqueueSweepRun() {
    if (!this.queue) return null;
    return this.queue.add(
      RUN_OWNER_LIFECYCLE_EMAILS_SWEEP_JOB,
      {},
      { attempts: 1 },
    );
  }

  async onModuleDestroy() {
    await this.queue?.close();
    await this.connection?.quit();
  }
}
