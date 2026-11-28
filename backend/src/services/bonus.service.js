/**
 * Bonus points: referral rewards, daily revenue rewards and buying a plan with points.
 * The balance is never stored: it is the sum of the user's rows in points_ledger.
 * Every reward has a unique `key`, so it can never be given twice.
 */
import { randomBytes } from 'node:crypto';
import { ACTIVE_SHOP, BONUS } from '../config/bonus.js';
import { effectivePlan } from '../config/plans.js';
import { db, insert, now, update } from '../db/store.js';
import { AppError } from '../utils/AppError.js';
import { addDays, addMonths, localDay, today } from '../utils/dates.js';
import { cents } from '../utils/money.js';
import { findUser, isStaff } from './user.shared.js';

const isTest = process.env.NODE_ENV === 'test';

export const balanceOf = (userId) =>
  db.points_ledger.filter((r) => r.user_id === userId).reduce((s, r) => s + r.points, 0);

function award(userId, points, type, key, extra = {}) {
  if (db.points_ledger.some((r) => r.key === key)) return null;
  return insert('points_ledger', { user_id: userId, points, type, key, ...extra });
}

/* ------------------------------------------------------------------ referral codes */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode() {
  for (;;) {
    const bytes = randomBytes(7);
    const code = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
    if (!db.users.some((u) => u.referral_code === code)) return code;
  }
}

export function referralCodeOf(user) {
  if (!user.referral_code) update('users', user, { referral_code: newCode() }, { touch: false });
  return user.referral_code;
}

/** The inviter for a code typed at sign-up (null when unknown / staff / admin). */
export function referrerFor(code) {
  if (!code) return null;
  const u = db.users.find((x) => x.referral_code === String(code).trim().toUpperCase());
  return u && !isStaff(u) ? u : null;
}

/* ------------------------------------------------------------------ rewards */

function shopIsActive(user) {
  const products = db.products.filter((p) => p.user_id === user.id && p.is_active).length;
  const sales = db.sales.filter((s) => s.user_id === user.id && s.status === 'completed').length;
  return Boolean(user.business_name?.trim()) && products >= ACTIVE_SHOP.products && sales >= ACTIVE_SHOP.sales;
}

/** +15 to the inviter once the invited user has a real shop. Cheap; called after sales/products/profile changes. */
export function checkReferralActivation(userId) {
  const user = findUser(userId);
  if (!user?.referred_by || user.referral_activated_at) return;
  if (!shopIsActive(user)) return;
  update('users', user, { referral_activated_at: now() }, { touch: false });
  const inviter = findUser(user.referred_by);
  if (inviter) award(inviter.id, BONUS.REFERRAL_ACTIVE, 'referral_active', `ref-active:${user.id}`, { ref_user_id: user.id });
}

/**
 * A real (money) payment for Pro / Max:
 *   +30 / +50 to the buyer themselves, and
 *   +30 / +50 to the inviter, if the buyer was invited.
 * Plans bought with points or won in the contest earn nothing.
 */
export function onPlanPaid(payment) {
  if (payment.provider === 'points' || payment.provider === 'contest') return;
  const user = findUser(payment.user_id);
  if (!user) return;
  const max = payment.plan === 'max';
  award(user.id, max ? BONUS.SELF_MAX : BONUS.SELF_PRO, `plan_${payment.plan}`, `self-paid:${payment.id}`, { payment_id: payment.id });
  if (!user.referred_by) return;
  const points = max ? BONUS.REFERRAL_MAX : BONUS.REFERRAL_PRO;
  award(user.referred_by, points, `referral_${payment.plan}`, `ref-paid:${payment.id}`, { ref_user_id: user.id, payment_id: payment.id });
}

/** Revenue (so'm, completed sales after returns) of an owner's shop on a local day. */
function revenueOn(userId, day) {
  return db.sales
    .filter((s) => s.user_id === userId && s.status === 'completed' && localDay(s.sold_at) === day)
    .reduce((sum, s) => sum + cents(s.total_amount), 0) / 100;
}

/** +10 for every finished day (before today) with revenue over the threshold. */
export function awardDailyRevenue(days = BONUS.DAILY_REVENUE_LOOKBACK_DAYS) {
  const todayDay = today();
  let given = 0;
  for (const user of db.users.filter((u) => !isStaff(u))) {
    for (let i = 1; i <= days; i++) {
      const day = addDays(todayDay, -i);
      if (revenueOn(user.id, day) > BONUS.DAILY_REVENUE_THRESHOLD) {
        if (award(user.id, BONUS.DAILY_REVENUE, 'daily_revenue', `daily:${user.id}:${day}`, { day })) given += 1;
      }
    }
  }
  return given;
}

