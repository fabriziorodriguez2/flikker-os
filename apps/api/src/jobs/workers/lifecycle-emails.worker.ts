import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { createRedisConnection, REDIS_CONFIGURED } from '../redis-connection';
import {
  LIFECYCLE_EMAILS_QUEUE,
  RUN_LIFECYCLE_EMAILS_SWEEP_JOB,
} from '../lifecycle-emails.queue';
import { StampsExpiryEmailService } from '../stamps-expiry-email.service';
import { BirthdayEmailService } from '../birthday-email.service';

/** Corre los dos sweeps diarios de email que no dependen de Retention V2. */
@Injectable()
export class LifecycleEmailsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LifecycleEmailsWorker.name);
  private connection?: IORedis;
  private worker?: Worker;

  constructor(
    private readonly stampsExpiry: StampsExpiryEmailService,
    private readonly birthday: BirthdayEmailService,
  ) {}

  onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.worker = new Worker(
      LIFECYCLE_EMAILS_QUEUE,
      (job) => this.process(job),
      { connection: this.connection },
    );
  }

  async process(job: Job) {
    if (job.name === RUN_LIFECYCLE_EMAILS_SWEEP_JOB) {
      const now = new Date();
      // Secuencial, NO Promise.allSettled — a propósito. El cooldown global
      // de 24h (`AutomationCooldownService`) le da el slot a quien llegue
      // primero, y la prioridad pedida es Cumpleaños > Sellos por vencer:
      // correrlos en paralelo dejaría el orden real a la suerte del event
      // loop. Un fallo en uno igual no frena al otro (cada uno atrapa su
      // propio error).
      let birthdayResult: Awaited<
        ReturnType<BirthdayEmailService['runDaily']>
      > | null = null;
      try {
        birthdayResult = await this.birthday.runDaily(now);
      } catch (error) {
        this.logger.error(`Birthday email sweep failed: ${String(error)}`);
      }

      let stampsResult: Awaited<
        ReturnType<StampsExpiryEmailService['runDaily']>
      > | null = null;
      try {
        stampsResult = await this.stampsExpiry.runDaily(now);
      } catch (error) {
        this.logger.error(`Stamps expiry email sweep failed: ${String(error)}`);
      }

      return { birthday: birthdayResult, stampsExpiry: stampsResult };
    }
    this.logger.warn(`Unknown lifecycle-emails job: ${job.name}`);
    return null;
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.connection?.quit();
  }
}
