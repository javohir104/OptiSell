import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: bool,
  // Kill any single SQL statement that runs longer than this (protects against slow-query DoS).
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1d'),

  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),

  BCRYPT_ROUNDS: z.coerce.number().int().min(8).max(14).default(10),

  // Business timezone used for "today", daily/weekly/monthly buckets and date filters.
  APP_TIMEZONE: z
    .string()
    .default('Asia/Tashkent')
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'APP_TIMEZONE must be a valid IANA timezone, e.g. Asia/Tashkent'),

  // Rate limits (requests per 15-minute window per IP).
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

  // Number of reverse proxies in front of the app (0 = none). Only set this when
  // actually behind a proxy, otherwise clients can spoof X-Forwarded-For to bypass rate limits.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
