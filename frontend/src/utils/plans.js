/** Same plans as backend/src/config/plans.js (used for labels, prices and locked features). */
export const PLANS = {
  free: { id: 'free', pricePerMonth: 0, limits: { products: 15, staff: 0 }, features: [] },
  pro: { id: 'pro', pricePerMonth: 49000, limits: { products: 35, staff: 0 }, features: ['expenses', 'analytics', 'debts', 'suppliers'] },
  max: { id: 'max', pricePerMonth: 99000, limits: { products: null, staff: 10 }, features: ['expenses', 'analytics', 'debts', 'suppliers', 'staff', 'telegram'] },
};

export const DURATIONS = { 1: 0, 3: 0.1, 6: 0.15, 12: 0.25 };

export const priceFor = (plan, months) =>
  Math.round((PLANS[plan].pricePerMonth * months * (1 - DURATIONS[months])) / 1000) * 1000;

export const PLAN_LABEL = { free: 'Free', pro: 'Pro', max: 'Max' };

/** Cheapest plan that has a feature. */
export const planFor = (feature) => (PLANS.pro.features.includes(feature) ? 'pro' : 'max');

/** Does the signed-in user's current plan include `feature`? (The backend re-checks every call.) */
export function hasFeature(user, feature) {
  const list = user?.subscription?.features;
  if (Array.isArray(list)) return list.includes(feature);
  return PLANS[user?.subscription?.plan || 'free']?.features.includes(feature) ?? false;
}

export const isStaff = (user) => user?.role === 'staff';

/** Days left until `iso` (rounded up), or null. */
export function daysLeft(iso) {
  if (!iso) return null;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}
