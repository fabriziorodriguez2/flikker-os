import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createRedisConnection } from './redis-connection';

export const OWNER_NOTIFICATIONS_QUEUE = 'owner-notifications';
export const LOW_FEEDBACK_NOTIFICATION_JOB = 'low-feedback-notification';

export interface LowFeedbackNotificationJobData {
  businessId: string;
  feedbackResponseId: string;
}

@Injectable()
export class OwnerNotificationsQueue implements OnModuleInit, OnModuleDestroy {
  private connection?: IORedis;
  private queue?: Queue<LowFeedbackNotificationJobData>;

  onModuleInit() {
    this.connection = createRedisConnection();
    this.queue = new Queue<LowFeedbackNotificationJobData>(
      OWNER_NOTIFICATIONS_QUEUE,
      { connection: this.connection },
    );
  }

  async enqueueLowFeedback(data: LowFeedbackNotificationJobData) {
    if (!this.queue) {
      throw new Error('Owner notifications queue is not initialized');
    }

    return this.queue.add(LOW_FEEDBACK_NOTIFICATION_JOB, data, {
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
