import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createRedisConnection } from './redis-connection';

export const REVIEW_REQUESTS_QUEUE = 'review-requests';
export const REVIEW_REQUEST_JOB = 'review-request';

export interface ReviewRequestJobData {
  messageId: string;
  customerId: string;
  businessId: string;
}

@Injectable()
export class ReviewRequestQueue implements OnModuleInit, OnModuleDestroy {
  private connection?: IORedis;
  private queue?: Queue<ReviewRequestJobData>;

  onModuleInit() {
    this.connection = createRedisConnection();
    this.queue = new Queue<ReviewRequestJobData>(REVIEW_REQUESTS_QUEUE, {
      connection: this.connection,
    });
  }

  async enqueue(data: ReviewRequestJobData, delay = this.resolveDelayMs()) {
    if (!this.queue) {
      throw new Error('Review request queue is not initialized');
    }

    return this.queue.add(REVIEW_REQUEST_JOB, data, {
      delay,
      attempts: 3,
      removeOnComplete: 100,
      removeOnFail: false,
    });
  }

  async getJobCounts() {
    if (!this.queue) return {};
    return this.queue.getJobCounts('waiting', 'delayed', 'active', 'completed');
  }

  async onModuleDestroy() {
    await this.queue?.close();
    await this.connection?.quit();
  }

  private resolveDelayMs() {
    return Number(process.env.REVIEW_REQUEST_DELAY_MS ?? 2 * 60 * 60 * 1000);
  }
}
