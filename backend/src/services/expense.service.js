import { query } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import { today } from '../utils/dates.js';
import { SqlParams, offset, paginationMeta } from '../utils/sql.js';
import { likePattern } from '../validators/common.js';

const COLUMNS = `id, category, amount, description, expense_date::text AS expense_date,
                 payment_method, created_at, updated_at`;
const UPDATABLE = ['category', 'amount', 'description', 'expense_date', 'payment_method'];
const SORT_COLUMNS = { expense_date: 'expense_date', amount: 'amount', created_at: 'created_at' };

export async function listExpenses(userId, q) {
  const sql = new SqlParams();
  sql.where(`user_id = ${sql.add(userId)}`);
  if (q.from) sql.where(`expense_date >= ${sql.add(q.from)}::date`);
  if (q.to) sql.where(`expense_date <= ${sql.add(q.to)}::date`);
  if (q.category) sql.where(`lower(category) = lower(${sql.add(q.category)})`);
  if (q.payment_method) sql.where(`payment_method = ${sql.add(q.payment_method)}`);
  if (q.search) {
    const p = sql.add(likePattern(q.search));
    sql.where(`(category ILIKE ${p} OR description ILIKE ${p})`);
  }

  const where = sql.whereSql();
  const { rows: countRows } = await query(
    `SELECT COUNT(*) AS total, COALESCE(SUM(amount), 0)::numeric(20,2) AS total_amount
       FROM expenses ${where}`,
    sql.values,
  );

  const dir = q.order === 'asc' ? 'ASC' : 'DESC';
  const l = sql.add(q.limit);
  const o = sql.add(offset(q.page, q.limit));
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM expenses ${where}
      ORDER BY ${SORT_COLUMNS[q.sort]} ${dir}, created_at ${dir}, id
      LIMIT ${l} OFFSET ${o}`,
    sql.values,
  );

  return {
    items: rows,
    meta: {
      ...paginationMeta(q.page, q.limit, countRows[0].total),
      total_amount: countRows[0].total_amount,
    },
  };
}

export async function getExpense(userId, expenseId) {
  const { rows } = await query(`SELECT ${COLUMNS} FROM expenses WHERE id = $1 AND user_id = $2`, [
    expenseId,
    userId,
  ]);
  if (!rows.length) throw AppError.notFound('Expense not found');
  return rows[0];
}

export async function listCategories(userId) {
  const { rows } = await query(
    `SELECT category, COUNT(*) AS expense_count, SUM(amount)::numeric(20,2) AS total_amount
       FROM expenses WHERE user_id = $1
      GROUP BY category ORDER BY category`,
    [userId],
  );
  return rows;
}

export async function createExpense(userId, data) {
  const { rows } = await query(
    `INSERT INTO expenses (user_id, category, amount, description, expense_date, payment_method)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::payment_method, 'cash'))
     RETURNING ${COLUMNS}`,
    [
      userId,
      data.category,
      data.amount,
      data.description ?? null,
      data.expense_date ?? today(),
      data.payment_method ?? null,
    ],
  );
  return rows[0];
}

export async function updateExpense(userId, expenseId, data) {
  const params = [expenseId, userId];
  const sets = [];
  for (const column of UPDATABLE) {
    if (data[column] !== undefined) {
      params.push(data[column]);
      sets.push(`${column} = $${params.length}`);
    }
  }
  const { rows } = await query(
    `UPDATE expenses SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING ${COLUMNS}`,
    params,
  );
  if (!rows.length) throw AppError.notFound('Expense not found');
  return rows[0];
}

export async function deleteExpense(userId, expenseId) {
  const { rowCount } = await query('DELETE FROM expenses WHERE id = $1 AND user_id = $2', [
    expenseId,
    userId,
  ]);
  if (!rowCount) throw AppError.notFound('Expense not found');
  return { id: expenseId, deleted: true };
}
