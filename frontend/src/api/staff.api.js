import api, { unwrap } from './axios';
import { clean, num0 } from './backend';

const toStaff = (u) => ({
  id: u.id,
  name: u.full_name,
  email: u.email,
  phone: u.phone || '',
  isActive: u.is_active !== false,
  lastActiveAt: u.last_active_at,
  createdAt: u.created_at,
});

export const staffApi = {
  list: () => api.get('/staff').then(unwrap).then((d) => ({ items: d.items.map(toStaff), limit: d.limit })),
  create: ({ name, email, password, phone }) =>
    api.post('/staff', clean({ full_name: name.trim(), email: email.trim(), password, phone: phone?.trim() })).then(unwrap).then(toStaff),
  update: (id, changes) => api.patch(`/staff/${id}`, clean({
    full_name: changes.name?.trim(), phone: changes.phone, password: changes.password || undefined, is_active: changes.isActive,
  })).then(unwrap).then(toStaff),
  remove: (id) => api.delete(`/staff/${id}`).then(unwrap),
  stats: ({ from, to } = {}) => api.get('/staff/stats', { params: clean({ from, to }) }).then(unwrap).then((d) => d.items.map((r) => ({
    id: r.seller_id, name: r.seller_name, isOwner: r.is_owner, orders: r.sales_count, units: r.units_sold,
    revenue: num0(r.revenue), discounts: num0(r.discounts), aov: num0(r.average_sale_value),
  }))),
};
