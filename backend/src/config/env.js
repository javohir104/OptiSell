import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),

  // PostgreSQL connection string. Set it on Render (or any host whose disk is wiped on deploy):
  // data then lives in Postgres and survives every push / redeploy. Empty = JSON files in DATA_DIR.
  DATABASE_URL: z.string().trim().default(''),

  // Folder with the JSON data files (users.json, products.json, ...). Default: backend/data
  DATA_DIR: z
    .string()
    .default('')
    .transform((v) => (v.trim() ? path.resolve(BACKEND_DIR, v.trim()) : path.join(BACKEND_DIR, 'data'))),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1d'),

  // Admin panel account. Applied on every server start: the account is created (or its password
  // updated) with role 'admin'. Both empty = no admin from .env (use `npm run admin -- grant`).
  ADMIN_EMAIL: z
    .string()
    .trim()
    .toLowerCase()
    .default('')
    .refine((v) => v === '' || z.email().safeParse(v).success, 'ADMIN_EMAIL must be a valid email'),
  ADMIN_PASSWORD: z
    .string()
    .default('')
    .refine((v) => v === '' || (v.length >= 12 && Buffer.byteLength(v, 'utf8') <= 72), 'ADMIN_PASSWORD must be 12-72 characters'),

  // OAuth client ID from Google Cloud Console ("Sign in with Google"). Empty = Google sign-in off.
  GOOGLE_CLIENT_ID: z.string().trim().default(''),

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

  // --- Subscriptions & payments (see src/services/payments/*.js) ---
  // Master switch for buying plans. false = plans are shown but cannot be bought ("not integrated yet");
  // POST /api/billing/checkout answers 503. Turn on only after Click / Payme are really connected.
  PAYMENTS_ENABLED: bool,
  // Where Click / Payme send the user back after paying (the frontend billing page).
  PAYMENTS_RETURN_URL: z.string().default('http://localhost:5173/billing'),
  // "Test payment" button that activates a plan without real money. Never enable on a public server.
  PAYMENTS_TEST_MODE: z.enum(['true', 'false', '']).default('').transform((v) => v === 'true'),
  // Click (https://docs.click.uz). Empty = Click button hidden.
  CLICK_SERVICE_ID: z.string().default(''),
  CLICK_MERCHANT_ID: z.string().default(''),
  CLICK_SECRET_KEY: z.string().default(''),
  // Payme (https://developer.help.paycom.uz). Empty = Payme button hidden.
  PAYME_MERCHANT_ID: z.string().default(''),
  PAYME_KEY: z.string().default(''),
  PAYME_TEST: bool,

  // --- Backups (backend/data/backups) ---
  BACKUP_INTERVAL_HOURS: z.coerce.number().positive().max(24 * 7).default(24),
  BACKUP_KEEP: z.coerce.number().int().min(1).max(365).default(14),

  // --- Telegram notifications (daily report, low-stock alerts) ---
  // Same bot token as telegram-bot/.env. Empty = notifications off.
  TELEGRAM_BOT_TOKEN: z.string().trim().default(''),
  // Bot username without @ (for the "Connect Telegram" link), e.g. OptiSellBot
  TELEGRAM_BOT_USERNAME: z.string().trim().default('').transform((v) => v.replace(/^@/, '')),
  // Shared secret: the bot sends it when it links a chat to an account. Same value in telegram-bot/.env.
  TELEGRAM_LINK_SECRET: z.string().trim().default(''),
  // Local hour (APP_TIMEZONE) when the daily report is sent.
  DAILY_REPORT_HOUR: z.coerce.number().int().min(0).max(23).default(21),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

if (Boolean(parsed.data.ADMIN_EMAIL) !== Boolean(parsed.data.ADMIN_PASSWORD)) {
  console.error('Invalid environment configuration:\n  - set both ADMIN_EMAIL and ADMIN_PASSWORD, or neither');
  process.exit(1);
}

// Extra checks for a public server: placeholder secrets from .env.example must never go live.
if (parsed.data.NODE_ENV === 'production') {
  const problems = [];
  if (/CHANGE_ME|replace|example|secret/i.test(parsed.data.JWT_SECRET)) {
    problems.push(`JWT_SECRET is still a placeholder. Generate one: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`);
  }
  if (!parsed.data.CORS_ORIGINS.length) problems.push('CORS_ORIGINS is empty: set it to the frontend URL, e.g. https://optisell.vercel.app');
  if (/CHANGE_ME/.test(parsed.data.ADMIN_PASSWORD)) problems.push('ADMIN_PASSWORD is still the CHANGE_ME placeholder');
  if (parsed.data.PAYMENTS_TEST_MODE) problems.push('PAYMENTS_TEST_MODE=true lets anyone activate a paid plan for free');
  if (problems.length) {
    console.error('Unsafe production configuration:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
}

export const env = Object.freeze(parsed.data);
