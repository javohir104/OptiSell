import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const WINDOW_MS = 15 * 60 * 1000;

const limitExceeded = (req, res) =>
  res.status(429).json({
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' },
  });

const common = {
  windowMs: WINDOW_MS,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: limitExceeded,
};

/** General limit for all /api routes. */
export const apiLimiter = rateLimit({ ...common, limit: env.RATE_LIMIT_MAX });

/** Login: only failed attempts count, to slow down password guessing. */
export const loginLimiter = rateLimit({
  ...common,
  limit: env.AUTH_RATE_LIMIT_MAX,
  skipSuccessfulRequests: true,
});

/** Registration: limits mass account creation from one IP. */
export const registerLimiter = rateLimit({ ...common, limit: env.AUTH_RATE_LIMIT_MAX });

/** Public page-view / heartbeat tracking (per IP). */
export const trackLimiter = rateLimit({ ...common, windowMs: 60 * 1000, limit: 120 });

/** Telegram → browser Google sign-in links (each holds a little memory for 10 minutes). */
export const handoffLimiter = rateLimit({ ...common, limit: 30 });
