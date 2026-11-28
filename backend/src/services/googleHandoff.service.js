/**
 * Google sign-in for the Telegram Mini App.
 *
 * Google blocks its sign-in inside embedded webviews (Telegram included), so the Mini App:
 *   1. POST /auth/google/handoff          -> { id, secret }   (kept only inside the Mini App)
 *   2. opens <site>/tg-google?h=<id> in the phone's real browser (Telegram.WebApp.openLink)
 *   3. the browser signs in with Google:  POST /auth/google { credential, handoff: id }
 *      -> the session is parked under `id`; the browser itself gets no token
 *   4. the Mini App polls POST /auth/google/handoff/claim { id, secret } and receives the session once.
 *
 * Only the `id` appears in a URL; the `secret` never leaves the Mini App, so someone who sees the
 * link (browser history, a shared screenshot) cannot take the session. Entries live in memory for
 * 10 minutes (the backend is a single process, see db/store.js).
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError } from '../utils/AppError.js';

const TTL_MS = 10 * 60 * 1000;
const MAX_PENDING = 5000;

/** id -> { secretHash: Buffer, expiresAt: number, result: object | null } */
const pending = new Map();

const sha256 = (s) => createHash('sha256').update(s).digest();

function sweep() {
  const t = Date.now();
  for (const [id, h] of pending) if (h.expiresAt <= t) pending.delete(id);
}

function live(id) {
  const h = pending.get(id);
  if (!h) return null;
  if (h.expiresAt <= Date.now()) { pending.delete(id); return null; }
  return h;
}

const expired = () => new AppError(410, 'HANDOFF_EXPIRED', 'This sign-in link has expired, please try again');

export function startHandoff() {
  sweep();
  if (pending.size >= MAX_PENDING) throw new AppError(503, 'HANDOFF_BUSY', 'Too many sign-ins in progress, try again shortly');
  const id = randomBytes(16).toString('base64url');
  const secret = randomBytes(32).toString('base64url');
  pending.set(id, { secretHash: sha256(secret), expiresAt: Date.now() + TTL_MS, result: null });
  return { id, secret, expires_in: TTL_MS / 1000 };
}

/** Check the link before the browser spends a Google sign-in on it. */
export function assertHandoffOpen(id) {
  const h = live(id);
  if (!h || h.result) throw expired();
}

/** The browser finished Google sign-in: park the session for the Mini App. */
export function completeHandoff(id, result) {
  const h = live(id);
  if (!h || h.result) throw expired();
  h.result = result;
}

/** Mini App polling. Returns null while the user is still signing in. */
export function claimHandoff({ id, secret }) {
  const h = live(id);
  if (!h || !timingSafeEqual(h.secretHash, sha256(secret))) throw expired();
  if (!h.result) return null;
  pending.delete(id); // one-time
  return h.result;
}

/** Tests only. */
export function clearHandoffs() {
  pending.clear();
}
