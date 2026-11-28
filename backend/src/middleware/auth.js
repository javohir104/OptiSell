import { hasFeature, planFor } from '../config/plans.js';
import { now, update } from '../db/store.js';
import { AppError } from '../utils/AppError.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { findUser, isStaff, ownerOf, toPublicUser } from '../services/user.shared.js';

const BEARER = /^Bearer ([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*)$/;
const UUID = /^[0-9a-f-]{36}$/i;

/** Verify the Bearer token; returns the user id (sub) or throws 401. */
function tokenSubject(req) {
  const match = BEARER.exec(req.get('authorization') ?? '');
  if (!match) {
    throw AppError.unauthorized('Missing or malformed Authorization header');
  }
  let payload;
  try {
    payload = verifyAccessToken(match[1]);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new AppError(401, 'TOKEN_EXPIRED', 'Access token has expired');
    }
    throw AppError.unauthorized('Invalid access token');
  }
  if (typeof payload.sub !== 'string' || !UUID.test(payload.sub)) {
    throw AppError.unauthorized('Invalid access token');
  }
  return payload.sub;
}

// --------------------------------------------------------------------------- activity
// "Last active" for the admin panel: saved at most once per user per minute.
const ACTIVITY_THROTTLE_MS = 60_000;

export function touchActivity(user) {
  if (user.last_active_at && Date.now() - Date.parse(user.last_active_at) < ACTIVITY_THROTTLE_MS) return;
  update('users', user, { last_active_at: now() }, { touch: false });
}

/**
 * Requires "Authorization: Bearer <jwt>".
 * Also confirms the user still exists, so tokens of deleted accounts stop working immediately.
 *
 * Sets:
 *   req.profile — the signed-in account as the API shows it (staff see their own name/email)
 *   req.user    — the same, but `id` is the DATA OWNER: the shop owner for seller (staff) accounts.
 *                 Every data service is called with req.user.id, so staff work on the owner's shop.
 *   req.actor   — { id, full_name, is_staff } of the person actually making the request
 */
export async function requireAuth(req, res, next) {
  const actor = findUser(tokenSubject(req));
  if (!actor) throw AppError.unauthorized('Invalid access token');
  const owner = ownerOf(actor);
  if (!owner || actor.is_active === false) {
    throw new AppError(401, 'ACCOUNT_DISABLED', 'This account has been disabled');
  }
  if (isStaff(actor) && !hasFeature(owner, 'staff')) {
    throw new AppError(401, 'STAFF_PLAN_EXPIRED', "The shop's plan no longer includes seller accounts");
  }
  req.profile = toPublicUser(actor);
  req.user = { ...req.profile, id: owner.id };
  req.actor = { id: actor.id, full_name: actor.full_name, is_staff: isStaff(actor) };
  if (req.actor.is_staff) hideCostsFromStaff(res);
  touchActivity(actor);
  next();
}

/** Seller accounts cannot use owner-only endpoints (reports, expenses, settings, ...). */
export function ownerOnly(req, res, next) {
  if (req.actor?.is_staff) {
    throw new AppError(403, 'STAFF_FORBIDDEN', 'Only the shop owner can do this');
  }
  next();
}

/** Plan gate: 403 PLAN_FEATURE_LOCKED when the owner's current plan does not include `feature`. */
export const requireFeature = (feature) => (req, res, next) => {
  const owner = findUser(req.user.id);
  if (!hasFeature(owner, feature)) {
    const plan = planFor(feature);
    throw new AppError(
      403,
      'PLAN_FEATURE_LOCKED',
      `This feature is available on the ${plan === 'pro' ? 'Pro' : 'Max'} plan. Upgrade your plan to use it.`,
      { feature, required_plan: plan },
    );
  }
  next();
};

// Purchase prices and profit are the owner's business: sellers never receive them.
const HIDDEN_FOR_STAFF = new Set([
  'cost_price', 'unit_cost', 'total_cost', 'line_cost', 'gross_profit', 'cogs', 'stock_value_cost',
]);

function stripCosts(value) {
  if (Array.isArray(value)) return value.map(stripCosts);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).filter(([k]) => !HIDDEN_FOR_STAFF.has(k)).map(([k, v]) => [k, stripCosts(v)]),
    );
  }
  return value;
}

function hideCostsFromStaff(res) {
  const json = res.json.bind(res);
  res.json = (body) => json(stripCosts(body));
}

/**
 * Admin API guard: the normal sign-in token AND role = 'admin' in the database right now.
 * The role is read from the DB on every request (never from the token or the browser), so a user
 * cannot get in by showing the hidden menu item or editing storage, and revoking the role takes
 * effect on the next request.
 *   no / bad token -> 401, signed in but not admin -> 403
 */
export async function requireAdmin(req, res, next) {
  const user = findUser(tokenSubject(req));
  if (!user) throw AppError.unauthorized('Invalid access token');
  if (user.role !== 'admin') throw new AppError(403, 'ADMIN_ONLY', 'Admin access required');
  req.admin = { id: user.id, email: user.email, full_name: user.full_name, role: user.role, created_at: user.created_at };
  touchActivity(user);
  next();
}

/**
 * Optional user auth for public endpoints: sets req.user = { id, role } when a valid user token is
 * present, otherwise continues anonymously (never fails).
 */
export async function optionalAuth(req, res, next) {
  if (!req.get('authorization')) return next();
  try {
    const user = findUser(tokenSubject(req));
    if (user) {
      req.user = { id: user.id, role: user.role };
      touchActivity(user);
    }
  } catch {
    // anonymous
  }
  return next();
}
