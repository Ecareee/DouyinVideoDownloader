import IORedis from 'ioredis';
import { Queue } from 'bullmq';

export const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null
});
export const queue = new Queue('monitor', { connection: redis });