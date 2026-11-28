import { randomUUID } from 'node:crypto';
import { hasFeature } from '../config/plans.js';
import { db, insert, now, update } from '../db/store.js';
import { AppError } from '../utils/AppError.js';
import { inRange, resolveRange } from '../utils/dates.js';
import { groupBy, paginate, sortRows } from '../utils/list.js';
import { cents, fromCents } from '../utils/money.js';
import { assertQuantityFits, findProduct, q3, setStock } from './inventoryLedger.js';
import { findUser } from './user.shared.js';

/** Money of a sale line after its share of the sale discount, in tiyin. */
export const lineCents = (it) => Math.round(it.quantity * cents(it.unit_price)) - cents(it.discount ?? 0);
export const lineCostCents = (it) => Math.round(it.quantity * cents(it.unit_cost));

export const invoiceNo = (saleId) => `INV-${String(saleId).slice(0, 8).toUpperCase()}`;

/** Sale line item -> API shape (with product name / SKU / category). */
function toItem(it) {
  const p = db.products.find((x) => x.id === it.product_id);
  return {
    id: it.id,
    product_id: it.product_id,
    sku: p?.sku ?? null,
    barcode: p?.barcode ?? null,
    product_name: p?.name ?? null,
    category: p?.category ?? null,
    unit: p?.unit ?? 'pcs',
    quantity: it.quantity,
    unit_price: it.unit_price,
    unit_cost: it.unit_cost,
    discount: it.discount ?? '0.00',
    line_total: fromCents(lineCents(it)),
    line_cost: fromCents(lineCostCents(it)),
  };
}

const byName = (a, b) => String(a.product_name).localeCompare(String(b.product_name)) || a.id.localeCompare(b.id);

export function toSale(s) {
  const customer = s.customer_id ? db.customers.find((c) => c.id === s.customer_id) : null;
  return {
    id: s.id,
    invoice_no: invoiceNo(s.id),
    status: s.status,
    payment_method: s.payment_method,
    customer_id: s.customer_id ?? null,
    customer_name: customer?.name ?? s.customer_name,
    customer_phone: customer?.phone ?? null,
    due_date: s.due_date ?? null,
    seller_id: s.seller_id ?? null,
    seller_name: s.seller_name ?? null,
    note: s.note,
    subtotal_amount: s.subtotal_amount ?? s.total_amount,
    discount_amount: s.discount_amount ?? '0.00',
    total_amount: s.total_amount,
    total_cost: s.total_cost,
    gross_profit: fromCents(cents(s.total_amount) - cents(s.total_cost)),
    items_count: s.items_count,
    returned_amount: fromCents((s.returns ?? []).reduce((sum, r) => sum + cents(r.amount), 0)),
    returns: (s.returns ?? []).map((r) => ({
      id: r.id,
      amount: r.amount,
      reason: r.reason,
      created_at: r.created_at,
      by_name: r.by_name ?? null,
      items: r.items.map((it) => ({
        product_id: it.product_id,
        product_name: db.products.find((p) => p.id === it.product_id)?.name ?? null,
        quantity: it.quantity,
        amount: it.amount,
      })),
    })),
    sold_at: s.sold_at,
    created_at: s.created_at,
    items: s.items.map(toItem).sort(byName),
  };
}

/** Completed sales of a user whose local sale date is inside [from, to]. */
export const completedSales = (userId, from, to) =>
  db.sales.filter((s) => s.user_id === userId && s.status === 'completed' && inRange(s.sold_at, from, to));

function saleOr404(userId, saleId) {
  const sale = db.sales.find((s) => s.id === saleId && s.user_id === userId);
  if (!sale) throw AppError.notFound('Sale not found');
  return sale;
}

export async function getSale(userId, saleId) {
  return toSale(saleOr404(userId, saleId));
}

/** Discount of the whole sale in tiyin (validated against the subtotal). */
function discountCents(body, subtotal) {
  if (!body.discount_type) return 0;
  const value = cents(body.discount_value);
  const discount = body.discount_type === 'percent' ? Math.round((subtotal * value) / 10_000) : value;
  if (discount > subtotal) {
    throw new AppError(400, 'DISCOUNT_TOO_LARGE', 'The discount is larger than the sale total');
  }
  return discount;
}

/**
 * Split a discount over the lines in proportion to their value (largest remainder), so every
 * line's revenue stays exact and the lines always add up to the sale total.
 */
function splitDiscount(lineTotals, discount) {
  const subtotal = lineTotals.reduce((a, b) => a + b, 0);
  if (!discount || !subtotal) return lineTotals.map(() => 0);
  const exact = lineTotals.map((v) => (v * discount) / subtotal);
  const shares = exact.map(Math.floor);
  let left = discount - shares.reduce((a, b) => a + b, 0);
  const order = exact.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    shares[i] += 1;
    left -= 1;
  }
  return shares;
}

function customerFor(userId, body) {
  if (!body.customer_id) return null;
  const customer = db.customers.find((c) => c.id === body.customer_id && c.user_id === userId && c.is_active !== false);
  if (!customer) throw new AppError(400, 'INVALID_CUSTOMER', 'Customer not found');
  return customer;
}

