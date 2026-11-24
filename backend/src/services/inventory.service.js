import { query, withTransaction } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import { whereTimestampInRange } from '../utils/dates.js';
import { SqlParams, offset, paginationMeta } from '../utils/sql.js';
import { likePattern } from '../validators/common.js';
import { lockInventory, recordMovement } from './inventoryLedger.js';

const INVENTORY_SELECT = `
  SELECT p.id AS product_id, p.sku, p.name, p.category, p.unit,
         i.quantity, i.low_stock_threshold,
         CASE WHEN i.quantity = 0 THEN 'out'
              WHEN i.quantity <= i.low_stock_threshold THEN 'low'
              ELSE 'in_stock' END AS stock_status,
         p.cost_price, p.selling_price,
         (i.quantity * p.cost_price)::numeric(20,2) AS stock_value_cost,
         (i.quantity * p.selling_price)::numeric(20,2) AS stock_value_retail,
         i.updated_at
    FROM inventory i
    JOIN products p ON p.id = i.product_id`;

const SORT_COLUMNS = { name: 'p.name', quantity: 'i.quantity', updated_at: 'i.updated_at' };

const MOVEMENT_SELECT = `
  SELECT m.id, m.product_id, p.sku, p.name AS product_name, m.movement_type,
         m.quantity_change, m.quantity_after, m.sale_id, m.note, m.created_at
    FROM inventory_movements m
    JOIN products p ON p.id = m.product_id`;

async function paged(sql, baseSelect, countFrom, orderBy, page, limit) {
  const where = sql.whereSql();
  const { rows: countRows } = await query(`SELECT COUNT(*) AS total ${countFrom} ${where}`, sql.values);
  const l = sql.add(limit);
  const o = sql.add(offset(page, limit));
  const { rows } = await query(
    `${baseSelect} ${where} ORDER BY ${orderBy} LIMIT ${l} OFFSET ${o}`,
    sql.values,
  );
  return { items: rows, meta: paginationMeta(page, limit, countRows[0].total) };
}

export async function listInventory(userId, q) {
  const sql = new SqlParams();
  sql.where(`i.user_id = ${sql.add(userId)}`).where('p.is_active');

  if (q.search) {
    const pattern = sql.add(likePattern(q.search));
    sql.where(`(p.name ILIKE ${pattern} OR p.sku ILIKE ${pattern})`);
  }
  if (q.category) sql.where(`lower(p.category) = lower(${sql.add(q.category)})`);
  if (q.stock_status === 'out') sql.where('i.quantity = 0');
  if (q.stock_status === 'low') sql.where('i.quantity > 0 AND i.quantity <= i.low_stock_threshold');
  if (q.stock_status === 'in_stock') sql.where('i.quantity > i.low_stock_threshold');

  const orderBy = `${SORT_COLUMNS[q.sort]} ${q.order === 'desc' ? 'DESC' : 'ASC'}, p.id`;
  return paged(
    sql,
    INVENTORY_SELECT,
    'FROM inventory i JOIN products p ON p.id = i.product_id',
    orderBy,
    q.page,
    q.limit,
  );
}

/** Products at or below their low-stock threshold (including out of stock), emptiest first. */
export async function listLowStock(userId, q) {
  const sql = new SqlParams();
  sql
    .where(`i.user_id = ${sql.add(userId)}`)
    .where('p.is_active')
    .where('i.quantity <= i.low_stock_threshold');
  return paged(
    sql,
    INVENTORY_SELECT,
    'FROM inventory i JOIN products p ON p.id = i.product_id',
    'i.quantity ASC, p.name ASC, p.id',
    q.page,
    q.limit,
  );
}

export async function getProductInventory(userId, productId) {
  const { rows } = await query(
    `${INVENTORY_SELECT} WHERE i.product_id = $1 AND i.user_id = $2 AND p.is_active`,
    [productId, userId],
  );
  if (!rows.length) throw AppError.notFound('Product not found');

  const { rows: movements } = await query(
    `${MOVEMENT_SELECT} WHERE m.product_id = $1 AND m.user_id = $2
      ORDER BY m.created_at DESC, m.id LIMIT 20`,
    [productId, userId],
  );
  return { ...rows[0], recent_movements: movements };
}

export async function listHistory(userId, q) {
  const sql = new SqlParams();
  sql.where(`m.user_id = ${sql.add(userId)}`);
  if (q.product_id) sql.where(`m.product_id = ${sql.add(q.product_id)}`);
  if (q.type) sql.where(`m.movement_type = ${sql.add(q.type)}`);
  whereTimestampInRange(sql, 'm.created_at', q.from, q.to);

  const dir = q.order === 'asc' ? 'ASC' : 'DESC';
  return paged(
    sql,
    MOVEMENT_SELECT,
    'FROM inventory_movements m',
    `m.created_at ${dir}, m.id ${dir}`,
    q.page,
    q.limit,
  );
}

/**
 * Manual stock change. Row is locked (FOR UPDATE) so concurrent sales/adjustments serialize.
 * Stock can never go below zero.
 */
export async function adjustStock(userId, { product_id, type, quantity_change, new_quantity, note }) {
  return withTransaction(async (client) => {
    const inv = await lockInventory(client, userId, product_id);
    if (!inv) throw AppError.notFound('Product not found');

    const change = new_quantity !== undefined ? new_quantity - inv.quantity : quantity_change;
    if (change === 0) {
      throw AppError.badRequest('Stock is already at this quantity; nothing to adjust');
    }

    const after = inv.quantity + change;
    if (after < 0) {
      throw AppError.conflict(
        'Adjustment would make stock negative',
        { available: inv.quantity, requested_change: change },
        'INSUFFICIENT_STOCK',
      );
    }

    await client.query('UPDATE inventory SET quantity = $3 WHERE product_id = $1 AND user_id = $2', [
      product_id,
      userId,
      after,
    ]);
    await recordMovement(client, {
      userId,
      productId: product_id,
      type,
      change,
      after,
      note: note ?? null,
    });

    return {
      product_id,
      movement_type: type,
      quantity_before: inv.quantity,
      quantity_change: change,
      quantity_after: after,
    };
  });
}
