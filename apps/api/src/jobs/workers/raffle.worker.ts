import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { createRedisConnection, REDIS_CONFIGURED } from '../redis-connection';
import {
  RAFFLE_QUEUE,
  RUN_RAFFLE_TICK_JOB,
  SEND_RAFFLE_NOTIFICATIONS_JOB,
  SendRaffleNotificationsJobData,
} from '../raffle.queue';
import { RaffleProcessor } from '../raffle.processor';
import { WhatsAppBspService } from '../whatsapp-bsp.service';

@Injectable()
export class RaffleWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RaffleWorker.name);
  private connection?: IORedis;
  private worker?: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly raffleProcessor: RaffleProcessor,
    private readonly whatsAppBspService: WhatsAppBspService,
  ) {}

  onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.worker = new Worker(RAFFLE_QUEUE, (job) => this.process(job), {
      connection: this.connection,
    });
  }

  async process(job: Job) {
    if (job.name === RUN_RAFFLE_TICK_JOB) {
      return this.raffleProcessor.runTick();
    }
    if (job.name === SEND_RAFFLE_NOTIFICATIONS_JOB) {
      return this.sendRaffleNotifications(
        job.data as SendRaffleNotificationsJobData,
      );
    }
    this.logger.warn(`Unknown raffle job: ${job.name}`);
    return null;
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.connection?.quit();
  }

  /**
   * Notifies the owner and the winner. Left uncaught on purpose: a WhatsApp
   * failure fails the whole job so BullMQ retries it (see raffle.queue's
   * attempts: 3), rather than silently leaving `notifiedAt` unset forever.
   */
  private async sendRaffleNotifications(data: SendRaffleNotificationsJobData) {
    const draw = await this.prisma.raffleDraw.findUnique({
      where: { id: data.drawId },
      include: {
        benefit: { select: { title: true } },
        business: { select: { name: true, phone: true } },
        winner: { select: { name: true, phoneE164: true } },
      },
    });

    if (!draw || !draw.winner) return;

    if (draw.business.phone) {
      await this.whatsAppBspService.sendText({
        phone: draw.business.phone,
        text: this.ownerMessage(
          draw.benefit.title,
          draw.winner.name,
          draw.winner.phoneE164,
          draw.participantsCount,
        ),
      });
    }

    await this.whatsAppBspService.sendText({
      phone: draw.winner.phoneE164,
      text: this.winnerMessage(
        draw.benefit.title,
        draw.winner.name,
        draw.business.name,
      ),
    });

    await this.prisma.raffleDraw.update({
      where: { id: draw.id },
      data: { notifiedAt: new Date() },
    });
  }

  private ownerMessage(
    benefitTitle: string,
    winnerName: string,
    winnerPhone: string,
    participantsCount: number,
  ) {
    return [
      `🎉 *Sorteo de "${benefitTitle}"*`,
      '',
      `Ganador: ${winnerName} (${winnerPhone})`,
      `Participaron ${participantsCount} ${participantsCount === 1 ? 'persona' : 'personas'} este mes.`,
    ].join('\n');
  }

  private winnerMessage(
    benefitTitle: string,
    winnerName: string,
    businessName: string,
  ) {
    return `🎉 ¡Felicitaciones ${winnerName}! Ganaste el sorteo *${benefitTitle}* en *${businessName}*. Contactate con el local para coordinar la entrega. 🎁`;
  }
}