/**
 * Create a sale: check every product and its stock first, then save the sale and lower the stock.
 * If any check fails nothing is changed. With an Idempotency-Key a retried request returns the
 * original sale instead of creating (and taking stock for) a duplicate.
 *
 * `actor` = the person at the till ({ id, full_name, is_staff }), saved as the seller.
 */
export async function createSale(userId, body, idempotencyKey, actor = null) {
  if (idempotencyKey) {
    const existing = db.sales.find((s) => s.user_id === userId && s.idempotency_key === idempotencyKey);
    if (existing) return { sale: toSale(existing), replayed: true };
  }

  if (body.payment_method === 'debt' && !hasFeature(findUser(userId), 'debts')) {
    throw new AppError(403, 'PLAN_FEATURE_LOCKED', 'Sales on credit (nasiya) are available on the Pro plan', {
      feature: 'debts',
      required_plan: 'pro',
    });
  }
  const customer = customerFor(userId, body);

  const products = body.items.map((item) => findProduct(userId, item.product_id));
  const invalid = body.items.filter((_, i) => !products[i]).map((item) => item.product_id);
  if (invalid.length) {
    throw new AppError(400, 'INVALID_PRODUCTS', 'Some products do not exist or are archived', {
      product_ids: invalid,
    });
  }

  body.items.forEach((item, i) => assertQuantityFits(products[i], item.quantity));

  const shortages = body.items
    .map((item, i) => ({ item, p: products[i] }))
    .filter(({ item, p }) => item.quantity > p.quantity)
    .map(({ item, p }) => ({ product_id: p.id, sku: p.sku, name: p.name, available: p.quantity, requested: item.quantity }));
  if (shortages.length) {
    throw AppError.conflict('Not enough stock for some products', shortages, 'INSUFFICIENT_STOCK');
  }

  const lines = body.items.map((item, i) => ({
    id: randomUUID(),
    product_id: item.product_id,
    quantity: item.quantity,
    unit_price: item.unit_price ?? products[i].selling_price,
    unit_cost: products[i].cost_price,
  }));
  const lineTotals = lines.map((it) => Math.round(it.quantity * cents(it.unit_price)));
  const subtotal = lineTotals.reduce((a, b) => a + b, 0);
  const discount = discountCents(body, subtotal);
  const shares = splitDiscount(lineTotals, discount);
  const items = lines.map((it, i) => ({ ...it, discount: fromCents(shares[i]) }));

  const time = now();
  const sale = insert('sales', {
    user_id: userId,
    status: 'completed',
    payment_method: body.payment_method,
    customer_id: customer?.id ?? null,
    customer_name: customer?.name ?? body.customer_name ?? null,
    due_date: body.payment_method === 'debt' ? (body.due_date ?? null) : null,
    seller_id: actor?.id ?? null,
    seller_name: actor?.full_name ?? null,
    note: body.note ?? null,
    subtotal_amount: fromCents(subtotal),
    discount_amount: fromCents(discount),
    discount_type: body.discount_type ?? null,
    discount_value: body.discount_value ?? null,
    total_amount: fromCents(subtotal - discount),
    total_cost: fromCents(items.reduce((sum, it) => sum + lineCostCents(it), 0)),
    items_count: q3(items.reduce((sum, it) => sum + it.quantity, 0)),
    idempotency_key: idempotencyKey ?? null,
    sold_at: body.sold_at ? new Date(body.sold_at).toISOString() : time,
    created_at: time,
    updated_at: time,
    returns: [],
    items,
  });

  body.items.forEach((item, i) => {
    setStock(products[i], q3(products[i].quantity - item.quantity), 'sale', { saleId: sale.id });
  });

  return { sale: toSale(sale), replayed: false };
}

/**
 * Return goods of a completed sale (a customer brought them back, or the sale was entered by
 * mistake). Without `items` everything left on the sale is returned = the sale is cancelled.
 *
 * The returned quantities go back into stock (movement 'return'), and the sale's lines and totals
 * are reduced, so revenue, profit, top products and a customer's debt all stay correct.
 * When nothing is left the sale gets status 'returned'. All checks run before anything changes.
 */
