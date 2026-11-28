/**
 * Subscription plans, their limits and the features they unlock. `null` limit = unlimited.
 * Prices are in so'm per month; longer periods get a discount.
 *
 * Features:
 *   expenses   — expenses page / API
 *   analytics  — analytics page (top products, categories)
 *   debts      — customers and nasiya (sales on credit, debt payments)
 *   suppliers  — suppliers, purchases (stock arrivals) and supplier debts
 *   staff      — seller accounts with restricted access
 *   telegram   — daily report and low-stock alerts in Telegram
 */
export const FEATURES = Object.freeze(['expenses', 'analytics', 'debts', 'suppliers', 'staff', 'telegram']);

export const PLANS = Object.freeze({
  free: { id: 'free', price: 0, limits: { products: 15, staff: 0 }, features: [] },
  pro: {
    id: 'pro',
    price: 49_000,
    limits: { products: 35, staff: 0 },
    features: ['expenses', 'analytics', 'debts', 'suppliers'],
  },
  max: {
    id: 'max',
    price: 99_000,
    limits: { products: null, staff: 10 },
    features: [...FEATURES],
  },
});

export const PAID_PLANS = ['pro', 'max'];

/** Months -> discount share. */
export const DURATIONS = Object.freeze({ 1: 0, 3: 0.1, 6: 0.15, 12: 0.25 });

/** Free Pro period every new account gets once. */
export const TRIAL_PLAN = 'pro';
export const TRIAL_MONTHS = 1;

/** Total price in so'm, rounded to 1 000. */
export function priceFor(plan, months) {
  const p = PLANS[plan];
  if (!p || !p.price || DURATIONS[months] === undefined) return null;
  return Math.round((p.price * months * (1 - DURATIONS[months])) / 1000) * 1000;
}

/**
 * Plan that is in force right now ("free" once a paid plan has expired).
 * The admin (role 'admin', set only from backend/.env) always has everything: Max, no expiry.
 */
export function effectivePlan(user) {
  if (user?.role === 'admin') return 'max';
  if (!user || user.plan === 'free' || !user.plan) return 'free';
  const expires = user.plan_expires_at ? new Date(user.plan_expires_at).getTime() : 0;
  return expires > Date.now() ? user.plan : 'free';
}

export const limitsOf = (user) => PLANS[effectivePlan(user)].limits;
export const featuresOf = (user) => PLANS[effectivePlan(user)].features;
export const hasFeature = (user, feature) => featuresOf(user).includes(feature);

/** Cheapest plan that unlocks a feature (for "upgrade to ..." messages). */
export const planFor = (feature) => PAID_PLANS.find((id) => PLANS[id].features.includes(feature)) ?? 'max';
