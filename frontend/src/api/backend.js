/**
 * Backend adapter.
 *
 * The pages speak the camelCase shapes in API_CONTRACT.md. The Express backend (../backend) speaks
 * snake_case, paginates lists, keeps money as strings and stores multi-item sales. These helpers
 * translate both ways so no page needs to know which one it is talking to.
 */
import api from './axios';

/** `{ success, data, meta }` -> `{ data, meta }`. */
const body = (res) => res.data;

/** Number from a NUMERIC string ("12.50") or number; null stays null. */
export const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
export const num0 = (v) => num(v) ?? 0;

const PAGE_SIZE = 100; // backend maximum
const MAX_PAGES = 100;

/** Fetch every page of a paginated list endpoint. */
export async function getAll(url, params = {}) {
  const items = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, meta } = body(await api.get(url, { params: { ...params, page, limit: PAGE_SIZE } }));
    items.push(...data);
    if (!meta || page >= (meta.total_pages || 1)) break;
  }
  return items;
}

/** Drop undefined / empty-string values so optional query params are not sent. */
export const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== ''));

/* ------------------------------------------------------------------ auth */

export const toSubscription = (s) => s && {
  plan: s.plan,
  purchasedPlan: s.purchased_plan,
  expiresAt: s.expires_at,
  trialUsed: !!s.trial_used,
  limits: s.limits,
  features: Array.isArray(s.features) ? s.features : [],
  unlimited: !!s.unlimited,
  ...(s.usage ? { usage: { products: num0(s.usage.products), staff: num0(s.usage.staff) } } : {}),
};

export const toUser = (u) => u && {
  id: u.id,
  name: u.full_name,
  firstName: u.first_name || u.full_name || '',
  lastName: u.last_name || '',
  phone: u.phone || '',
  avatarUrl: u.avatar_url || '',
  businessName: u.business_name || '',
  email: u.email,
  // Only decides which menu items are shown; the backend re-checks the role on every call.
  role: ['admin', 'staff'].includes(u.role) ? u.role : 'user',
  ownerId: u.owner_id || null,
  // { lat, lng, address } of the shop, or null until the owner sets it
  shopLocation: u.shop_location || null,
  telegramConnected: !!u.telegram_connected,
  notifyDailyReport: u.notify_daily_report !== false,
  notifyLowStock: u.notify_low_stock !== false,
  createdAt: u.created_at,
  subscription: toSubscription(u.subscription),
};

export const toPayment = (p) => ({
  id: p.id,
  orderNo: p.order_no,
  plan: p.plan,
  months: p.months,
  amount: num0(p.amount),
  provider: p.provider,
  status: p.status,
  paidAt: p.paid_at,
  createdAt: p.created_at,
});

export const toAuth = (d) => ({ token: d.token, user: toUser(d.user) });

/* ------------------------------------------------------------------ products */

export const UNCATEGORIZED = 'Uncategorized';

export const toProduct = (p) => ({
  id: p.id,
  sku: p.sku,
  barcode: p.barcode || '',
  name: p.name,
  category: p.category || UNCATEGORIZED,
  price: num0(p.selling_price),
  cost: num0(p.cost_price),
  stock: num0(p.quantity),
  minStock: num0(p.low_stock_threshold),
  maxStock: num0(p.max_stock),
  unit: p.unit || 'pcs',
  description: p.description || '',
  imageUrl: p.image_url || '',
  createdAt: p.created_at,
  updatedAt: p.updated_at,
});

const generatedSku = () => `SKU-${Date.now().toString(36).toUpperCase()}`;

/** Form values -> backend body. The backend rejects unknown keys, so only known ones are sent. */
export function fromProduct(f, { isNew }) {
  const out = {
    name: String(f.name ?? '').trim(),
    category: String(f.category ?? '').trim(),
    unit: String(f.unit || 'pcs').trim(),
    description: String(f.description ?? ''),
    selling_price: Number(f.price),
    cost_price: Number(f.cost),
    low_stock_threshold: Math.max(0, Math.round(Number(f.minStock) || 0)),
    max_stock: Math.max(0, Math.round(Number(f.maxStock) || 0)),
    image_url: String(f.imageUrl ?? '').trim(),
  };
  out.barcode = String(f.barcode ?? '').trim();
  const sku = String(f.sku ?? '').trim();
  if (sku) out.sku = sku;
  else if (isNew) out.sku = generatedSku();
  if (isNew) out.initial_quantity = Math.max(0, Math.round(Number(f.stock) || 0));
  return out;
}

