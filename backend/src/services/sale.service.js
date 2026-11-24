import { query, withTransaction } from '../config/db.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { resolveRange, whereTimestampInRange } from '../utils/dates.js';
import { SqlParams, offset, paginationMeta } from '../utils/sql.js';

const SALE_COLUMNS = `
  s.id, s.status, s.payment_method, s.customer_name, s.note,
  s.total_amount, s.total_cost,
  (s.total_amount - s.total_cost)::numeric(14,2) AS gross_profit,
  s.items_count, s.sold_at, s.created_at`;

const SORT_COLUMNS = { sold_at: 's.sold_at', total_amount: 's.total_amount' };

export async function getSale(userId, saleId) {
  const { rows } = await query(`SELECT ${SALE_COLUMNS} FROM sales s WHERE s.id = $1 AND s.user_id = $2`, [
    saleId,
    userId,
  ]);
  if (!rows.length) throw AppError.notFound('Sale not found');

  const { rows: items } = await query(
    `SELECT si.id, si.product_id, p.sku, p.name AS product_name, si.quantity,
            si.unit_price, si.unit_cost, si.line_total, si.line_cost
       FROM sale_items si
       JOIN products p ON p.id = si.product_id
      WHERE si.sale_id = $1 AND si.user_id = $2
      ORDER BY p.name, si.id`,
    [saleId, userId],
  );
  return { ...rows[0], items };
}

async function findSaleIdByKey(userId, key) {
  const { rows } = await query('SELECT id FROM sales WHERE user_id = $1 AND idempotency_key = $2', [
    userId,
    key,
  ]);
  return rows[0]?.id ?? null;
}

/**
 * Create a sale atomically:
 *   lock inventory rows -> validate products & stock -> insert sale + items
 *   -> compute totals in SQL (exact NUMERIC math) -> decrement stock -> write ledger.
 * Any failure rolls back everything. With an Idempotency-Key, a retried request returns
 * the original sale instead of creating (and charging stock for) a duplicate.
 */
export async function createSale(userId, body, idempotencyKey) {
  if (idempotencyKey) {
    const existingId = await findSaleIdByKey(userId, idempotencyKey);
    if (existingId) return { sale: await getSale(userId, existingId), replayed: true };
  }

  let saleId;
  try {
    saleId = await withTransaction(async (client) => {
      const productIds = body.items.map((i) => i.product_id);

      // Lock in a consistent order (by id) so concurrent sales cannot deadlock.
      const { rows: products } = await client.query(
        `SELECT p.id, p.sku, p.name, p.selling_price, p.cost_price, p.is_active, i.quantity
           FROM products p
           JOIN inventory i ON i.product_id = p.id
          WHERE p.user_id = $1 AND p.id = ANY($2::uuid[])
          ORDER BY p.id
          FOR UPDATE OF i`,
        [userId, productIds],
      );
      const byId = new Map(products.map((p) => [p.id, p]));

      const invalid = productIds.filter((pid) => !byId.get(pid)?.is_active);
      if (invalid.length) {
        throw new AppError(400, 'INVALID_PRODUCTS', 'Some products do not exist or are archived', {
          product_ids: invalid,
        });
      }

      const shortages = body.items
        .filter((item) => item.quantity > byId.get(item.product_id).quantity)
        .map((item) => {
          const p = byId.get(item.product_id);
          return {
            product_id: p.id,
            sku: p.sku,
            name: p.name,
            available: p.quantity,
            requested: item.quantity,
          };
        });
      if (shortages.length) {
        throw AppError.conflict('Not enough stock for some products', shortages, 'INSUFFICIENT_STOCK');
      }

      const unitsSold = body.items.reduce((sum, i) => sum + i.quantity, 0);
      const { rows: saleRows } = await client.query(
        `INSERT INTO sales (user_id, payment_method, customer_name, note, idempotency_key, sold_at, items_count)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()), $7)
         RETURNING id`,
        [
          userId,
          body.payment_method,
          body.customer_name ?? null,
          body.note ?? null,
          idempotencyKey ?? null,
          body.sold_at ?? null,
          unitsSold,
        ],
      );
      const newSaleId = saleRows[0].id;

      const qty = body.items.map((i) => i.quantity);
      await client.query(
        `INSERT INTO sale_items (sale_id, user_id, product_id, quantity, unit_price, unit_cost)
         SELECT $1, $2, x.pid, x.qty, x.price, x.cost
           FROM unnest($3::uuid[], $4::int[], $5::numeric[], $6::numeric[]) AS x(pid, qty, price, cost)`,
        [
          newSaleId,
          userId,
          productIds,
          qty,
          body.items.map((i) => i.unit_price ?? byId.get(i.product_id).selling_price),
          body.items.map((i) => byId.get(i.product_id).cost_price),
        ],
      );

      await client.query(
        `UPDATE sales s
            SET total_amount = t.amount, total_cost = t.cost
           FROM (SELECT COALESCE(SUM(line_total), 0) AS amount, COALESCE(SUM(line_cost), 0) AS cost
                   FROM sale_items WHERE sale_id = $1) t
          WHERE s.id = $1`,
        [newSaleId],
      );

      const { rows: updated } = await client.query(
        `UPDATE inventory i
            SET quantity = i.quantity - x.qty
           FROM unnest($1::uuid[], $2::int[]) AS x(pid, qty)
          WHERE i.product_id = x.pid AND i.user_id = $3
          RETURNING i.product_id, i.quantity`,
        [productIds, qty, userId],
      );
      const after = new Map(updated.map((r) => [r.product_id, r.quantity]));

      await client.query(
        `INSERT INTO inventory_movements
           (user_id, product_id, movement_type, quantity_change, quantity_after, sale_id)
         SELECT $1, x.pid, 'sale', -x.qty, x.after, $2
           FROM unnest($3::uuid[], $4::int[], $5::int[]) AS x(pid, qty, after)`,
        [userId, newSaleId, productIds, qty, productIds.map((pid) => after.get(pid))],
      );

      return newSaleId;
    });
  } catch (err) {
    // Two concurrent requests with the same key: the loser replays the winner's sale.
    if (idempotencyKey && err.code === '23505' && err.constraint === 'sales_idempotency_uq') {
      const existingId = await findSaleIdByKey(userId, idempotencyKey);
      if (existingId) return { sale: await getSale(userId, existingId), replayed: true };
    }
    throw err;
  }

  return { sale: await getSale(userId, saleId), replayed: false };
}