export function startBonusSchedule() {
  if (isTest) return;
  const run = (days) => {
    try {
      awardDailyRevenue(days);
      awardMonthlyWinner().catch((err) => console.error(`Contest job failed: ${err.message}`));
    } catch (err) { console.error(`Bonus job failed: ${err.message}`); }
  };
  run(BONUS.DAILY_REVENUE_LOOKBACK_DAYS);
  setInterval(() => run(2), 60 * 60_000).unref();
}

/* ------------------------------------------------------------------ monthly contest */

/** Month (YYYY-MM, business timezone) a points row counts for. Daily rewards count for their day. */
const rowMonth = (r) => (r.day ?? localDay(r.created_at)).slice(0, 7);
export const currentMonth = () => today().slice(0, 7);
export function previousMonth(month = currentMonth()) {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** Real shop owners only: no admins, sellers or test/demo accounts. */
const competes = (u) => u && u.role === 'user' && !u.is_test_account && u.is_active !== false;

/** Contest rank of the month: points EARNED in it (spending points does not lower the score). */
function standings(month) {
  const by = new Map();
  for (const r of db.points_ledger) {
    if (r.points <= 0 || r.type === 'admin' || rowMonth(r) !== month) continue;
    const cur = by.get(r.user_id) ?? { user_id: r.user_id, points: 0, reached_at: r.created_at };
    cur.points += r.points;
    if (r.created_at > cur.reached_at) cur.reached_at = r.created_at;
    by.set(r.user_id, cur);
  }
  return [...by.values()]
    .filter((x) => competes(findUser(x.user_id)))
    // more points first; on a tie, whoever got there first
    .sort((a, b) => b.points - a.points || a.reached_at.localeCompare(b.reached_at))
    .map((x, i) => ({ ...x, rank: i + 1 }));
}

function displayName(u) {
  if (u?.business_name?.trim()) return u.business_name.trim();
  const first = u?.first_name || String(u?.full_name || '').split(' ')[0] || '—';
  const last = u?.last_name || String(u?.full_name || '').split(' ')[1] || '';
  return last ? `${first} ${last[0]}.` : first;
}

const monthEndIso = (month) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1)).toISOString();
};

export function contest(userId, month = currentMonth()) {
  const list = standings(month);
  const me = list.find((x) => x.user_id === userId);
  const top = list.slice(0, BONUS.CONTEST_TOP).map((x) => ({
    rank: x.rank, name: displayName(findUser(x.user_id)), points: x.points, is_me: x.user_id === userId,
  }));
  const leader = list[0]?.points ?? 0;
  const tenth = list[BONUS.CONTEST_TOP - 1]?.points ?? 0;
  return {
    month,
    ends_at: monthEndIso(month),
    prize: { plan: BONUS.CONTEST_PRIZE_PLAN, months: BONUS.CONTEST_PRIZE_MONTHS },
    participants: list.length,
    top,
    me: {
      rank: me?.rank ?? null,
      points: me?.points ?? 0,
      to_first: me && me.rank === 1 ? 0 : Math.max(0, leader - (me?.points ?? 0) + 1),
      to_top: me && me.rank <= BONUS.CONTEST_TOP ? 0 : Math.max(0, tenth - (me?.points ?? 0) + 1),
      eligible: competes(findUser(userId)),
    },
    winners: db.contest_winners
      .slice()
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, 12)
      .map((w) => ({ month: w.month, name: displayName(findUser(w.user_id)), points: w.points, plan: w.prize_plan, is_me: w.user_id === userId })),
  };
}

/**
 * When a month is over, give its winner the prize (once). A winner whose Max is still running
 * gets the month added to Max, everyone else gets Pro.
 */