export async function returnSale(userId, saleId, body, actor = null) {
  const sale = saleOr404(userId, saleId);
  if (sale.status !== 'completed') {
    throw AppError.conflict('This sale has already been fully returned', undefined, 'SALE_NOT_RETURNABLE');
  }

  const wanted = body.items ?? sale.items.map((it) => ({ product_id: it.product_id, quantity: it.quantity }));
  const problems = [];
  const plan = wanted.map((w) => {
    const line = sale.items.find((it) => it.product_id === w.product_id);
    if (!line) problems.push({ product_id: w.product_id, message: 'This product is not in the sale' });
    else if (!Number.isInteger(w.quantity) && Number.isInteger(line.quantity)) {
      problems.push({ product_id: w.product_id, message: 'The quantity must be a whole number' });
    }
    else if (w.quantity > line.quantity) {
      problems.push({ product_id: w.product_id, message: `Only ${line.quantity} can be returned`, available: line.quantity });
    }
    return { line, quantity: w.quantity };
  });
  if (problems.length) throw new AppError(400, 'INVALID_RETURN', 'Some items cannot be returned', problems);

  const returned = plan.map(({ line, quantity }) => {
    const value = lineCents(line);
    const amount = quantity === line.quantity ? value : Math.round((value * quantity) / line.quantity);
    const discountPart =
      quantity === line.quantity ? cents(line.discount ?? 0) : Math.round((cents(line.discount ?? 0) * quantity) / line.quantity);
    return { line, quantity, amount, discountPart };
  });

  // Change the sale lines.
  for (const r of returned) {
    r.line.quantity = q3(r.line.quantity - r.quantity);
    r.line.discount = fromCents(cents(r.line.discount ?? 0) - r.discountPart);
  }
  const items = sale.items.filter((it) => it.quantity > 0);
  const refund = returned.reduce((sum, r) => sum + r.amount, 0);
  const time = now();
  const record = {
    id: randomUUID(),
    amount: fromCents(refund),
    reason: body.reason ?? null,
    by_id: actor?.id ?? null,
    by_name: actor?.full_name ?? null,
    created_at: time,
    items: returned.map((r) => ({
      product_id: r.line.product_id,
      quantity: r.quantity,
      unit_price: r.line.unit_price,
      unit_cost: r.line.unit_cost,
      amount: fromCents(r.amount),
    })),
  };

  update('sales', sale, {
    items,
    status: items.length ? 'completed' : 'returned',
    subtotal_amount: fromCents(items.reduce((s, it) => s + Math.round(it.quantity * cents(it.unit_price)), 0)),
    discount_amount: fromCents(items.reduce((s, it) => s + cents(it.discount ?? 0), 0)),
    total_amount: fromCents(items.reduce((s, it) => s + lineCents(it), 0)),
    total_cost: fromCents(items.reduce((s, it) => s + lineCostCents(it), 0)),
    items_count: q3(items.reduce((s, it) => s + it.quantity, 0)),
    returns: [...(sale.returns ?? []), record],
  });

  // Put the goods back on the shelf (archived products too: the stock count is still real).
  for (const r of returned) {
    const product = findProduct(userId, r.line.product_id, { includeArchived: true });
    if (product) {
      setStock(product, q3(product.quantity + r.quantity), 'return', {
        saleId: sale.id,
        note: `Return ${invoiceNo(sale.id)}${body.reason ? `: ${body.reason}` : ''}`,
      });
    }
  }

  return toSale(sale);
}

const SORT_KEYS = { sold_at: (s) => s.sold_at, total_amount: (s) => cents(s.total_amount) };

export async function listSales(userId, q) {
  const rows = db.sales.filter(
    (s) =>
      s.user_id === userId &&
      (!q.status || s.status === q.status) &&
      (!q.payment_method || s.payment_method === q.payment_method) &&
      (!q.product_id || s.items.some((it) => it.product_id === q.product_id)) &&
      (!q.customer_id || s.customer_id === q.customer_id) &&
      (!q.seller_id || s.seller_id === q.seller_id) &&
      (!q.from && !q.to ? true : inRange(s.sold_at, q.from, q.to)),
  );
  const { items, meta } = paginate(sortRows(rows, SORT_KEYS[q.sort], q.order), q.page, q.limit);
  return { items: items.map(toSale), meta };
}

/** Totals over completed sales in a date range (default: last 30 days). */
export async function getStatistics(userId, q) {
  const { from, to } = resolveRange(q);
  const sales = completedSales(userId, from, to);
  const revenue = sales.reduce((s, x) => s + cents(x.total_amount), 0);
  const cogs = sales.reduce((s, x) => s + cents(x.total_cost), 0);
  const discounts = sales.reduce((s, x) => s + cents(x.discount_amount ?? 0), 0);
  const returns = db.sales
    .filter((s) => s.user_id === userId)
    .flatMap((s) => s.returns ?? [])
    .filter((r) => inRange(r.created_at, from, to));

  const byPayment = [...groupBy(sales, (s) => s.payment_method)]
    .map(([payment_method, list]) => ({
      payment_method,
      sales_count: list.length,
      revenue: fromCents(list.reduce((s, x) => s + cents(x.total_amount), 0)),
    }))
    .sort((a, b) => cents(b.revenue) - cents(a.revenue));

  return {
    period: { from, to },
    sales_count: sales.length,
    units_sold: q3(sales.reduce((s, x) => s + x.items_count, 0)),
    revenue: fromCents(revenue),
    cogs: fromCents(cogs),
    gross_profit: fromCents(revenue - cogs),
    average_sale_value: fromCents(sales.length ? Math.round(revenue / sales.length) : 0),
    discounts: {
      sales_count: sales.filter((s) => cents(s.discount_amount ?? 0) > 0).length,
      amount: fromCents(discounts),
      // Revenue the shop would have had without discounts.
      revenue_before_discounts: fromCents(revenue + discounts),
    },
    returns: {
      count: returns.length,
      amount: fromCents(returns.reduce((s, r) => s + cents(r.amount), 0)),
    },
    by_payment_method: byPayment,
  };
}
