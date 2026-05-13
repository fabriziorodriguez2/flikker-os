import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JobsOptions, Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createRedisConnection, REDIS_CONFIGURED } from './redis-connection';

export const GOOGLE_REVIEW_DETECTION_QUEUE = 'google-review-detection';
export const DETECT_GOOGLE_REVIEWS_DAILY_JOB = 'detect-google-reviews-daily';
export const INITIAL_GOOGLE_REVIEW_SCRAPE_JOB = 'initial-review-scrape';

type InitialScrapeJobOptions = JobsOptions & { timeout: number };

@Injectable()
export class GoogleReviewDetectionQueue
  implements OnModuleInit, OnModuleDestroy
{
  private connection?: IORedis;
  private queue?: Queue;

  async onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.queue = new Queue(GOOGLE_REVIEW_DETECTION_QUEUE, {
      connection: this.connection,
    });

    await this.queue.add(
      DETECT_GOOGLE_REVIEWS_DAILY_JOB,
      {},
      {
        jobId: DETECT_GOOGLE_REVIEWS_DAILY_JOB,
        repeat: {
          pattern: process.env.GOOGLE_REVIEW_DETECTION_CRON ?? '0 3 * * *',
        },
        removeOnComplete: 30,
        removeOnFail: false,
      },
    );
  }

  async enqueueDailyRun() {
    if (!this.queue) return null;
    return this.queue.add(DETECT_GOOGLE_REVIEWS_DAILY_JOB, {}, { attempts: 1 });
  }

  async enqueueInitialScrape(businessId: string) {
    if (!this.queue) return null;
    const options: InitialScrapeJobOptions = {
      attempts: 1,
      jobId: `${INITIAL_GOOGLE_REVIEW_SCRAPE_JOB}:${businessId}`,
      removeOnComplete: 30,
      removeOnFail: false,
      timeout: 60_000,
    };
    return this.queue.add(
      INITIAL_GOOGLE_REVIEW_SCRAPE_JOB,
      { businessId },
      options,
    );
  }

  async onModuleDestroy() {
    await this.queue?.close();
    await this.connection?.quit();
  }
}
