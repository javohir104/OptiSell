/**
 * Admin panel data, computed from real rows only (nothing estimated or generated).
 *
 *   users       users (+ plan in force, last_active_at)
 *   visitors    page_views + in-memory presence (sent by the frontend, see tracking.service.js)
 *   revenue     payments with status 'paid', not provider 'test', not from a test/demo account
 *
 * Admin and test/demo accounts (is_test_account) are left out of every statistic.
 * Never returns password hashes or provider payloads.
 */
import { effectivePlan } from '../config/plans.js';
import { db, update } from '../db/store.js';
import { AppError } from '../utils/AppError.js';
import { addDays, bucketList, bucketStart, inRange, localDay, resolveRange, today } from '../utils/dates.js';
import { matches, paginate, sortRows } from '../utils/list.js';
import { cents } from '../utils/money.js';
import { audit } from './adminAuth.service.js';
import { presence } from './tracking.service.js';
import { findUser } from './user.shared.js';

export const ONLINE_WINDOW_MINUTES = 5;

const amount = (p) => cents(p.amount) / 100;
const sumAmount = (payments) => payments.reduce((s, p) => s + cents(p.amount), 0) / 100;
const distinct = (rows, key) => new Set(rows.map(key).filter((v) => v != null)).size;
const since = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

/** Real customer = a normal user that is not a test/demo account. */
const isRealUser = (u) => u.role === 'user' && !u.is_test_account;
/** Real money: confirmed by Click / Payme (never the local "test" provider), real account. */
const isRealPaid = (p) => p.status === 'paid' && p.provider !== 'test' && !findUser(p.user_id)?.is_test_account;

const pageViewsIn = (from, to) => db.page_views.filter((v) => inRange(v.created_at, from, to));

// --------------------------------------------------------------------------- overview
function visitorTotals(from, to) {
  const views = pageViewsIn(from, to);
  return {
    page_views: views.length,
    visits: distinct(views, (v) => v.session_id),
    unique_visitors: distinct(views, (v) => v.visitor_id),
    signed_in_visitors: distinct(views, (v) => v.user_id),
  };
}

function revenueSummary(payments) {
  return { sales: payments.length, customers: distinct(payments, (p) => p.user_id), amount: sumAmount(payments) };
}

const realPaidIn = (from, to) => db.payments.filter((p) => isRealPaid(p) && inRange(p.paid_at, from, to));

export async function onlineCounts(minutes = ONLINE_WINDOW_MINUTES) {
  const cutoff = since(minutes);
  return {
    window_minutes: minutes,
    visitors_online: [...presence.values()].filter((p) => p.last_seen_at > cutoff).length,
    users_online: db.users.filter((u) => u.role === 'user' && u.last_active_at > cutoff).length,
  };
}

export async function getOverview(q) {
  const { from, to } = resolveRange(q);
  const day = today();
  const monthStart = `${day.slice(0, 7)}-01`;

  const real = db.users.filter(isRealUser);
  const byPlan = (plan) => real.filter((u) => effectivePlan(u) === plan).length;
  const paying = real.filter(
    (u) =>
      effectivePlan(u) !== 'free' &&
      db.payments.some((p) => p.user_id === u.id && p.status === 'paid' && p.provider !== 'test'),
  ).length;
  const activeWithin = (days) => real.filter((u) => u.last_active_at > since(days * 24 * 60)).length;
  const pro = byPlan('pro');
  const max = byPlan('max');

  const nonTestPayments = db.payments.filter(
    (p) => p.provider !== 'test' && !findUser(p.user_id)?.is_test_account && inRange(p.created_at, from, to),
  );
  const status = Object.fromEntries(
    ['pending', 'paid', 'cancelled'].map((s) => {
      const list = nonTestPayments.filter((p) => p.status === s);
      return [s, { count: list.length, amount: sumAmount(list) }];
    }),
  );

  const rangePaid = realPaidIn(from, to);
  const planRevenue = ['pro', 'max']
    .map((plan) => {
      const list = rangePaid.filter((p) => p.plan === plan);
      return { plan, sales: list.length, amount: sumAmount(list) };
    })
    .filter((r) => r.sales > 0)
    .sort((a, b) => b.amount - a.amount);

  return {
    range: { from, to },
    currency: 'UZS',
    users: {
      total: real.length,
      free: byPlan('free'),
      pro,
      max,
      paying,
      trial: pro + max - paying,
      registered_in_range: real.filter((u) => inRange(u.created_at, from, to)).length,
      registered_today: real.filter((u) => inRange(u.created_at, day, day)).length,
      active_last_24h: activeWithin(1),
      active_last_7_days: activeWithin(7),
      active_last_30_days: activeWithin(30),
      test_accounts_excluded: db.users.filter((u) => u.role === 'user' && u.is_test_account).length,
    },
    online: await onlineCounts(),
    visitors: {
      in_range: visitorTotals(from, to),
      today: visitorTotals(day, day),
      last_7_days: visitorTotals(addDays(day, -6), day),
    },
    revenue: {
      all_time: revenueSummary(db.payments.filter(isRealPaid)),
      range: revenueSummary(rangePaid),
      today: revenueSummary(realPaidIn(day, day)),
      this_month: revenueSummary(realPaidIn(monthStart, day)),
      by_plan: planRevenue,
      payments_by_status: status,
    },
  };
}

