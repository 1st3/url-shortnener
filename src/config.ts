import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3005),
  HOST: z.string().default('0.0.0.0'),
  BASE_URL: z.string().url().default('https://brzl.ca'),
  DEFAULT_FALLBACK_URL: z.string().url().default('https://brasileiro.ca'),
  ADMIN_API_KEY: z.string().min(8, 'ADMIN_API_KEY must be at least 8 characters long').default('dev-admin-secret-key-12345'),
  DB_PATH: z.string().default('./data/shortener.db'),
  ANALYTICS_RETENTION_DAYS: z.coerce.number().default(90),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
