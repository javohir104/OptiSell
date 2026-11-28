/**
 * Suppliers, purchases (stock arrivals) and what the shop owes them.
 *
 *   purchase.total = sum of quantity * unit_cost of its lines
 *   balance        = sum(purchase.total) - sum(purchase.paid_amount) - sum(supplier_payments)
 *                    (> 0: the shop owes the supplier)
 *
 * Saving a purchase adds the goods to stock (movement 'purchase') and, unless update_cost is
 * false, sets each product's cost_price to the new purchase price.
 */
import { randomUUID } from 'node:crypto';
import { db, insert, now, update } from '../db/store.js';
import { AppError } from '../utils/AppError.js';
import { inRange } from '../utils/dates.js';
import { matches, paginate, sortRows } from '../utils/list.js';
import { cents, fromCents } from '../utils/money.js';
import { assertQuantityFits, findProduct, q3, setStock } from './inventoryLedger.js';

const purchasesOf = (userId, supplierId) =>
  db.purchases.filter((p) => p.user_id === userId && p.supplier_id === supplierId && p.status !== 'cancelled');
const paymentsOf = (userId, supplierId) =>
  db.supplier_payments.filter((p) => p.user_id === userId && p.supplier_id === supplierId);

function ledger(userId, supplierId) {
  const purchases = purchasesOf(userId, supplierId);
  const bought = purchases.reduce((s, p) => s + cents(p.total_amount), 0);
  const paidAtPurchase = purchases.reduce((s, p) => s + cents(p.paid_amount), 0);
  const paidLater = paymentsOf(userId, supplierId).reduce((s, p) => s + cents(p.amount), 0);
  return {
    bought,
    paid: paidAtPurchase + paidLater,
    balance: bought - paidAtPurchase - paidLater,
    purchases_count: purchases.length,
    last_purchase_at: purchases.map((p) => p.purchased_at).sort().pop() ?? null,
  };
}

function toSupplier(s) {
  const l = ledger(s.user_id, s.id);
  return {
    id: s.id,
    name: s.name,
    phone: s.phone,
    company: s.company,
    note: s.note,
    total_purchased: fromCents(l.bought),
    total_paid: fromCents(l.paid),
    balance: fromCents(l.balance),
    purchases_count: l.purchases_count,
    last_purchase_at: l.last_purchase_at,
    created_at: s.created_at,
    updated_at: s.updated_at,
  };
}

function toPurchase(p) {
  return {
    id: p.id,
    supplier_id: p.supplier_id,
    supplier_name: db.suppliers.find((s) => s.id === p.supplier_id)?.name ?? null,
    status: p.status ?? 'received',
    total_amount: p.total_amount,
    paid_amount: p.paid_amount,
    debt_amount: fromCents(cents(p.total_amount) - cents(p.paid_amount)),
    items_count: q3(p.items.reduce((s, it) => s + it.quantity, 0)),
    note: p.note,
    purchased_at: p.purchased_at,
    created_at: p.created_at,
    items: p.items.map((it) => {
      const product = db.products.find((x) => x.id === it.product_id);
      return {
        id: it.id,
        product_id: it.product_id,
        product_name: product?.name ?? null,
        sku: product?.sku ?? null,
        unit: product?.unit ?? 'pcs',
        quantity: it.quantity,
        unit_cost: it.unit_cost,
        line_total: fromCents(Math.round(it.quantity * cents(it.unit_cost))),
      };
    }),
  };
}

const toPayment = (p) => ({
  id: p.id,
  supplier_id: p.supplier_id,
  amount: p.amount,
  method: p.method,
  note: p.note,
  paid_at: p.paid_at,
  created_at: p.created_at,
});

function supplierOr404(userId, id) {
  const s = db.suppliers.find((x) => x.id === id && x.user_id === userId && x.is_active !== false);
  if (!s) throw AppError.notFound('Supplier not found');
  return s;
}

const SORT_KEYS = {
  name: (s) => s.name.toLowerCase(),
  balance: (s) => cents(s.balance),
  last_purchase_at: (s) => s.last_purchase_at,
};

export async function listSuppliers(userId, q) {
  const rows = db.suppliers
    .filter((s) => s.user_id === userId && s.is_active !== false && matches(q.search, s.name, s.phone, s.company))
    .map(toSupplier);
  const { items, meta } = paginate(sortRows(rows, SORT_KEYS[q.sort], q.order), q.page, q.limit);
  const summary = {
    suppliers: rows.length,
    total_owed: fromCents(rows.reduce((s, x) => s + Math.max(cents(x.balance), 0), 0)),
  };
  return { items, meta: { ...meta, summary } };
}

export async function getSupplier(userId, id) {
  const s = supplierOr404(userId, id);
  return {
    ...toSupplier(s),
    purchases: db.purchases
      .filter((p) => p.user_id === userId && p.supplier_id === id)
      .sort((a, b) => b.purchased_at.localeCompare(a.purchased_at))
      .slice(0, 200)
      .map(toPurchase),
    payments: paymentsOf(userId, id)
      .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
      .slice(0, 200)
      .map(toPayment),
  };
}

