import IORedis from 'ioredis';

export function createRedisConnection() {
  const options = { maxRetriesPerRequest: null };

  if (process.env.REDIS_URL) {
    return new IORedis(process.env.REDIS_URL, options);
  }

  return new IORedis({
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? 6379),
    maxRetriesPerRequest: null,
  });
}
