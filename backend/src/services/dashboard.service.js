/**
 * Dashboard analytics. Every number is aggregated from real rows in PostgreSQL with exact
 * NUMERIC arithmetic. Only 'completed' sales count.
 *
 *   revenue      = SUM(sale total_amount)
 *   cogs         = SUM(quantity * unit_cost snapshot at time of sale)
 *   gross_profit = revenue - cogs
 *   net_profit   = gross_profit - expenses (by expense_date)
 */
import { query } from '../config/db.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { daysBetween, resolveRange, today } from '../utils/dates.js';

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

// $1 user_id, $2 from, $3 to, $4 timezone
const SALES_IN_RANGE = `
  s.user_id = $1 AND s.status = 'completed'
  AND s.sold_at >= ($2::date)::timestamp AT TIME ZONE $4
  AND s.sold_at <  ($3::date + 1)::timestamp AT TIME ZONE $4`;

const EXPENSES_IN_RANGE = 'e.user_id = $1 AND e.expense_date BETWEEN $2::date AND $3::date';

const pct = (part, whole) =>
  `CASE WHEN ${whole} > 0 THEN ROUND(${part} * 100.0 / ${whole}, 2) END`;

/** Revenue/COGS/expenses/profit totals for a period. */
async function periodTotals(userId, from, to) {
  const { rows } = await query(
    `WITH s AS (
       SELECT COUNT(*) AS sales_count,
              COALESCE(SUM(s.items_count), 0) AS units_sold,
              COALESCE(SUM(s.total_amount), 0) AS revenue,
              COALESCE(SUM(s.total_cost), 0) AS cogs
         FROM sales s WHERE ${SALES_IN_RANGE}
     ), e AS (
       SELECT COUNT(*) AS expenses_count, COALESCE(SUM(e.amount), 0) AS expenses
         FROM expenses e WHERE ${EXPENSES_IN_RANGE}
     )
     SELECT s.sales_count, s.units_sold,
            s.revenue::numeric(20,2) AS revenue,
            s.cogs::numeric(20,2) AS cogs,
            (s.revenue - s.cogs)::numeric(20,2) AS gross_profit,
            e.expenses_count,
            e.expenses::numeric(20,2) AS expenses,
            (s.revenue - s.cogs - e.expenses)::numeric(20,2) AS net_profit,
            CASE WHEN s.sales_count > 0 THEN ROUND(s.revenue / s.sales_count, 2) ELSE 0 END::numeric(20,2)
              AS average_sale_value,
            ${pct('(s.revenue - s.cogs)', 's.revenue')} AS gross_margin_percent,
            ${pct('(s.revenue - s.cogs - e.expenses)', 's.revenue')} AS net_margin_percent
       FROM s, e`,
    [userId, from, to, env.APP_TIMEZONE],
  );
  return rows[0];
}

export async function getOverview(userId, q) {
  const { from, to } = checkedRange(q);
  const totals = await periodTotals(userId, from, to);
  const todayTotals = await periodTotals(userId, today(), today());

  const { rows } = await query(
    `SELECT COUNT(*) AS active_products,
            COALESCE(SUM(i.quantity), 0) AS total_units,
            COALESCE(SUM(i.quantity * p.cost_price), 0)::numeric(20,2) AS stock_value_cost,
            COALESCE(SUM(i.quantity * p.selling_price), 0)::numeric(20,2) AS stock_value_retail,
            COUNT(*) FILTER (WHERE i.quantity > 0 AND i.quantity <= i.low_stock_threshold) AS low_stock_count,
            COUNT(*) FILTER (WHERE i.quantity = 0) AS out_of_stock_count
       FROM products p
       JOIN inventory i ON i.product_id = p.id
      WHERE p.user_id = $1 AND p.is_active`,
    [userId],
  );

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
    inventory: rows[0],
    today: {
      date: today(),
      sales_count: todayTotals.sales_count,
      revenue: todayTotals.revenue,
      net_profit: todayTotals.net_profit,
    },
  };
}

/** Time series with every bucket present (zero-filled), oldest first. */
async function series(userId, from, to, interval) {
  const { rows } = await query(
    `WITH buckets AS (
       SELECT generate_series(
                date_trunc($5::text, ($2::date)::timestamp),
                date_trunc($5::text, ($3::date)::timestamp),
                ('1 ' || $5::text)::interval
              )::date AS bucket
     ), s AS (
       SELECT date_trunc($5::text, s.sold_at AT TIME ZONE $4)::date AS bucket,
              COUNT(*) AS sales_count,
              SUM(s.items_count) AS units_sold,
              SUM(s.total_amount) AS revenue,
              SUM(s.total_cost) AS cogs
         FROM sales s WHERE ${SALES_IN_RANGE}
        GROUP BY 1
     ), e AS (
       SELECT date_trunc($5::text, e.expense_date::timestamp)::date AS bucket,
              SUM(e.amount) AS expenses
         FROM expenses e WHERE ${EXPENSES_IN_RANGE}
        GROUP BY 1
     )
     SELECT b.bucket::text AS period_start,
            COALESCE(s.sales_count, 0) AS sales_count,
            COALESCE(s.units_sold, 0) AS units_sold,
            COALESCE(s.revenue, 0)::numeric(20,2) AS revenue,
            COALESCE(s.cogs, 0)::numeric(20,2) AS cogs,
            (COALESCE(s.revenue, 0) - COALESCE(s.cogs, 0))::numeric(20,2) AS gross_profit,
            COALESCE(e.expenses, 0)::numeric(20,2) AS expenses,
            (COALESCE(s.revenue, 0) - COALESCE(s.cogs, 0) - COALESCE(e.expenses, 0))::numeric(20,2)
              AS net_profit
       FROM buckets b
       LEFT JOIN s ON s.bucket = b.bucket
       LEFT JOIN e ON e.bucket = b.bucket
      ORDER BY b.bucket`,
    [userId, from, to, env.APP_TIMEZONE, interval],
  );
  return rows;
}