export async function createSupplier(userId, data) {
  const time = now();
  return toSupplier(
    insert('suppliers', {
      user_id: userId,
      name: data.name,
      phone: data.phone ?? null,
      company: data.company ?? null,
      note: data.note ?? null,
      is_active: true,
      created_at: time,
      updated_at: time,
    }),
  );
}

export async function updateSupplier(userId, id, data) {
  const s = supplierOr404(userId, id);
  const changes = {};
  for (const k of ['name', 'phone', 'company', 'note']) if (data[k] !== undefined) changes[k] = data[k];
  return toSupplier(update('suppliers', s, changes));
}

export async function archiveSupplier(userId, id) {
  const s = supplierOr404(userId, id);
  if (ledger(userId, id).balance > 0) {
    throw AppError.conflict('You still owe this supplier. Record the payment first.', undefined, 'SUPPLIER_HAS_DEBT');
  }
  update('suppliers', s, { is_active: false });
  return { id, is_active: false };
}

/** Receive goods from a supplier. All products are checked before anything changes. */
export async function createPurchase(userId, supplierId, data) {
  const supplier = supplierOr404(userId, supplierId);
  const products = data.items.map((it) => findProduct(userId, it.product_id));
  const invalid = data.items.filter((_, i) => !products[i]).map((it) => it.product_id);
  if (invalid.length) {
    throw new AppError(400, 'INVALID_PRODUCTS', 'Some products do not exist or are archived', { product_ids: invalid });
  }
  data.items.forEach((it, i) => assertQuantityFits(products[i], it.quantity));
  const items = data.items.map((it) => ({
    id: randomUUID(),
    product_id: it.product_id,
    quantity: it.quantity,
    unit_cost: it.unit_cost,
  }));
  const total = items.reduce((s, it) => s + Math.round(it.quantity * cents(it.unit_cost)), 0);
  const paid = data.paid_amount === undefined ? total : cents(data.paid_amount);
  if (paid > total) throw new AppError(400, 'PAID_TOO_MUCH', 'Paid amount is larger than the purchase total');

  const time = now();
  const purchase = insert('purchases', {
    user_id: userId,
    supplier_id: supplier.id,
    status: 'received',
    total_amount: fromCents(total),
    paid_amount: fromCents(paid),
    note: data.note ?? null,
    purchased_at: data.purchased_at ? new Date(`${data.purchased_at}T12:00:00Z`).toISOString() : time,
    created_at: time,
    updated_at: time,
    items,
  });

  items.forEach((it, i) => {
    const p = products[i];
    if (data.update_cost !== false && p.cost_price !== it.unit_cost) update('products', p, { cost_price: it.unit_cost });
    setStock(p, q3(p.quantity + it.quantity), 'purchase', { note: `Purchase: ${supplier.name}` });
  });
  return toPurchase(purchase);
}

/** Undo a purchase entered by mistake: takes the goods back out of stock (if they are still there). */
export async function cancelPurchase(userId, supplierId, purchaseId) {
  supplierOr404(userId, supplierId);
  const purchase = db.purchases.find((p) => p.id === purchaseId && p.user_id === userId && p.supplier_id === supplierId);
  if (!purchase) throw AppError.notFound('Purchase not found');
  if (purchase.status === 'cancelled') throw AppError.conflict('This purchase is already cancelled', undefined, 'ALREADY_CANCELLED');

  const lines = purchase.items.map((it) => ({ it, p: findProduct(userId, it.product_id, { includeArchived: true }) }));
  const short = lines
    .filter(({ it, p }) => p && p.quantity < it.quantity)
    .map(({ it, p }) => ({ product_id: p.id, name: p.name, available: p.quantity, required: it.quantity }));
  if (short.length) {
    throw AppError.conflict('Some of these goods have already been sold, so the purchase cannot be undone', short, 'INSUFFICIENT_STOCK');
  }
  for (const { it, p } of lines) {
    if (p) setStock(p, q3(p.quantity - it.quantity), 'adjustment', { note: 'Purchase cancelled' });
  }
  update('purchases', purchase, { status: 'cancelled' });
  return toPurchase(purchase);
}

export async function addPayment(userId, supplierId, data) {
  const s = supplierOr404(userId, supplierId);
  const l = ledger(userId, supplierId);
  if (cents(data.amount) > l.balance) {
    throw new AppError(400, 'PAYMENT_TOO_LARGE', `You owe this supplier only ${fromCents(Math.max(l.balance, 0))}`, {
      balance: fromCents(l.balance),
    });
  }
  const time = now();
  const payment = insert('supplier_payments', {
    user_id: userId,
    supplier_id: s.id,
    amount: data.amount,
    method: data.method ?? 'cash',
    note: data.note ?? null,
    paid_at: data.paid_at ? new Date(`${data.paid_at}T12:00:00Z`).toISOString() : time,
    created_at: time,
  });
  return { payment: toPayment(payment), supplier: toSupplier(s) };
}

/** All purchases in a date range (for the purchases list). */
export async function listPurchases(userId, q) {
  const rows = db.purchases.filter(
    (p) => p.user_id === userId && (!q.supplier_id || p.supplier_id === q.supplier_id) && inRange(p.purchased_at, q.from, q.to),
  );
  const { items, meta } = paginate(sortRows(rows, (p) => p.purchased_at, 'desc'), q.page, q.limit);
  return { items: items.map(toPurchase), meta };
}