/* ------------------------------------------------------------------ sales */

export const WALK_IN = 'Walk-in';
export const invoiceNo = (saleId) => `INV-${String(saleId).slice(0, 8).toUpperCase()}`;

/** Backend sale -> one object per sale (with its lines), for the sales list, receipts and returns. */
export const toSale = (s) => ({
  id: s.id,
  invoiceNo: s.invoice_no || invoiceNo(s.id),
  status: s.status,
  paymentMethod: s.payment_method,
  customerId: s.customer_id || null,
  customer: s.customer_name || WALK_IN,
  customerPhone: s.customer_phone || '',
  dueDate: s.due_date || null,
  sellerName: s.seller_name || '',
  note: s.note || '',
  subtotal: num0(s.subtotal_amount ?? s.total_amount),
  discount: num0(s.discount_amount),
  total: num0(s.total_amount),
  // Not sent to seller (staff) accounts.
  cost: s.total_cost === undefined ? null : num0(s.total_cost),
  profit: s.gross_profit === undefined ? null : num0(s.gross_profit),
  units: num0(s.items_count),
  returned: num0(s.returned_amount),
  debtRemaining: s.debt_remaining === undefined ? null : num0(s.debt_remaining),
  returns: (s.returns || []).map((r) => ({
    id: r.id,
    amount: num0(r.amount),
    reason: r.reason || '',
    byName: r.by_name || '',
    createdAt: r.created_at,
    items: r.items.map((it) => ({ productId: it.product_id, productName: it.product_name, quantity: it.quantity, amount: num0(it.amount) })),
  })),
  items: (s.items || []).map((it) => ({
    productId: it.product_id,
    productName: it.product_name,
    sku: it.sku,
    barcode: it.barcode || '',
    unit: it.unit || 'pcs',
    category: it.category || UNCATEGORIZED,
    quantity: num0(it.quantity),
    unitPrice: num0(it.unit_price),
    unitCost: it.unit_cost === undefined ? null : num0(it.unit_cost),
    discount: num0(it.discount),
    total: num0(it.line_total),
  })),
  createdAt: s.sold_at,
});

/**
 * Backend sale (header + items) -> one frontend row per line item.
 * Sales made from this UI have one item; imported or API-made sales can have several.
 */
export function toSaleRows(s) {
  const items = s.items || [];
  return items.map((it) => ({
    id: items.length > 1 ? `${s.id}:${it.product_id}` : s.id,
    saleId: s.id,
    invoiceNo: invoiceNo(s.id),
    productId: it.product_id,
    productName: it.product_name,
    category: it.category || UNCATEGORIZED,
    quantity: num0(it.quantity),
    unitPrice: num0(it.unit_price),
    unitCost: num0(it.unit_cost),
    total: num0(it.line_total),
    customer: s.customer_name || WALK_IN,
    paymentMethod: s.payment_method,
    note: s.note || '',
    createdAt: s.sold_at,
  }));
}

/* ------------------------------------------------------------------ expenses */

/** Backend dates are YYYY-MM-DD; local noon keeps the same calendar day in every timezone. */
export const dayToIso = (day) => (day ? `${String(day).slice(0, 10)}T12:00:00` : day);

export const toExpense = (e) => ({
  id: e.id,
  category: e.category,
  amount: num0(e.amount),
  note: e.description || '',
  date: dayToIso(e.expense_date),
  paymentMethod: e.payment_method,
});

export const fromExpense = (f) => ({
  category: String(f.category ?? '').trim(),
  amount: Number(f.amount),
  description: String(f.note ?? '').trim(),
  ...(f.date ? { expense_date: String(f.date).slice(0, 10) } : {}),
});

