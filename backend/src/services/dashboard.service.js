/**
 * Dashboard analytics, computed from the user's real rows. Only 'completed' sales count.
 *
 *   revenue      = sum of sale total_amount
 *   cogs         = sum of quantity * unit_cost (cost at the time of sale)
 *   gross_profit = revenue - cogs
 *   net_profit   = gross_profit - expenses (by expense_date)
 *
 * All money math is done in whole tiyin (see utils/money.js).
 */
import { db } from '../db/store.js';
import { AppError } from '../utils/AppError.js';
import { bucketList, bucketStart, daysBetween, localDay, resolveRange, today } from '../utils/dates.js';
import { cents, fromCents, percent } from '../utils/money.js';
import { expensesIn } from './expense.service.js';
import { completedSales, lineCents, lineCostCents } from './sale.service.js';
import { q3 } from './inventoryLedger.js';

const MAX_DAYS = { day: 400, week: 3 * 366, month: 10 * 366 };

export function checkedRange(q, { defaultDays = 30, maxDays = 10 * 366 } = {}) {
  const range = resolveRange(q, defaultDays);
  const days = daysBetween(range.from, range.to) + 1;
  if (days > maxDays) {
    throw AppError.validation([
      { location: 'query', field: 'from', message: `Date range is too large (max ${maxDays} days)` },
    ]);
  }
  return range;
}

/** Totals (in tiyin) of a list of sales and expenses. */
function sumUp(sales, expenses) {
  const revenue = sales.reduce((s, x) => s + cents(x.total_amount), 0);
  const cogs = sales.reduce((s, x) => s + cents(x.total_cost), 0);
  const spent = expenses.reduce((s, x) => s + cents(x.amount), 0);
  return {
    sales_count: sales.length,
    units_sold: q3(sales.reduce((s, x) => s + x.items_count, 0)),
    revenue,
    cogs,
    expenses_count: expenses.length,
    expenses: spent,
  };
}

/** Revenue / COGS / expenses / profit for a period, as API strings. */
function periodTotals(userId, from, to) {
  const t = sumUp(completedSales(userId, from, to), expensesIn(userId, from, to));
  const gross = t.revenue - t.cogs;
  const net = gross - t.expenses;
  return {
    sales_count: t.sales_count,
    units_sold: t.units_sold,
    revenue: fromCents(t.revenue),
    cogs: fromCents(t.cogs),
    gross_profit: fromCents(gross),
    expenses_count: t.expenses_count,
    expenses: fromCents(t.expenses),
    net_profit: fromCents(net),
    average_sale_value: fromCents(t.sales_count ? Math.round(t.revenue / t.sales_count) : 0),
    gross_margin_percent: percent(gross, t.revenue),
    net_margin_percent: percent(net, t.revenue),
  };
}

export async function getOverview(userId, q) {
  const { from, to } = checkedRange(q);
  const totals = periodTotals(userId, from, to);
  const day = today();
  const todayTotals = periodTotals(userId, day, day);

  const products = db.products.filter((p) => p.user_id === userId && p.is_active);
  const inventory = {
    active_products: products.length,
    total_units: q3(products.reduce((s, p) => s + p.quantity, 0)),
    stock_value_cost: fromCents(products.reduce((s, p) => s + Math.round(p.quantity * cents(p.cost_price)), 0)),
    stock_value_retail: fromCents(products.reduce((s, p) => s + Math.round(p.quantity * cents(p.selling_price)), 0)),
    low_stock_count: products.filter((p) => p.quantity > 0 && p.quantity <= p.low_stock_threshold).length,
    out_of_stock_count: products.filter((p) => p.quantity === 0).length,
  };

  return {
    period: { from, to },
    sales: {
      count: totals.sales_count,
      units_sold: totals.units_sold,
      revenue: totals.revenue,
      average_sale_value: totals.average_sale_value,
    },
    profit: {
      revenue: totals.revenue,
      cogs: totals.cogs,
      gross_profit: totals.gross_profit,
      expenses: totals.expenses,
      net_profit: totals.net_profit,
      gross_margin_percent: totals.gross_margin_percent,
      net_margin_percent: totals.net_margin_percent,
    },
    inventory,
    today: {
      date: day,
      sales_count: todayTotals.sales_count,
      revenue: todayTotals.revenue,
      net_profit: todayTotals.net_profit,
    },
  };
}

