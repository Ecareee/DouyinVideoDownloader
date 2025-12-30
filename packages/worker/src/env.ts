import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  WORKER_CONCURRENCY: z.coerce.number().default(5),
  WORKER_POLL_INTERVAL_SECONDS: z.coerce.number().default(60),
  ARTIFACTS_DIR: z.string().default('./artifacts')
});

export const env = EnvSchema.parse(process.env);