// --------------------------------------------------------------------------- chart
/** One zero-filled series: registrations, visitors and revenue per day / week / month. */
export async function getChart(q) {
  const { from, to } = resolveRange(q);
  const bucketOf = (timestamp) => bucketStart(localDay(timestamp), q.interval);
  const rows = new Map(
    bucketList(from, to, q.interval).map((period) => [
      period,
      { period, registrations: 0, page_views: 0, unique_visitors: new Set(), sales: 0, revenue: 0 },
    ]),
  );

  for (const u of db.users) {
    if (isRealUser(u) && inRange(u.created_at, from, to)) rows.get(bucketOf(u.created_at)).registrations += 1;
  }
  for (const v of pageViewsIn(from, to)) {
    const row = rows.get(bucketOf(v.created_at));
    row.page_views += 1;
    row.unique_visitors.add(v.visitor_id);
  }
  for (const p of realPaidIn(from, to)) {
    const row = rows.get(bucketOf(p.paid_at));
    row.sales += 1;
    row.revenue += amount(p);
  }

  const series = [...rows.values()].map((r) => ({ ...r, unique_visitors: r.unique_visitors.size }));
  return { range: { from, to }, interval: q.interval, series };
}

// --------------------------------------------------------------------------- traffic
/** Group rows by key and count: { [label]: key, ...counts }, sorted by `sortKey`, top 20. */
function topGroups(rows, key, label, counters, sortKey) {
  const groups = new Map();
  for (const r of rows) {
    const k = key(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return [...groups]
    .map(([k, list]) => ({ [label]: k, ...Object.fromEntries(Object.entries(counters).map(([n, fn]) => [n, fn(list)])) }))
    .sort((a, b) => b[sortKey] - a[sortKey] || String(a[label]).localeCompare(String(b[label])))
    .slice(0, 20);
}

export async function getTraffic(q) {
  const { from, to } = resolveRange(q);
  const views = pageViewsIn(from, to);
  const uniqueVisitors = (list) => distinct(list, (v) => v.visitor_id);
  return {
    range: { from, to },
    top_pages: topGroups(views, (v) => v.path, 'path', { page_views: (l) => l.length, unique_visitors: uniqueVisitors }, 'page_views'),
    referrers: topGroups(views, (v) => v.referrer_host ?? 'direct', 'referrer', { visits: (l) => distinct(l, (v) => v.session_id) }, 'visits'),
    devices: topGroups(views, (v) => v.device_type, 'device_type', { unique_visitors: uniqueVisitors, page_views: (l) => l.length }, 'unique_visitors'),
  };
}

export async function getActiveUsers({ minutes }) {
  const cutoff = since(minutes);
  const users = db.users
    .filter((u) => u.role === 'user' && u.last_active_at > cutoff)
    .sort((a, b) => b.last_active_at.localeCompare(a.last_active_at))
    .slice(0, 100)
    .map((u) => ({ id: u.id, email: u.email, full_name: u.full_name, is_test_account: u.is_test_account, last_active_at: u.last_active_at }));
  const present = [...presence.values()].filter((p) => p.last_seen_at > cutoff);
  return {
    ...(await onlineCounts(minutes)),
    users,
    current_pages: topGroups(present, (p) => p.path, 'path', { visitors: (l) => l.length }, 'visitors'),
  };
}

// --------------------------------------------------------------------------- users
function formatUser(u) {
  const plan = effectivePlan(u);
  const paid = db.payments.filter((p) => p.user_id === u.id && isRealPaid(p));
  return {
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    business_name: u.business_name,
    phone: u.phone,
    role: u.role,
    is_test_account: u.is_test_account,
    registered_at: u.created_at,
    last_active_at: u.last_active_at,
    plan,
    plan_expires_at: plan === 'free' ? null : u.plan_expires_at,
    is_trial: plan !== 'free' && paid.length === 0,
    payments: { paid_count: paid.length, paid_total: sumAmount(paid) },
  };
}

const USER_SORT = {
  created_at: (u) => u.created_at,
  last_active_at: (u) => u.last_active_at,
  email: (u) => u.email,
  full_name: (u) => u.full_name?.toLowerCase(),
};

export async function listUsers(q) {
  const activeCutoff = q.active_within_days ? since(q.active_within_days * 24 * 60) : null;
  const rows = db.users.filter(
    (u) =>
      matches(q.search, u.email, u.full_name, u.business_name, u.phone) &&
      (!q.plan || effectivePlan(u) === q.plan) &&
      (!q.role || u.role === q.role) &&
      (q.test !== 'exclude' || !u.is_test_account) &&
      (q.test !== 'only' || u.is_test_account) &&
      (!activeCutoff || u.last_active_at > activeCutoff),
  );
  const { items, meta } = paginate(sortRows(rows, USER_SORT[q.sort], q.order), q.page, q.limit);
  return { items: items.map(formatUser), meta };
}

export async function getUser(userId) {
  const user = findUser(userId);
  if (!user) throw AppError.notFound('User not found');

  const sales = db.sales.filter((s) => s.user_id === userId && s.status === 'completed');
  const views = db.page_views.filter((v) => v.user_id === userId);
  const payments = db.payments
    .filter((p) => p.user_id === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 20);

  return {
    ...formatUser(user),
    usage: {
      products: db.products.filter((p) => p.user_id === userId && p.is_active).length,
      sales: sales.length,
      sales_total: sales.reduce((s, x) => s + cents(x.total_amount), 0) / 100,
    },
    activity: {
      page_views: views.length,
      last_page_view_at: views.reduce((max, v) => (max && max > v.created_at ? max : v.created_at), null),
    },
    recent_payments: payments.map(formatPayment),
  };
}

/** Admins can only flag accounts as test/demo here; roles are never changed through the API. */
export async function updateUser(adminId, userId, { is_test_account: isTest }, ip) {
  const user = findUser(userId);
  if (!user || user.role !== 'user') throw AppError.notFound('User not found');
  update('users', user, { is_test_account: isTest });
  audit(adminId, 'user.update', { targetId: userId, details: { is_test_account: isTest }, ip: ip ?? null });
  return getUser(userId);
}

// --------------------------------------------------------------------------- payments
function formatPayment(p) {
  const u = findUser(p.user_id);
  return {
    id: p.id,
    order_no: p.order_no,
    user: { id: p.user_id, email: u?.email ?? null, full_name: u?.full_name ?? null, is_test_account: Boolean(u?.is_test_account) },
    plan: p.plan,
    months: p.months,
    amount: amount(p),
    currency: 'UZS',
    provider: p.provider,
    status: p.status,
    provider_txn_id: p.provider_txn_id,
    is_test: p.provider === 'test' || Boolean(u?.is_test_account),
    is_real_revenue: isRealPaid(p),
    created_at: p.created_at,
    paid_at: p.paid_at,
  };
}

const PAYMENT_SORT = { created_at: (p) => p.created_at, paid_at: (p) => p.paid_at, amount: (p) => cents(p.amount) };

export async function listPayments(q) {
  const term = q.search?.replace(/^#/, '');
  const byOrderNo = term && /^\d{1,18}$/.test(term);
  const rows = db.payments.filter((p) => {
    const u = findUser(p.user_id);
    const isTest = p.provider === 'test' || Boolean(u?.is_test_account);
    return (
      (!(q.from && q.to) || inRange(p.created_at, q.from, q.to)) &&
      (!q.status || p.status === q.status) &&
      (!q.provider || p.provider === q.provider) &&
      (!q.plan || p.plan === q.plan) &&
      (!q.user_id || p.user_id === q.user_id) &&
      (q.test !== 'exclude' || !isTest) &&
      (q.test !== 'only' || isTest) &&
      (!q.search || (byOrderNo ? p.order_no === Number(term) : matches(q.search, u?.email, u?.full_name, p.provider_txn_id)))
    );
  });
  const realPaid = rows.filter(isRealPaid);
  const { items, meta } = paginate(sortRows(rows, PAYMENT_SORT[q.sort], q.order), q.page, q.limit);
  return {
    items: items.map(formatPayment),
    meta: { ...meta, real_paid_count: realPaid.length, real_paid_total: sumAmount(realPaid) },
  };
}

// --------------------------------------------------------------------------- audit log
export async function listAuditLog(q) {
  const rows = [...db.admin_audit_log].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const { items, meta } = paginate(rows, q.page, q.limit);
  return {
    items: items.map((l) => ({ ...l, admin_email: l.admin_id ? (findUser(l.admin_id)?.email ?? null) : null })),
    meta,
  };
}