export async function listSales(userId, q) {
  const sql = new SqlParams();
  sql.where(`s.user_id = ${sql.add(userId)}`);
  if (q.status) sql.where(`s.status = ${sql.add(q.status)}`);
  if (q.payment_method) sql.where(`s.payment_method = ${sql.add(q.payment_method)}`);
  if (q.product_id) {
    sql.where(
      `EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id AND si.product_id = ${sql.add(q.product_id)})`,
    );
  }
  whereTimestampInRange(sql, 's.sold_at', q.from, q.to);

  const where = sql.whereSql();
  const { rows: countRows } = await query(`SELECT COUNT(*) AS total FROM sales s ${where}`, sql.values);

  const dir = q.order === 'asc' ? 'ASC' : 'DESC';
  const l = sql.add(q.limit);
  const o = sql.add(offset(q.page, q.limit));
  const { rows } = await query(
    `SELECT ${SALE_COLUMNS} FROM sales s ${where}
      ORDER BY ${SORT_COLUMNS[q.sort]} ${dir}, s.id ${dir}
      LIMIT ${l} OFFSET ${o}`,
    sql.values,
  );
  return { items: rows, meta: paginationMeta(q.page, q.limit, countRows[0].total) };
}

/** Totals over completed sales in a date range (default: last 30 days). */
export async function getStatistics(userId, q) {
  const { from, to } = resolveRange(q);
  const params = [userId, from, to, env.APP_TIMEZONE];
  const range = `s.user_id = $1 AND s.status = 'completed'
    AND s.sold_at >= ($2::date)::timestamp AT TIME ZONE $4
    AND s.sold_at < ($3::date + 1)::timestamp AT TIME ZONE $4`;

  const { rows } = await query(
    `SELECT COUNT(*) AS sales_count,
            COALESCE(SUM(s.items_count), 0) AS units_sold,
            COALESCE(SUM(s.total_amount), 0)::numeric(20,2) AS revenue,
            COALESCE(SUM(s.total_cost), 0)::numeric(20,2) AS cogs,
            COALESCE(SUM(s.total_amount - s.total_cost), 0)::numeric(20,2) AS gross_profit,
            COALESCE(ROUND(AVG(s.total_amount), 2), 0)::numeric(20,2) AS average_sale_value
       FROM sales s WHERE ${range}`,
    params,
  );

  const { rows: byPayment } = await query(
    `SELECT s.payment_method, COUNT(*) AS sales_count,
            SUM(s.total_amount)::numeric(20,2) AS revenue
       FROM sales s WHERE ${range}
      GROUP BY s.payment_method
      ORDER BY revenue DESC`,
    params,
  );

  return { period: { from, to }, ...rows[0], by_payment_method: byPayment };
}
