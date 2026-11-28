/**
 * Customers and nasiya (sales on credit).
 *
 * A customer's debt is never stored: it is computed from the rows, so it is always right even
 * after returns or edits.
 *
 *   debt    = sum of total_amount of the customer's completed sales with payment_method 'debt'
 *   paid    = sum of the customer's debt_payments
 *   balance = debt - paid           (> 0: owes the shop, < 0: paid in advance)
 *
 * Payments pay the oldest debt sales first. A customer is "overdue" when a debt sale that is not
 * fully paid yet has a due_date before today.
 */
import { db, insert, now, remove, update } from '../db/store.js';
import { AppError } from '../utils/AppError.js';
import { addDays, today } from '../utils/dates.js';
import { matches, paginate, sortRows } from '../utils/list.js';
import { cents, fromCents } from '../utils/money.js';
import { toSale } from './sale.service.js';

const debtSales = (userId, customerId) =>
  db.sales
    .filter((s) => s.user_id === userId && s.customer_id === customerId && s.payment_method === 'debt' && s.status === 'completed')
    .sort((a, b) => a.sold_at.localeCompare(b.sold_at));

const paymentsOf = (userId, customerId) =>
  db.debt_payments
    .filter((p) => p.user_id === userId && p.customer_id === customerId)
    .sort((a, b) => b.paid_at.localeCompare(a.paid_at));

/** Debt totals of one customer (money in tiyin) + the unpaid debt sales (oldest first). */
function ledger(userId, customerId) {
  const sales = debtSales(userId, customerId);
  const debt = sales.reduce((s, x) => s + cents(x.total_amount), 0);
  const paid = paymentsOf(userId, customerId).reduce((s, p) => s + cents(p.amount), 0);

  let left = paid;
  const unpaid = [];
  for (const sale of sales) {
    const total = cents(sale.total_amount);
    const covered = Math.min(total, Math.max(left, 0));
    left -= covered;
    if (covered < total) unpaid.push({ sale, remaining: total - covered });
  }
  const day = today();
  const overdue = unpaid.filter((u) => u.sale.due_date && u.sale.due_date < day);
  const nextDue = unpaid.map((u) => u.sale.due_date).filter(Boolean).sort()[0] ?? null;
  return {
    debt,
    paid,
    balance: debt - paid,
    unpaid,
    overdue_amount: overdue.reduce((s, u) => s + u.remaining, 0),
    next_due_date: nextDue,
    last_sale_at: sales.length ? sales[sales.length - 1].sold_at : null,
  };
}

function toCustomer(c) {
  const l = ledger(c.user_id, c.id);
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    note: c.note,
    is_active: c.is_active !== false,
    total_debt: fromCents(l.debt),
    total_paid: fromCents(l.paid),
    balance: fromCents(l.balance),
    overdue_amount: fromCents(l.overdue_amount),
    is_overdue: l.overdue_amount > 0,
    next_due_date: l.next_due_date,
    last_sale_at: l.last_sale_at,
    created_at: c.created_at,
    updated_at: c.updated_at,
  };
}

const toPayment = (p) => ({
  id: p.id,
  customer_id: p.customer_id,
  amount: p.amount,
  method: p.method,
  note: p.note,
  received_by_name: p.received_by_name ?? null,
  paid_at: p.paid_at,
  created_at: p.created_at,
});

function customerOr404(userId, id) {
  const c = db.customers.find((x) => x.id === id && x.user_id === userId && x.is_active !== false);
  if (!c) throw AppError.notFound('Customer not found');
  return c;
}

const SORT_KEYS = {
  name: (c) => c.name.toLowerCase(),
  balance: (c) => cents(c.balance),
  created_at: (c) => c.created_at,
  next_due_date: (c) => c.next_due_date,
};

export async function listCustomers(userId, q) {
  const rows = db.customers
    .filter((c) => c.user_id === userId && c.is_active !== false && matches(q.search, c.name, c.phone))
    .map(toCustomer)
    .filter((c) => {
      if (q.status === 'debtors') return cents(c.balance) > 0;
      if (q.status === 'overdue') return c.is_overdue;
      return true;
    });
  const { items, meta } = paginate(sortRows(rows, SORT_KEYS[q.sort], q.order), q.page, q.limit);
  const all = db.customers.filter((c) => c.user_id === userId && c.is_active !== false).map(toCustomer);
  const summary = {
    customers: all.length,
    debtors: all.filter((c) => cents(c.balance) > 0).length,
    overdue: all.filter((c) => c.is_overdue).length,
    total_debt: fromCents(all.reduce((s, c) => s + Math.max(cents(c.balance), 0), 0)),
    overdue_amount: fromCents(all.reduce((s, c) => s + cents(c.overdue_amount), 0)),
  };
  return { items, meta: { ...meta, summary } };
}