const pick = (rows, keys) => rows.map((r) => Object.fromEntries(['period_start', ...keys].map((k) => [k, r[k]])));

async function seriesReport(userId, q, keys, totalKeys) {
  const { from, to } = checkedRange(q, { maxDays: MAX_DAYS[q.interval] });
  const [rows, totals] = await Promise.all([series(userId, from, to, q.interval), periodTotals(userId, from, to)]);
  return {
    period: { from, to },
    interval: q.interval,
    totals: Object.fromEntries(totalKeys.map((k) => [k, totals[k]])),
    series: pick(rows, keys),
  };
}

export const getSalesSeries = (userId, q) =>
  seriesReport(
    userId,
    q,
    ['sales_count', 'units_sold', 'revenue'],
    ['sales_count', 'units_sold', 'revenue', 'average_sale_value'],
  );

export const getRevenueSeries = (userId, q) =>
  seriesReport(
    userId,
    q,
    ['revenue', 'cogs', 'gross_profit'],
    ['revenue', 'cogs', 'gross_profit', 'gross_margin_percent'],
  );

export const getProfitSeries = (userId, q) =>
  seriesReport(
    userId,
    q,
    ['revenue', 'cogs', 'gross_profit', 'expenses', 'net_profit'],
    ['revenue', 'cogs', 'gross_profit', 'expenses', 'net_profit', 'net_margin_percent'],
  );

const TOP_ORDER = {
  revenue: 'revenue DESC',
  quantity: 'quantity_sold DESC',
  profit: 'gross_profit DESC',
};

export async function getTopProducts(userId, q) {
  const { from, to } = checkedRange(q);
  const { rows } = await query(
    `SELECT p.id AS product_id, p.sku, p.name, p.category, p.is_active,
            SUM(si.quantity) AS quantity_sold,
            COUNT(DISTINCT s.id) AS sales_count,
            SUM(si.line_total)::numeric(20,2) AS revenue,
            SUM(si.line_cost)::numeric(20,2) AS cogs,
            (SUM(si.line_total) - SUM(si.line_cost))::numeric(20,2) AS gross_profit
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
      WHERE ${SALES_IN_RANGE}
      GROUP BY p.id
      ORDER BY ${TOP_ORDER[q.by]}, p.name, p.id
      LIMIT $5`,
    [userId, from, to, env.APP_TIMEZONE, q.limit],
  );
  return { period: { from, to }, by: q.by, items: rows };
}

/**
 * Daily per-product sales history for the AI forecasting service.
 * One row per (date, product) with any completed sales. Days without sales are omitted.
 */
export async function getDailySales(userId, q) {
  const { from, to } = checkedRange(q, { defaultDays: 90, maxDays: 3 * 366 });
  const params = [userId, from, to, env.APP_TIMEZONE];
  let productFilter = '';
  if (q.product_id) {
    params.push(q.product_id);
    productFilter = `AND si.product_id = $${params.length}`;
  }

  const base = `
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    JOIN products p ON p.id = si.product_id
   WHERE ${SALES_IN_RANGE} ${productFilter}
   GROUP BY 1, si.product_id, p.sku, p.name, p.category`;

  const { rows: countRows } = await query(
    `SELECT COUNT(*) AS total FROM (SELECT (s.sold_at AT TIME ZONE $4)::date ${base}) t`,
    params,
  );

  params.push(q.limit, (q.page - 1) * q.limit);
  const { rows } = await query(
    `SELECT (s.sold_at AT TIME ZONE $4)::date::text AS date,
            si.product_id, p.sku, p.name, p.category,
            SUM(si.quantity) AS quantity,
            SUM(si.line_total)::numeric(20,2) AS revenue,
            SUM(si.line_cost)::numeric(20,2) AS cogs,
            ROUND(SUM(si.line_total) / SUM(si.quantity), 2)::numeric(20,2) AS avg_unit_price
     ${base}
     ORDER BY 1, p.sku
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  const total = countRows[0].total;
  return {
    items: rows,
    meta: {
      period: { from, to },
      timezone: env.APP_TIMEZONE,
      page: q.page,
      limit: q.limit,
      total,
      total_pages: Math.ceil(total / q.limit),
    },
  };
}
