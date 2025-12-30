import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './env.js';

export const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const monitorQueue = new Queue('monitor', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: 200,
    removeOnFail: 200
  }
});