import api, { unwrap } from './axios';
import { clean, getAll, num, toSale, toSaleRows } from './backend';
import { isNetworkError, newKey, queueSale, reduceCachedStock } from '../utils/offline';

const postSale = (body, key) => api.post('/sales', body, { headers: { 'Idempotency-Key': key } }).then(unwrap);

/** Cart form -> backend body. */
function saleBody({ items, paymentMethod, customerId, customerName, dueDate, discountType, discountValue, note }) {
  const body = {
    items: items.map((it) => {
      const line = { product_id: it.productId, quantity: Number(it.quantity) };
      if (it.unitPrice !== undefined && it.unitPrice !== '' && it.unitPrice !== null) line.unit_price = Number(it.unitPrice);
      return line;
    }),
    payment_method: paymentMethod || 'cash',
  };
  if (customerId) body.customer_id = customerId;
  else if (String(customerName ?? '').trim()) body.customer_name = String(customerName).trim();
  if (paymentMethod === 'debt' && dueDate) body.due_date = dueDate;
  if (discountType && Number(discountValue) > 0) {
    body.discount_type = discountType;
    body.discount_value = Number(discountValue);
  }
  if (String(note ?? '').trim()) body.note = String(note).trim();
  return body;
}

const real = {
  /** One row per sale line (used by the dashboard, forecast and product pages). */
  list: async ({ from, to, productId } = {}) => {
    const sales = await getAll('/sales', clean({ from, to, product_id: productId, status: 'completed' }));
    const rows = sales.flatMap(toSaleRows);
    // A multi-item sale matches the product filter as a whole; show only that product's line.
    return productId ? rows.filter((r) => String(r.productId) === String(productId)) : rows;
  },
  /** One object per sale (with lines), for the sales page. */
  listSales: async ({ from, to, status, customerId, paymentMethod } = {}) =>
    (await getAll('/sales', clean({ from, to, status, customer_id: customerId, payment_method: paymentMethod }))).map(toSale),
  get: (id) => api.get(`/sales/${String(id).split(':')[0]}`).then(unwrap).then((s) => toSaleRows(s)[0]),
  getSale: (id) => api.get(`/sales/${id}`).then(unwrap).then(toSale),
  /** Quick one-product sale (product page). */
  create: async ({ productId, quantity, unitPrice, customer, paymentMethod }) => {
    const sale = await postSale(saleBody({ items: [{ productId, quantity, unitPrice }], paymentMethod, customerName: customer }), newKey());
    return toSaleRows(sale)[0];
  },
  /**
   * Cart sale. Without internet the sale is queued in this browser (and sent later) and
   * `{ offline: true }` is returned instead of the saved sale.
   */
  createSale: async (cart, { userId } = {}) => {
    const body = saleBody(cart);
    const key = newKey();
    try {
      return { sale: toSale(await postSale(body, key)), offline: false };
    } catch (err) {
      if (!isNetworkError(err) || body.payment_method === 'debt') throw err;
      queueSale({ userId, body, key, total: cart.expectedTotal, label: cart.items.map((it) => it.name).join(', ') });
      reduceCachedStock(userId, body.items);
      return { sale: null, offline: true };
    }
  },
  /** Send a queued offline sale. */
  postQueued: (body, key) => postSale(body, key),
  /** Return some lines (`items` = [{ productId, quantity }]) or, without items, the whole sale. */
  returnSale: (id, { items, reason } = {}) =>
    api.post(`/sales/${id}/return`, clean({
      items: items?.length ? items.map((it) => ({ product_id: it.productId, quantity: Number(it.quantity) })) : undefined,
      reason: String(reason ?? '').trim() || undefined,
    })).then(unwrap).then(toSale),
  statistics: ({ from, to } = {}) => api.get('/sales/statistics', { params: clean({ from, to }) }).then(unwrap).then((d) => ({
    revenue: num(d.revenue),
    orders: d.sales_count,
    discounts: num(d.discounts?.amount) ?? 0,
    discountedSales: d.discounts?.sales_count ?? 0,
    returnsCount: d.returns?.count ?? 0,
    returnsAmount: num(d.returns?.amount) ?? 0,
  })),
};

export const salesApi = real;

// Kept for backwards compatibility; the expenses client lives in ./expenses.api.js
export { expensesApi } from './expenses.api';
