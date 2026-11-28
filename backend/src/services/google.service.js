/**
 * "Sign in with Google". The browser gets an ID token (JWT) from Google Identity Services and sends
 * it here; we verify its signature, audience (our GOOGLE_CLIENT_ID), issuer and expiry with Google's
 * public keys. Only a verified Google email is trusted.
 */
import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import { TRIAL_MONTHS, TRIAL_PLAN } from '../config/plans.js';
import { db, now, update } from '../db/store.js';
import { AppError } from '../utils/AppError.js';
import { addMonths } from '../utils/dates.js';
import { authResult, createUser, assertCanSignIn } from './auth.service.js';
import { referrerFor } from './bonus.service.js';
import { findUserByEmail } from './user.shared.js';

const client = new OAuth2Client();

async function verifyWithGoogle(idToken) {
  const ticket = await client.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
  return ticket.getPayload();
}

let verify = verifyWithGoogle;
/** Tests only: replace the Google verification. */
export function setGoogleVerifier(fn) {
  verify = fn ?? verifyWithGoogle;
}

export async function googleLogin({ credential, referralCode }) {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new AppError(503, 'GOOGLE_DISABLED', 'Google sign-in is not configured');
  }

  let payload;
  try {
    payload = await verify(credential);
  } catch {
    throw new AppError(401, 'INVALID_GOOGLE_TOKEN', 'Google sign-in failed, please try again');
  }
  const email = String(payload?.email ?? '').trim().toLowerCase();
  if (!payload?.sub || !email || payload.email_verified !== true) {
    throw new AppError(401, 'INVALID_GOOGLE_TOKEN', 'Your Google email is not verified');
  }

  // 1) already linked  2) same (verified) email registered with a password -> link it  3) new account
  let row = db.users.find((u) => u.google_id === payload.sub) ?? null;
  if (!row) {
    row = findUserByEmail(email);
    if (row) {
      if (row.google_id && row.google_id !== payload.sub) {
        throw AppError.conflict('This email is linked to another Google account', undefined, 'GOOGLE_MISMATCH');
      }
      row = update('users', row, { google_id: payload.sub, ...(row.avatar_url ? {} : { avatar_url: payload.picture ?? null }) });
    }
  }

  let created = false;
  if (!row) {
    const fullName = String(payload.name || email.split('@')[0]).trim().slice(0, 100);
    // Same as normal registration: role 'user' and a free month of Pro. No password (Google only).
    row = createUser({
      email,
      password_hash: null,
      google_id: payload.sub,
      full_name: fullName,
      first_name: String(payload.given_name || fullName).slice(0, 100),
      last_name: payload.family_name ? String(payload.family_name).slice(0, 100) : null,
      avatar_url: payload.picture ?? null,
      plan: TRIAL_PLAN,
      plan_expires_at: addMonths(now(), TRIAL_MONTHS),
      trial_used: true,
      referred_by: referrerFor(referralCode)?.id ?? null,
    });
    created = true;
  }
  assertCanSignIn(row);
  return { ...authResult(row), created };
}
