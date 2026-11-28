import { db, insert, now, remove, update } from '../db/store.js';
import { AppError } from '../utils/AppError.js';
import { dayInRange, today } from '../utils/dates.js';
import { groupBy, matches, paginate, sameText, sortRows } from '../utils/list.js';
import { cents, sumMoney } from '../utils/money.js';

const FIELDS = ['category', 'amount', 'description', 'expense_date', 'payment_method'];

const toExpense = ({ user_id: _user, ...e }) => e;

/** A user's expenses with expense_date inside [from, to]. */
export const expensesIn = (userId, from, to) =>
  db.expenses.filter((e) => e.user_id === userId && dayInRange(e.expense_date, from, to));

const SORT_KEYS = {
  expense_date: (e) => `${e.expense_date} ${e.created_at}`,
  amount: (e) => cents(e.amount),
  created_at: (e) => e.created_at,
};

export async function listExpenses(userId, q) {
  const rows = expensesIn(userId, q.from, q.to).filter(
    (e) =>
      (!q.category || sameText(e.category, q.category)) &&
      (!q.payment_method || e.payment_method === q.payment_method) &&
      matches(q.search, e.category, e.description),
  );
  const { items, meta } = paginate(sortRows(rows, SORT_KEYS[q.sort], q.order), q.page, q.limit);
  return {
    items: items.map(toExpense),
    meta: { ...meta, total_amount: sumMoney(rows, (e) => e.amount) },
  };
}

function expenseOr404(userId, expenseId) {
  const e = db.expenses.find((x) => x.id === expenseId && x.user_id === userId);
  if (!e) throw AppError.notFound('Expense not found');
  return e;
}

export async function getExpense(userId, expenseId) {
  return toExpense(expenseOr404(userId, expenseId));
}

export async function listCategories(userId) {
  const groups = groupBy(expensesIn(userId), (e) => e.category);
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, list]) => ({
      category,
      expense_count: list.length,
      total_amount: sumMoney(list, (e) => e.amount),
    }));
}

export async function createExpense(userId, data) {
  const time = now();
  const e = insert('expenses', {
    user_id: userId,
    category: data.category,
    amount: data.amount,
    description: data.description ?? null,
    expense_date: data.expense_date ?? today(),
    payment_method: data.payment_method ?? 'cash',
    created_at: time,
    updated_at: time,
  });
  return toExpense(e);
}

export async function updateExpense(userId, expenseId, data) {
  const e = expenseOr404(userId, expenseId);
  const changes = Object.fromEntries(FIELDS.filter((f) => data[f] !== undefined).map((f) => [f, data[f]]));
  return toExpense(update('expenses', e, changes));
}

export async function deleteExpense(userId, expenseId) {
  expenseOr404(userId, expenseId);
  remove('expenses', (e) => e.id === expenseId);
  return { id: expenseId, deleted: true };
}
