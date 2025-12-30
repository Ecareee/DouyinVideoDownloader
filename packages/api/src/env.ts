import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().default(2012),
  REDIS_URL: z.string().default('redis://localhost:6379')
});

export const env = EnvSchema.parse(process.env);