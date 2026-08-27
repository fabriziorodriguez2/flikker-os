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
import { OwnerMilestoneWhatsAppService } from '../owner-milestone-whatsapp.service';

@Injectable()
export class OwnerLifecycleEmailsWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(OwnerLifecycleEmailsWorker.name);
  private connection?: IORedis;
  private worker?: Worker;

  constructor(
    private readonly ownerLifecycleEmails: OwnerLifecycleEmailsService,
    private readonly ownerMilestoneWhatsApp: OwnerMilestoneWhatsAppService,
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
      const now = new Date();
      // Secuencial, no en paralelo — a propósito. Los hitos de WhatsApp son
      // prioridad baja respecto a los emails de ciclo de vida (§ pedido
      // explícito); corren SIEMPRE después, nunca compiten por el mismo
      // slot. Un fallo en uno no frena al otro (cada uno atrapa su error).
      let emailsResult: Awaited<
        ReturnType<OwnerLifecycleEmailsService['runHourlySweep']>
      > | null = null;
      try {
        emailsResult = await this.ownerLifecycleEmails.runHourlySweep(now);
      } catch (error) {
        this.logger.error(
          `Owner lifecycle emails sweep failed: ${String(error)}`,
        );
      }

      let milestonesResult: Awaited<
        ReturnType<OwnerMilestoneWhatsAppService['runDailyCheck']>
      > | null = null;
      try {
        milestonesResult = await this.ownerMilestoneWhatsApp.runDailyCheck(now);
      } catch (error) {
        this.logger.error(
          `Owner milestone WhatsApp check failed: ${String(error)}`,
        );
      }

      return { emails: emailsResult, milestones: milestonesResult };
    }
    this.logger.warn(`Unknown owner-lifecycle-emails job: ${job.name}`);
    return null;
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.connection?.quit();
  }
}
