import IORedis from 'ioredis';
import { Logger } from '@nestjs/common';

const logger = new Logger('RedisConnection');

export function createRedisConnection() {
  const options = { maxRetriesPerRequest: null as null };

  const connection = process.env.REDIS_URL
    ? new IORedis(process.env.REDIS_URL, options)
    : new IORedis({
        host: process.env.REDIS_HOST ?? '127.0.0.1',
        port: Number(process.env.REDIS_PORT ?? 6379),
        maxRetriesPerRequest: null,
      });

  // Prevent unhandled 'error' events from crashing the process before BullMQ
  // attaches its own listener. BullMQ will override this with richer handling.
  connection.on('error', (err: Error) => {
    logger.error(`Redis connection error: ${err.message}`);
  });

  return connection;
}
