/**
 * "Forgot password".
 *
 *   1. POST /auth/password/forgot { email }  -> a 6-digit code is sent to the account's linked
 *      Telegram chat (the answer never says whether the email exists).
 *   2. POST /auth/password/reset { email, code, new_password }
 *
 * Accounts without Telegram: support (or the admin panel) creates a one-time reset link:
 *   POST /admin/users/:id/reset-link -> /reset-password?token=...   (24 h, single use)
 *
 * Codes and tokens are stored only as SHA-256 hashes; a code allows 5 wrong tries.
 */
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { update } from '../db/store.js';
import { AppError } from '../utils/AppError.js';
import { sendTelegramText } from './telegram.service.js';
import { findUser, findUserByEmail } from './user.shared.js';

const CODE_TTL_MS = 15 * 60_000;
const LINK_TTL_MS = 24 * 3_600_000;
const MAX_TRIES = 5;

const sha = (s) => createHash('sha256').update(String(s)).digest('hex');
const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const TEXT = {
  uz: (c) => `🔐 OptiSell parolini tiklash kodi: <b>${c}</b>\n\n15 daqiqa amal qiladi. Agar siz so'ramagan bo'lsangiz, bu xabarni e'tiborsiz qoldiring.`,
  ru: (c) => `🔐 Код для сброса пароля OptiSell: <b>${c}</b>\n\nДействует 15 минут. Если вы не запрашивали — просто проигнорируйте.`,
  en: (c) => `🔐 Your OptiSell password reset code: <b>${c}</b>\n\nValid for 15 minutes. If you didn't ask for it, ignore this message.`,
};

/** Always resolves the same way, so the answer never reveals which emails are registered. */
export async function requestReset(email) {
  const user = findUserByEmail(email);
  if (user && user.telegram_chat_id && user.is_active !== false) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    update('users', user, {
      reset_code_hash: sha(code),
      reset_code_expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      reset_code_tries: 0,
    }, { touch: false });
    await sendTelegramText(user.telegram_chat_id, (TEXT[user.telegram_lang] ?? TEXT.uz)(code));
  }
  return { sent: true, channel: 'telegram' };
}

async function setPassword(user, password) {
  update('users', user, {
    password_hash: await bcrypt.hash(password, env.BCRYPT_ROUNDS),
    reset_code_hash: null, reset_code_expires_at: null, reset_code_tries: 0,
    reset_token_hash: null, reset_token_expires_at: null,
  });
}

const invalid = () => new AppError(400, 'INVALID_RESET_CODE', 'The code is wrong or has expired. Request a new one.');

export async function resetWithCode({ email, code, new_password }) {
  const user = findUserByEmail(email);
  if (!user?.reset_code_hash || !user.reset_code_expires_at || Date.parse(user.reset_code_expires_at) < Date.now()) throw invalid();
  if ((user.reset_code_tries ?? 0) >= MAX_TRIES) throw invalid();
  if (!same(sha(code), user.reset_code_hash)) {
    update('users', user, { reset_code_tries: (user.reset_code_tries ?? 0) + 1 }, { touch: false });
    throw invalid();
  }
  await setPassword(user, new_password);
  return { reset: true };
}

/** Admin / support: one-time link for an account that has no Telegram. */
export function createResetLink(userId) {
  const user = findUser(userId);
  if (!user) throw AppError.notFound('User not found');
  const token = randomBytes(24).toString('base64url');
  update('users', user, {
    reset_token_hash: sha(token),
    reset_token_expires_at: new Date(Date.now() + LINK_TTL_MS).toISOString(),
  }, { touch: false });
  return { path: `/reset-password?token=${token}`, expires_at: user.reset_token_expires_at };
}

export async function resetWithToken({ token, new_password }) {
  const hash = sha(token);
  const { db } = await import('../db/store.js');
  const user = db.users.find((u) => u.reset_token_hash && same(u.reset_token_hash, hash));
  if (!user || Date.parse(user.reset_token_expires_at) < Date.now()) {
    throw new AppError(400, 'INVALID_RESET_LINK', 'This link is invalid or has expired. Ask support for a new one.');
  }
  await setPassword(user, new_password);
  return { reset: true, email: user.email };
}
