import api, { unwrap } from './axios';
import { clean, getAll, num0 } from './backend';

const toSupplier = (s) => ({
  id: s.id,
  name: s.name,
  phone: s.phone || '',
  company: s.company || '',
  note: s.note || '',
  totalPurchased: num0(s.total_purchased),
  totalPaid: num0(s.total_paid),
  balance: num0(s.balance),
  purchasesCount: s.purchases_count || 0,
  lastPurchaseAt: s.last_purchase_at || null,
});

const toPurchase = (p) => ({
  id: p.id,
  supplierId: p.supplier_id,
  supplierName: p.supplier_name || '',
  status: p.status,
  total: num0(p.total_amount),
  paid: num0(p.paid_amount),
  debt: num0(p.debt_amount),
  units: p.items_count,
  note: p.note || '',
  purchasedAt: p.purchased_at,
  items: p.items.map((it) => ({
    productId: it.product_id, productName: it.product_name, unit: it.unit, quantity: it.quantity,
    unitCost: num0(it.unit_cost), total: num0(it.line_total),
  })),
});

const toPayment = (p) => ({ id: p.id, amount: num0(p.amount), method: p.method, note: p.note || '', paidAt: p.paid_at });

const fromSupplier = (f) => ({
  name: String(f.name ?? '').trim(),
  phone: String(f.phone ?? '').trim(),
  company: String(f.company ?? '').trim(),
  note: String(f.note ?? '').trim(),
});

export const suppliersApi = {
  list: async ({ search } = {}) => {
    const [first, all] = await Promise.all([
      api.get('/suppliers', { params: { limit: 1 } }),
      getAll('/suppliers', clean({ search, sort: 'name', order: 'asc' })),
    ]);
    const s = first.data.meta?.summary || {};
    return { items: all.map(toSupplier), summary: { suppliers: s.suppliers ?? 0, totalOwed: num0(s.total_owed) } };
  },
  get: (id) => api.get(`/suppliers/${id}`).then(unwrap).then((s) => ({
    ...toSupplier(s),
    purchases: s.purchases.map(toPurchase),
    payments: s.payments.map(toPayment),
  })),
  create: (f) => api.post('/suppliers', fromSupplier(f)).then(unwrap).then(toSupplier),
  update: (id, f) => api.put(`/suppliers/${id}`, fromSupplier(f)).then(unwrap).then(toSupplier),
  remove: (id) => api.delete(`/suppliers/${id}`).then(unwrap),
  /** { items: [{ productId, quantity, unitCost }], paid, updateCost, note } */
  purchase: (id, { items, paid, updateCost = true, note }) =>
    api.post(`/suppliers/${id}/purchases`, clean({
      items: items.map((it) => ({ product_id: it.productId, quantity: Number(it.quantity), unit_cost: Number(it.unitCost) })),
      paid_amount: paid === '' || paid === undefined || paid === null ? undefined : Number(paid),
      update_cost: updateCost,
      note: String(note ?? '').trim() || undefined,
    })).then(unwrap).then(toPurchase),
  cancelPurchase: (id, purchaseId) => api.post(`/suppliers/${id}/purchases/${purchaseId}/cancel`).then(unwrap).then(toPurchase),
  pay: (id, { amount, method, note }) =>
    api.post(`/suppliers/${id}/payments`, clean({ amount: Number(amount), method, note: String(note ?? '').trim() || undefined }))
      .then(unwrap).then((d) => ({ payment: toPayment(d.payment), supplier: toSupplier(d.supplier) })),
};
