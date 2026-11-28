import { env } from '../config/env.js';
import { DURATIONS, PAID_PLANS, PLANS, effectivePlan, limitsOf, priceFor } from '../config/plans.js';
import { db, findById, insert, now, update } from '../db/store.js';
import { AppError } from '../utils/AppError.js';
import { addMonths } from '../utils/dates.js';
import { clickCheckoutUrl, clickConfigured } from './payments/click.js';
import { paymeCheckoutUrl, paymeConfigured } from './payments/payme.js';
import { findUser } from './user.shared.js';
import { onPlanPaid } from './bonus.service.js';

/* ------------------------------------------------------------------ plans */

export function listPlans() {
  return {
    plans: Object.values(PLANS).map((p) => ({
      id: p.id,
      price_per_month: p.price,
      limits: p.limits,
      features: p.features,
      prices: p.price
        ? Object.fromEntries(Object.keys(DURATIONS).map((m) => [m, priceFor(p.id, Number(m))]))
        : null,
    })),
    durations: Object.keys(DURATIONS).map(Number),
    purchasing_enabled: env.PAYMENTS_ENABLED,
    providers: {
      click: env.PAYMENTS_ENABLED && clickConfigured(),
      payme: env.PAYMENTS_ENABLED && paymeConfigured(),
      test: env.PAYMENTS_ENABLED && env.PAYMENTS_TEST_MODE,
    },
    currency: 'UZS',
  };
}

const activeProductCount = (userId) => db.products.filter((p) => p.user_id === userId && p.is_active).length;

export async function getSubscription(user) {
  const staff = db.users.filter((u) => u.role === 'staff' && u.owner_id === user.id).length;
  return { ...user.subscription, usage: { products: activeProductCount(user.id), staff } };
}

/* ------------------------------------------------------------------ limits */

/** Throws when the user's plan does not allow `adding` more active products. */
export function assertProductCapacity(userId, adding = 1) {
  const user = findUser(userId);
  const { products: limit } = limitsOf(user);
  if (limit === null) return;
  if (activeProductCount(userId) + adding > limit) {
    throw new AppError(
      403,
      'PLAN_LIMIT_PRODUCTS',
      `Your ${effectivePlan(user)} plan allows up to ${limit} products. Upgrade your plan to add more.`,
      { plan: effectivePlan(user), limit },
    );
  }
}

/* ------------------------------------------------------------------ payments */

const toPayment = (p) => ({
  id: p.id,
  order_no: p.order_no,
  plan: p.plan,
  months: p.months,
  amount: p.amount,
  provider: p.provider,
  status: p.status,
  paid_at: p.paid_at,
  created_at: p.created_at,
});

/** Short numeric order number that Click / Payme see. */
const nextOrderNo = () => db.payments.reduce((max, p) => Math.max(max, p.order_no), 0) + 1;

export const findPayment = (match) => db.payments.find(match) ?? null;

export async function createCheckout(userId, { plan, months, provider }) {
  if (!env.PAYMENTS_ENABLED) {
    throw new AppError(503, 'PAYMENTS_NOT_INTEGRATED', "To'lov tizimi hali ulanmagan. Tarifni hozircha sotib olib bo'lmaydi.");
  }
  if (!PAID_PLANS.includes(plan)) throw AppError.badRequest('Unknown plan');
  const amount = priceFor(plan, months);
  if (!amount) throw AppError.badRequest('Unknown subscription period');

  const enabled = { click: clickConfigured(), payme: paymeConfigured(), test: env.PAYMENTS_TEST_MODE };
  if (!enabled[provider]) {
    throw new AppError(400, 'PROVIDER_DISABLED', `${provider} payments are not configured on this server`);
  }

  const time = now();
  const payment = insert('payments', {
    order_no: nextOrderNo(),
    user_id: userId,
    plan,
    months,
    amount: amount.toFixed(2),
    provider,
    status: 'pending',
    provider_txn_id: null,
    provider_state: null,
    txn_create_time: null,
    txn_perform_time: null,
    txn_cancel_time: null,
    cancel_reason: null,
    paid_at: null,
    created_at: time,
    updated_at: time,
  });

  if (provider === 'test') {
    markPaid(payment.id);
    return { payment: toPayment(payment), checkout_url: null };
  }

  const returnUrl = `${env.PAYMENTS_RETURN_URL}${env.PAYMENTS_RETURN_URL.includes('?') ? '&' : '?'}payment=${payment.id}`;
  const checkout_url =
    provider === 'click'
      ? clickCheckoutUrl({ orderNo: payment.order_no, amount, returnUrl })
      : paymeCheckoutUrl({ orderNo: payment.order_no, amount, returnUrl });
  return { payment: toPayment(payment), checkout_url };
}

export async function getPayment(userId, paymentId) {
  const p = findPayment((x) => x.id === paymentId && x.user_id === userId);
  if (!p) throw AppError.notFound('Payment not found');
  return toPayment(p);
}

export async function listPayments(userId) {
  return db.payments
    .filter((p) => p.user_id === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 50)
    .map(toPayment);
}

/**
 * Mark a pending payment paid and extend the user's plan. Idempotent: a payment that is already
 * paid changes nothing. Buying the plan you already have adds the months to the current end date;
 * switching plan starts the new period now.
 */
export function markPaid(paymentId) {
  const payment = findById('payments', paymentId);
  if (!payment || payment.status !== 'pending') return false;
  const time = now();
  update('payments', payment, { status: 'paid', paid_at: time });

  const user = findUser(payment.user_id);
  if (user) {
    const stillActive = user.plan === payment.plan && user.plan_expires_at && user.plan_expires_at > time;
    update('users', user, {
      plan: payment.plan,
      plan_expires_at: addMonths(stillActive ? user.plan_expires_at : time, payment.months),
    });
  }
  onPlanPaid(payment);
  return true;
}
