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
      // Independientes por diseño (Free y Pro, sin relación entre sí) — un
      // fallo en una nunca debe frenar la otra.
      const [stamps, birthday] = await Promise.allSettled([
        this.stampsExpiry.runDaily(now),
        this.birthday.runDaily(now),
      ]);
      if (stamps.status === 'rejected') {
        this.logger.error(
          `Stamps expiry email sweep failed: ${String(stamps.reason)}`,
        );
      }
      if (birthday.status === 'rejected') {
        this.logger.error(
          `Birthday email sweep failed: ${String(birthday.reason)}`,
        );
      }
      return {
        stampsExpiry: stamps.status === 'fulfilled' ? stamps.value : null,
        birthday: birthday.status === 'fulfilled' ? birthday.value : null,
      };
    }
    this.logger.warn(`Unknown lifecycle-emails job: ${job.name}`);
    return null;
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.connection?.quit();
  }
}
