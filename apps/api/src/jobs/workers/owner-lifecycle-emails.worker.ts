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
  OWNER_LIFECYCLE_EMAILS_QUEUE,
  RUN_OWNER_LIFECYCLE_EMAILS_SWEEP_JOB,
} from '../owner-lifecycle-emails.queue';
import { OwnerLifecycleEmailsService } from '../owner-lifecycle-emails.service';

@Injectable()
export class OwnerLifecycleEmailsWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(OwnerLifecycleEmailsWorker.name);
  private connection?: IORedis;
  private worker?: Worker;

  constructor(
    private readonly ownerLifecycleEmails: OwnerLifecycleEmailsService,
  ) {}

  onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.worker = new Worker(
      OWNER_LIFECYCLE_EMAILS_QUEUE,
      (job) => this.process(job),
      { connection: this.connection },
    );
  }

  async process(job: Job) {
    if (job.name === RUN_OWNER_LIFECYCLE_EMAILS_SWEEP_JOB) {
      return this.ownerLifecycleEmails.runHourlySweep(new Date());
    }
    this.logger.warn(`Unknown owner-lifecycle-emails job: ${job.name}`);
    return null;
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.connection?.quit();
  }
}
