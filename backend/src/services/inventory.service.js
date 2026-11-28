import { db } from '../db/store.js';
import { AppError } from '../utils/AppError.js';
import { inRange } from '../utils/dates.js';
import { matches, paginate, sameText, sortRows } from '../utils/list.js';
import { cents, fromCents } from '../utils/money.js';
import { productOr404, setStock, assertQuantityFits, q3 } from './inventoryLedger.js';
import { stockStatus, userProducts } from './product.service.js';

function toInventory(p) {
  return {
    product_id: p.id,
    sku: p.sku,
    name: p.name,
    category: p.category,
    unit: p.unit,
    quantity: p.quantity,
    low_stock_threshold: p.low_stock_threshold,
    max_stock: p.max_stock,
    stock_status: stockStatus(p),
    cost_price: p.cost_price,
    selling_price: p.selling_price,
    stock_value_cost: fromCents(Math.round(p.quantity * cents(p.cost_price))),
    stock_value_retail: fromCents(Math.round(p.quantity * cents(p.selling_price))),
    updated_at: p.updated_at,
  };
}

function toMovement(m) {
  const p = db.products.find((x) => x.id === m.product_id);
  return {
    id: m.id,
    product_id: m.product_id,
    sku: p?.sku ?? null,
    product_name: p?.name ?? null,
    movement_type: m.movement_type,
    quantity_change: m.quantity_change,
    quantity_after: m.quantity_after,
    sale_id: m.sale_id,
    note: m.note,
    created_at: m.created_at,
  };
}

const activeProducts = (userId) => userProducts(userId).filter((p) => p.is_active);

const SORT_KEYS = { name: (p) => p.name, quantity: (p) => p.quantity, updated_at: (p) => p.updated_at };

export async function listInventory(userId, q) {
  const rows = activeProducts(userId).filter(
    (p) =>
      matches(q.search, p.name, p.sku) &&
      (!q.category || sameText(p.category, q.category)) &&
      (!q.stock_status || stockStatus(p) === q.stock_status),
  );
  const { items, meta } = paginate(sortRows(rows, SORT_KEYS[q.sort], q.order), q.page, q.limit);
  return { items: items.map(toInventory), meta };
}

/** Products at or below their low-stock threshold (including out of stock), emptiest first. */
export async function listLowStock(userId, q) {
  const rows = activeProducts(userId)
    .filter((p) => p.quantity <= p.low_stock_threshold)
    .sort((a, b) => a.quantity - b.quantity || a.name.localeCompare(b.name));
  const { items, meta } = paginate(rows, q.page, q.limit);
  return { items: items.map(toInventory), meta };
}

const newestFirst = (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);

export async function getProductInventory(userId, productId) {
  const product = productOr404(userId, productId);
  const movements = db.inventory_movements
    .filter((m) => m.product_id === productId && m.user_id === userId)
    .sort(newestFirst)
    .slice(0, 20);
  return { ...toInventory(product), recent_movements: movements.map(toMovement) };
}

export async function listHistory(userId, q) {
  const rows = db.inventory_movements
    .filter(
      (m) =>
        m.user_id === userId &&
        (!q.product_id || m.product_id === q.product_id) &&
        (!q.type || m.movement_type === q.type) &&
        (!q.from && !q.to ? true : inRange(m.created_at, q.from, q.to)),
    )
    .sort(newestFirst);
  if (q.order === 'asc') rows.reverse();
  const { items, meta } = paginate(rows, q.page, q.limit);
  return { items: items.map(toMovement), meta };
}

/** Manual stock change. Stock can never go below zero. */
export async function adjustStock(userId, { product_id, type, quantity_change, new_quantity, note }) {
  const product = productOr404(userId, product_id);
  const before = product.quantity;
  const change = q3(new_quantity !== undefined ? new_quantity - before : quantity_change);
  assertQuantityFits(product, new_quantity ?? change);
  if (change === 0) {
    throw AppError.badRequest('Stock is already at this quantity; nothing to adjust');
  }
  const after = q3(before + change);
  if (after < 0) {
    throw AppError.conflict(
      'Adjustment would make stock negative',
      { available: before, requested_change: change },
      'INSUFFICIENT_STOCK',
    );
  }
  setStock(product, after, type, { note: note ?? null });
  return {
    product_id,
    movement_type: type,
    quantity_before: before,
    quantity_change: change,
    quantity_after: after,
  };
}

/**
 * Stock-take (inventarizatsiya): the counted quantity of each product becomes its stock.
 * All rows are checked first; then every difference is saved as an 'adjustment' movement.
 * Returns the shortages / surpluses and their value at cost.
 */
export async function stockCount(userId, { items, note }) {
  const rows = items.map((it) => ({ it, p: productOr404(userId, it.product_id) }));
  rows.forEach(({ it, p }) => assertQuantityFits(p, it.counted, 'counted'));
  const label = note ? `Stock-take: ${note}` : 'Stock-take';
  const changes = [];
  for (const { it, p } of rows) {
    const diff = q3(it.counted - p.quantity);
    if (diff === 0) continue;
    changes.push({
      product_id: p.id, name: p.name, unit: p.unit, expected: p.quantity, counted: it.counted, difference: diff,
      value: fromCents(Math.round(diff * cents(p.cost_price))),
    });
    setStock(p, it.counted, 'adjustment', { note: label });
  }
  const sumValue = (list) => fromCents(list.reduce((s, c) => s + cents(c.value), 0));
  const shortages = changes.filter((c) => c.difference < 0);
  const surpluses = changes.filter((c) => c.difference > 0);
  return {
    checked: rows.length,
    changed: changes.length,
    shortage_count: shortages.length,
    shortage_value: sumValue(shortages),
    surplus_count: surpluses.length,
    surplus_value: sumValue(surpluses),
    changes,
  };
}