/** Time series with every bucket present (zero-filled), oldest first. */
function series(userId, from, to, interval) {
  const sales = new Map();
  for (const s of completedSales(userId, from, to)) {
    const key = bucketStart(localDay(s.sold_at), interval);
    if (!sales.has(key)) sales.set(key, []);
    sales.get(key).push(s);
  }
  const expenses = new Map();
  for (const e of expensesIn(userId, from, to)) {
    const key = bucketStart(e.expense_date, interval);
    if (!expenses.has(key)) expenses.set(key, []);
    expenses.get(key).push(e);
  }

  return bucketList(from, to, interval).map((period_start) => {
    const t = sumUp(sales.get(period_start) ?? [], expenses.get(period_start) ?? []);
    return {
      period_start,
      sales_count: t.sales_count,
      units_sold: t.units_sold,
      revenue: fromCents(t.revenue),
      cogs: fromCents(t.cogs),
      gross_profit: fromCents(t.revenue - t.cogs),
      expenses: fromCents(t.expenses),
      net_profit: fromCents(t.revenue - t.cogs - t.expenses),
    };
  });
}

const pick = (row, keys) => Object.fromEntries(keys.map((k) => [k, row[k]]));

function seriesReport(userId, q, keys, totalKeys) {
  const { from, to } = checkedRange(q, { maxDays: MAX_DAYS[q.interval] });
  return {
    period: { from, to },
    interval: q.interval,
    totals: pick(periodTotals(userId, from, to), totalKeys),
    series: series(userId, from, to, q.interval).map((r) => pick(r, ['period_start', ...keys])),
  };
}

export const getSalesSeries = async (userId, q) =>
  seriesReport(userId, q, ['sales_count', 'units_sold', 'revenue'], ['sales_count', 'units_sold', 'revenue', 'average_sale_value']);

export const getRevenueSeries = async (userId, q) =>
  seriesReport(userId, q, ['revenue', 'cogs', 'gross_profit'], ['revenue', 'cogs', 'gross_profit', 'gross_margin_percent']);

export const getProfitSeries = async (userId, q) =>
  seriesReport(
    userId,
    q,
    ['revenue', 'cogs', 'gross_profit', 'expenses', 'net_profit'],
    ['revenue', 'cogs', 'gross_profit', 'expenses', 'net_profit', 'net_margin_percent'],
  );

/** Per-product sold quantity / revenue / cost (in tiyin) over completed sales in a range. */
function productSales(userId, from, to) {
  const byProduct = new Map();
  for (const sale of completedSales(userId, from, to)) {
    for (const it of sale.items) {
      const row = byProduct.get(it.product_id) ?? { quantity: 0, revenue: 0, cogs: 0, sales: new Set() };
      row.quantity = q3(row.quantity + it.quantity);
      row.revenue += lineCents(it);
      row.cogs += lineCostCents(it);
      row.sales.add(sale.id);
      byProduct.set(it.product_id, row);
    }
  }
  return [...byProduct].map(([productId, row]) => ({
    product: db.products.find((p) => p.id === productId),
    ...row,
  }));
}

const TOP_ORDER = {
  revenue: (r) => r.revenue,
  quantity: (r) => r.quantity,
  profit: (r) => r.revenue - r.cogs,
};

export async function getTopProducts(userId, q) {
  const { from, to } = checkedRange(q);
  const key = TOP_ORDER[q.by];
  const dir = q.order === 'asc' ? 1 : -1;
  const items = productSales(userId, from, to)
    .sort((a, b) => dir * (key(a) - key(b)) || a.product.name.localeCompare(b.product.name))
    .slice(0, q.limit)
    .map((r) => ({
      product_id: r.product.id,
      sku: r.product.sku,
      name: r.product.name,
      category: r.product.category,
      is_active: r.product.is_active,
      quantity_sold: r.quantity,
      sales_count: r.sales.size,
      revenue: fromCents(r.revenue),
      cogs: fromCents(r.cogs),
      gross_profit: fromCents(r.revenue - r.cogs),
    }));
  return { period: { from, to }, by: q.by, order: q.order, items };
}

/** Revenue and units per product category (products without a category are grouped as null). */
export async function getCategories(userId, q) {
  const { from, to } = checkedRange(q);
  const byCategory = new Map();
  for (const r of productSales(userId, from, to)) {
    const category = r.product.category ?? null;
    const row = byCategory.get(category) ?? { category, quantity: 0, revenue: 0, cogs: 0 };
    row.quantity = q3(row.quantity + r.quantity);
    row.revenue += r.revenue;
    row.cogs += r.cogs;
    byCategory.set(category, row);
  }
  const items = [...byCategory.values()]
    .sort((a, b) => b.revenue - a.revenue || String(a.category ?? '￿').localeCompare(String(b.category ?? '￿')))
    .map((r) => ({
      category: r.category,
      quantity_sold: r.quantity,
      revenue: fromCents(r.revenue),
      gross_profit: fromCents(r.revenue - r.cogs),
    }));
  return { period: { from, to }, items };
}