export async function awardMonthlyWinner(month = previousMonth()) {
  if (db.contest_winners.some((w) => w.month === month)) return null;
  const winner = standings(month)[0];
  if (!winner) return null;
  const user = findUser(winner.user_id);
  const time = now();
  const current = effectivePlan(user);
  const plan = current === 'max' ? 'max' : BONUS.CONTEST_PRIZE_PLAN;
  const stillActive = user.plan === plan && user.plan_expires_at && user.plan_expires_at > time;
  const expires = addMonths(stillActive ? user.plan_expires_at : time, BONUS.CONTEST_PRIZE_MONTHS);
  const orderNo = db.payments.reduce((max, p) => Math.max(max, p.order_no), 0) + 1;
  insert('payments', {
    order_no: orderNo, user_id: user.id, plan, months: BONUS.CONTEST_PRIZE_MONTHS, amount: '0.00', provider: 'contest',
    status: 'paid', provider_txn_id: null, provider_state: null, txn_create_time: null, txn_perform_time: null,
    txn_cancel_time: null, cancel_reason: null, paid_at: time, created_at: time, updated_at: time,
  });
  update('users', user, { plan, plan_expires_at: expires });
  const record = insert('contest_winners', { month, user_id: user.id, points: winner.points, prize_plan: plan, granted_at: time });
  if (user.telegram_chat_id) {
    const { sendTelegramText } = await import('./telegram.service.js');
    sendTelegramText(user.telegram_chat_id, `🏆 Tabriklaymiz! Siz ${month} oyining OptiSell konkursida 1-o'rinni egalladingiz (${winner.points} ball). Sizga 1 oy ${plan === 'max' ? 'Max' : 'Pro'} sovg'a qilindi!`).catch(() => {});
  }
  return record;
}

/* ------------------------------------------------------------------ buying a plan with points */

export function redeem(userId, plan) {
  const user = findUser(userId);
  const price = BONUS.PRICE[plan];
  if (!price) throw AppError.badRequest('Unknown plan');
  const balance = balanceOf(userId);
  if (balance < price) {
    throw new AppError(400, 'NOT_ENOUGH_POINTS', `You need ${price} points (you have ${balance})`, { balance, price });
  }
  const current = effectivePlan(user);
  if (current === 'max' && plan === 'pro' && user.role !== 'admin') {
    throw new AppError(409, 'HIGHER_PLAN_ACTIVE', 'Your Max plan is still active. Take Max with points, or wait until it ends.');
  }

  const time = now();
  const stillActive = user.plan === plan && user.plan_expires_at && user.plan_expires_at > time;
  const expires = addMonths(stillActive ? user.plan_expires_at : time, BONUS.REDEEM_MONTHS);
  const orderNo = db.payments.reduce((max, p) => Math.max(max, p.order_no), 0) + 1;
  const payment = insert('payments', {
    order_no: orderNo, user_id: userId, plan, months: BONUS.REDEEM_MONTHS, amount: '0.00', provider: 'points',
    status: 'paid', provider_txn_id: null, provider_state: null, txn_create_time: null, txn_perform_time: null,
    txn_cancel_time: null, cancel_reason: null, paid_at: time, created_at: time, updated_at: time,
  });
  insert('points_ledger', { user_id: userId, points: -price, type: `redeem_${plan}`, key: `redeem:${payment.id}`, payment_id: payment.id });
  update('users', user, { plan, plan_expires_at: expires });
  return { plan, expires_at: expires, balance: balanceOf(userId) };
}

/* ------------------------------------------------------------------ overview */

const maskName = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts.map((p) => `${p[0]}${'•'.repeat(Math.max(1, Math.min(4, p.length - 1)))}`).join(' ') : '—';
};

export function overview(userId) {
  const user = findUser(userId);
  const history = db.points_ledger
    .filter((r) => r.user_id === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 100)
    .map((r) => ({
      id: r.id, type: r.type, points: r.points, day: r.day ?? null, created_at: r.created_at,
      friend: r.ref_user_id ? maskName(findUser(r.ref_user_id)?.full_name) : null,
    }));
  const referrals = db.users
    .filter((u) => u.referred_by === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((u) => {
      const earned = db.points_ledger.filter((r) => r.user_id === userId && r.ref_user_id === u.id).reduce((s, r) => s + r.points, 0);
      return {
        name: maskName(u.full_name),
        business: u.business_name ? maskName(u.business_name) : null,
        joined_at: u.created_at,
        active: Boolean(u.referral_activated_at),
        plan: effectivePlan(u),
        points_earned: earned,
      };
    });
  return {
    balance: balanceOf(userId),
    referral_code: referralCodeOf(user),
    today_revenue: revenueOn(userId, today()),
    rules: { ...BONUS, ACTIVE_SHOP },
    referrals,
    history,
  };
}
