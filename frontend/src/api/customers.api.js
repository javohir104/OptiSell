import api, { unwrap } from './axios';
import { clean, getAll, num0, toSale } from './backend';

const toCustomer = (c) => ({
  id: c.id,
  name: c.name,
  phone: c.phone || '',
  note: c.note || '',
  totalDebt: num0(c.total_debt),
  totalPaid: num0(c.total_paid),
  balance: num0(c.balance),
  overdueAmount: num0(c.overdue_amount),
  isOverdue: !!c.is_overdue,
  nextDueDate: c.next_due_date || null,
  lastSaleAt: c.last_sale_at || null,
  createdAt: c.created_at,
});

const toPayment = (p) => ({
  id: p.id,
  amount: num0(p.amount),
  method: p.method,
  note: p.note || '',
  receivedBy: p.received_by_name || '',
  paidAt: p.paid_at,
});

const fromCustomer = (f) => ({
  name: String(f.name ?? '').trim(),
  phone: String(f.phone ?? '').trim(),
  note: String(f.note ?? '').trim(),
});

export const customersApi = {
  list: async ({ search, status } = {}) => {
    // The summary (all customers) comes with every page; one small request is enough for it.
    const [first, all] = await Promise.all([
      api.get('/customers', { params: { limit: 1 } }),
      getAll('/customers', clean({ search, status, sort: 'name', order: 'asc' })),
    ]);
    const s = first.data.meta?.summary || {};
    return {
      items: all.map(toCustomer),
      summary: {
        customers: s.customers ?? 0,
        debtors: s.debtors ?? 0,
        overdue: s.overdue ?? 0,
        totalDebt: num0(s.total_debt),
        overdueAmount: num0(s.overdue_amount),
      },
    };
  },
  get: (id) => api.get(`/customers/${id}`).then(unwrap).then((c) => ({
    ...toCustomer(c),
    sales: c.sales.map(toSale),
    payments: c.payments.map(toPayment),
  })),
  create: (f) => api.post('/customers', fromCustomer(f)).then(unwrap).then(toCustomer),
  update: (id, f) => api.put(`/customers/${id}`, fromCustomer(f)).then(unwrap).then(toCustomer),
  remove: (id) => api.delete(`/customers/${id}`).then(unwrap),
  pay: (id, { amount, method, note }) =>
    api.post(`/customers/${id}/payments`, clean({ amount: Number(amount), method, note: String(note ?? '').trim() || undefined }))
      .then(unwrap).then((d) => ({ payment: toPayment(d.payment), customer: toCustomer(d.customer) })),
  removePayment: (id, paymentId) => api.delete(`/customers/${id}/payments/${paymentId}`).then(unwrap),
};