/* ------------------------------------------------------------------ inventory */

const DEFAULT_NOTE = {
  initial: 'Opening stock',
  restock: 'Restock',
  import: 'CSV import',
  return: 'Return',
  purchase: 'Purchase',
};

export function toMovement(m) {
  const qty = num0(m.quantity_change);
  const type = m.movement_type === 'sale' ? 'sale' : qty > 0 ? 'in' : 'out';
  let note = m.note;
  if (!note && m.movement_type === 'sale' && m.sale_id) note = invoiceNo(m.sale_id);
  if (!note) note = DEFAULT_NOTE[m.movement_type] || (qty > 0 ? 'Restock' : 'Write-off');
  return {
    id: m.id,
    productId: m.product_id,
    productName: m.product_name,
    type,
    quantity: qty,
    quantityAfter: num0(m.quantity_after),
    note,
    createdAt: m.created_at,
  };
}

/* ------------------------------------------------------------------ analytics */

const pctChange = (cur, prev) => (prev ? Math.round(((cur - prev) / Math.abs(prev)) * 10000) / 100 : null);

/** /dashboard/overview -> the summary shape (without `change`). */
export function toSummary(o) {
  const revenue = num0(o.profit.revenue);
  const cogs = num0(o.profit.cogs);
  const opex = num0(o.profit.expenses);
  return {
    revenue,
    cogs,
    operatingExpenses: opex,
    totalExpenses: Math.round((cogs + opex) * 100) / 100,
    grossProfit: num0(o.profit.gross_profit),
    netProfit: num0(o.profit.net_profit),
    margin: num0(o.profit.net_margin_percent),
    orders: num0(o.sales.count),
    unitsSold: num0(o.sales.units_sold),
    avgOrderValue: num0(o.sales.average_sale_value),
    totalProducts: num0(o.inventory.active_products),
    // Same meaning as the stock badges: at or below the minimum, including empty.
    lowStockCount: num0(o.inventory.low_stock_count) + num0(o.inventory.out_of_stock_count),
    outOfStockCount: num0(o.inventory.out_of_stock_count),
    inventoryValue: num0(o.inventory.stock_value_cost),
  };
}

const CHANGE_KEYS = ['revenue', 'cogs', 'operatingExpenses', 'totalExpenses', 'grossProfit', 'netProfit', 'margin', 'orders', 'unitsSold', 'avgOrderValue'];

export const withChange = (cur, prev) => ({
  ...cur,
  change: Object.fromEntries(CHANGE_KEYS.map((k) => [k, pctChange(cur[k], prev[k])])),
});

/** YYYY-MM-DD arithmetic in UTC (no timezone drift). */
export function shiftDay(day, delta) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
export const daysInclusive = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;

/** /dashboard/profit + /dashboard/sales rows -> timeseries rows. */
export function toTimeseries(profit, sales) {
  const bySales = new Map(sales.map((r) => [r.period_start, r]));
  return profit.map((r) => {
    const s = bySales.get(r.period_start) || {};
    return {
      date: r.period_start,
      revenue: num0(r.revenue),
      cogs: num0(r.cogs),
      expenses: Math.round((num0(r.cogs) + num0(r.expenses)) * 100) / 100,
      profit: num0(r.net_profit),
      orders: num0(s.sales_count),
      units: num0(s.units_sold),
    };
  });
}

export const toTopProduct = (p) => ({
  productId: p.product_id,
  name: p.name,
  category: p.category || UNCATEGORIZED,
  revenue: num0(p.revenue),
  units: num0(p.quantity_sold),
  profit: num0(p.gross_profit),
});

export const toCategory = (c) => ({
  category: c.category || UNCATEGORIZED,
  revenue: num0(c.revenue),
  units: num0(c.quantity_sold),
});

/* ------------------------------------------------------------------ import */

export const toImport = (r) => ({
  id: r.id,
  type: r.type,
  fileName: r.file_name,
  status: r.status,
  totalRows: r.total_rows,
  imported: r.imported,
  failed: r.failed,
  errors: r.errors || [],
  createdAt: r.created_at,
});
