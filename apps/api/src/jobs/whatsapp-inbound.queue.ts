import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createRedisConnection } from './redis-connection';

export const WHATSAPP_INBOUND_QUEUE = 'whatsapp-inbound';
export const WHATSAPP_INBOUND_JOB = 'whatsapp-inbound-message';

export interface WhatsAppInboundJobData {
  from: string;
  text: string;
  messageId?: string;
  receivedAt: string;
}

@Injectable()
export class WhatsAppInboundQueue implements OnModuleInit, OnModuleDestroy {
  private connection?: IORedis;
  private queue?: Queue<WhatsAppInboundJobData>;

  onModuleInit() {
    this.connection = createRedisConnection();
    this.queue = new Queue<WhatsAppInboundJobData>(WHATSAPP_INBOUND_QUEUE, {
      connection: this.connection,
    });
  }

  async enqueue(data: WhatsAppInboundJobData) {
    if (!this.queue) {
      throw new Error('WhatsApp inbound queue is not initialized');
    }

    return this.queue.add(WHATSAPP_INBOUND_JOB, data, {
      attempts: 3,
      removeOnComplete: 100,
      removeOnFail: false,
    });
  }

  async onModuleDestroy() {
    await this.queue?.close();
    await this.connection?.quit();
  }
}
