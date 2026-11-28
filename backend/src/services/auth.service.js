import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { TRIAL_MONTHS, TRIAL_PLAN, hasFeature } from '../config/plans.js';
import { insert, now } from '../db/store.js';
import { AppError } from '../utils/AppError.js';
import { addMonths } from '../utils/dates.js';
import { signAccessToken, tokenExpiresIn } from '../utils/jwt.js';
import { findUserByEmail, isStaff, ownerOf, toPublicUser } from './user.shared.js';
import { referrerFor } from './bonus.service.js';

// Compared against when the email does not exist, so a login for an unknown email
// takes the same time as a wrong password (prevents user enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('optisell-timing-equalizer', env.BCRYPT_ROUNDS);

export function authResult(row) {
  const user = toPublicUser(row);
  const token = signAccessToken(user.id);
  return { user, token, token_type: 'Bearer', expires_in: tokenExpiresIn(token) };
}

/** Create a user row. Throws EMAIL_TAKEN when the email is already registered. */
export function createUser(fields) {
  if (findUserByEmail(fields.email)) {
    throw AppError.conflict('An account with this email already exists', undefined, 'EMAIL_TAKEN');
  }
  const time = now();
  return insert('users', {
    first_name: null,
    last_name: null,
    phone: null,
    avatar_url: null,
    business_name: null,
    plan: 'free',
    plan_expires_at: null,
    trial_used: false,
    google_id: null,
    role: 'user',
    is_test_account: false,
    last_active_at: null,
    created_at: time,
    updated_at: time,
    ...fields,
  });
}

export async function register({ email, password, full_name, first_name, last_name, business_name, referral_code }) {
  const password_hash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  // Every new account starts with a free month of Pro.
  const user = createUser({
    email,
    password_hash,
    full_name,
    first_name: first_name ?? full_name,
    last_name: last_name ?? null,
    business_name: business_name ?? null,
    plan: TRIAL_PLAN,
    plan_expires_at: addMonths(now(), TRIAL_MONTHS),
    trial_used: true,
    referred_by: referrerFor(referral_code)?.id ?? null,
  });
  return authResult(user);
}

export async function login({ email, password }) {
  const row = findUserByEmail(email);
  const valid = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !valid) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  assertCanSignIn(row);
  return authResult(row);
}

/**
 * Sellers can sign in only while their account is on and the shop's plan includes sellers.
 * (Checked again on every request by requireAuth.)
 */
export function assertCanSignIn(row) {
  if (row.is_active === false) throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled by the shop owner');
  if (isStaff(row)) {
    const owner = ownerOf(row);
    if (!owner) throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled');
    if (!hasFeature(owner, 'staff')) {
      throw new AppError(403, 'STAFF_PLAN_EXPIRED', "The shop's plan no longer includes seller accounts. Ask the owner to renew Max.");
    }
  }
}