export async function getCustomer(userId, id) {
  const c = customerOr404(userId, id);
  const l = ledger(userId, id);
  const unpaid = new Map(l.unpaid.map((u) => [u.sale.id, u.remaining]));
  const sales = db.sales
    .filter((s) => s.user_id === userId && s.customer_id === id)
    .sort((a, b) => b.sold_at.localeCompare(a.sold_at))
    .slice(0, 200)
    .map((s) => ({ ...toSale(s), debt_remaining: unpaid.has(s.id) ? fromCents(unpaid.get(s.id)) : '0.00' }));
  return {
    ...toCustomer(c),
    sales,
    payments: paymentsOf(userId, id).slice(0, 200).map(toPayment),
  };
}

function assertPhoneFree(userId, phone, exceptId = null) {
  if (!phone) return;
  const digits = phone.replace(/\D/g, '');
  const taken = db.customers.some(
    (c) => c.user_id === userId && c.is_active !== false && c.id !== exceptId && (c.phone ?? '').replace(/\D/g, '') === digits,
  );
  if (taken) throw AppError.conflict('A customer with this phone number already exists', undefined, 'DUPLICATE_PHONE');
}

export async function createCustomer(userId, data) {
  assertPhoneFree(userId, data.phone);
  const time = now();
  const c = insert('customers', {
    user_id: userId,
    name: data.name,
    phone: data.phone ?? null,
    note: data.note ?? null,
    is_active: true,
    created_at: time,
    updated_at: time,
  });
  return toCustomer(c);
}

export async function updateCustomer(userId, id, data) {
  const c = customerOr404(userId, id);
  if (data.phone !== undefined) assertPhoneFree(userId, data.phone, id);
  const changes = {};
  for (const k of ['name', 'phone', 'note']) if (data[k] !== undefined) changes[k] = data[k];
  return toCustomer(update('customers', c, changes));
}

/** Soft delete; refused while the customer still owes money (the debt must not disappear). */
export async function archiveCustomer(userId, id) {
  const c = customerOr404(userId, id);
  if (ledger(userId, id).balance > 0) {
    throw AppError.conflict('This customer still has a debt. Record the payment first.', undefined, 'CUSTOMER_HAS_DEBT');
  }
  update('customers', c, { is_active: false });
  return { id, is_active: false };
}

export async function addPayment(userId, customerId, data, actor = null) {
  const c = customerOr404(userId, customerId);
  const l = ledger(userId, customerId);
  if (cents(data.amount) > l.balance) {
    throw new AppError(400, 'PAYMENT_TOO_LARGE', `The customer owes only ${fromCents(Math.max(l.balance, 0))}`, {
      balance: fromCents(l.balance),
    });
  }
  const time = now();
  const payment = insert('debt_payments', {
    user_id: userId,
    customer_id: c.id,
    amount: data.amount,
    method: data.method ?? 'cash',
    note: data.note ?? null,
    received_by_id: actor?.id ?? null,
    received_by_name: actor?.full_name ?? null,
    paid_at: data.paid_at ? new Date(`${data.paid_at}T12:00:00Z`).toISOString() : time,
    created_at: time,
  });
  return { payment: toPayment(payment), customer: toCustomer(c) };
}

/** Undo a payment entered by mistake. */
export async function deletePayment(userId, customerId, paymentId) {
  customerOr404(userId, customerId);
  const p = db.debt_payments.find((x) => x.id === paymentId && x.user_id === userId && x.customer_id === customerId);
  if (!p) throw AppError.notFound('Payment not found');
  remove('debt_payments', (x) => x.id === p.id);
  return { id: paymentId, deleted: true };
}

/** Debt totals for the dashboard / Telegram report. */
export function debtSummary(userId) {
  const all = db.customers.filter((c) => c.user_id === userId && c.is_active !== false).map((c) => ledger(userId, c.id));
  return {
    total_debt: all.reduce((s, l) => s + Math.max(l.balance, 0), 0),
    overdue_amount: all.reduce((s, l) => s + l.overdue_amount, 0),
    overdue_customers: all.filter((l) => l.overdue_amount > 0).length,
  };
}

/** Customers whose debt is due in the next `days` days (for reminders). */
export function dueSoon(userId, days = 3) {
  const day = today();
  const until = addDays(day, days);
  return db.customers
    .filter((c) => c.user_id === userId && c.is_active !== false)
    .map((c) => ({ c, l: ledger(userId, c.id) }))
    .filter(({ l }) => l.unpaid.some((u) => u.sale.due_date && u.sale.due_date >= day && u.sale.due_date <= until))
    .map(({ c, l }) => ({ name: c.name, phone: c.phone, balance: l.balance, next_due_date: l.next_due_date }));
}
