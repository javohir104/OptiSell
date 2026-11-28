/**
 * Seller (staff) accounts. The shop owner creates them; a seller signs in on the normal login page
 * and works with the owner's shop: sells, looks up products and customers, takes debt payments.
 * Sellers never see purchase prices or profit, and cannot open reports, expenses or settings
 * (see ownerOnly / hideCostsFromStaff in middleware/auth.js).
 */
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { limitsOf } from '../config/plans.js';
import { db, now, remove, update } from '../db/store.js';
import { AppError } from '../utils/AppError.js';
import { resolveRange } from '../utils/dates.js';
import { cents, fromCents } from '../utils/money.js';
import { createUser } from './auth.service.js';
import { completedSales } from './sale.service.js';
import { findUser, isStaff } from './user.shared.js';

const staffOf = (ownerId) => db.users.filter((u) => isStaff(u) && u.owner_id === ownerId);

function toStaff(u) {
  return {
    id: u.id,
    full_name: u.full_name,
    email: u.email,
    phone: u.phone ?? null,
    is_active: u.is_active !== false,
    last_active_at: u.last_active_at ?? null,
    created_at: u.created_at,
  };
}

function staffOr404(ownerId, id) {
  const u = db.users.find((x) => x.id === id && isStaff(x) && x.owner_id === ownerId);
  if (!u) throw AppError.notFound('Seller not found');
  return u;
}

export async function listStaff(ownerId) {
  const owner = findUser(ownerId);
  return {
    items: staffOf(ownerId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(toStaff),
    limit: limitsOf(owner).staff,
  };
}

export async function createStaff(ownerId, data) {
  const owner = findUser(ownerId);
  const limit = limitsOf(owner).staff ?? Infinity;
  if (staffOf(ownerId).length >= limit) {
    throw new AppError(403, 'PLAN_LIMIT_STAFF', `Your plan allows up to ${limit} sellers`, { limit });
  }
  const user = createUser({
    email: data.email,
    password_hash: await bcrypt.hash(data.password, env.BCRYPT_ROUNDS),
    full_name: data.full_name,
    first_name: data.full_name,
    phone: data.phone ?? null,
    role: 'staff',
    owner_id: ownerId,
    is_active: true,
    // Sellers are counted in the owner's shop, not as separate customers of OptiSell.
    is_test_account: owner.is_test_account ?? false,
  });
  return toStaff(user);
}

export async function updateStaff(ownerId, id, data) {
  const u = staffOr404(ownerId, id);
  const changes = {};
  if (data.full_name !== undefined) Object.assign(changes, { full_name: data.full_name, first_name: data.full_name });
  if (data.phone !== undefined) changes.phone = data.phone;
  if (data.is_active !== undefined) changes.is_active = data.is_active;
  if (data.password !== undefined) changes.password_hash = await bcrypt.hash(data.password, env.BCRYPT_ROUNDS);
  return toStaff(update('users', u, changes));
}

/** Delete the seller's account. Their past sales stay (with the seller's name on them). */
export async function deleteStaff(ownerId, id) {
  staffOr404(ownerId, id);
  remove('users', (u) => u.id === id);
  return { id, deleted: true };
}

/** Sales per seller in a period (the owner's own sales are listed as the owner). */
export async function sellerStats(ownerId, q) {
  const { from, to } = resolveRange(q);
  const owner = findUser(ownerId);
  const rows = new Map();
  const row = (id, name) => {
    if (!rows.has(id)) rows.set(id, { seller_id: id, seller_name: name, sales_count: 0, units_sold: 0, revenue: 0, discounts: 0 });
    return rows.get(id);
  };
  for (const s of staffOf(ownerId)) row(s.id, s.full_name);
  for (const sale of completedSales(ownerId, from, to)) {
    const id = sale.seller_id ?? ownerId;
    const r = row(id, id === ownerId ? owner.full_name : (findUser(id)?.full_name ?? sale.seller_name ?? '—'));
    r.sales_count += 1;
    r.units_sold = Math.round((r.units_sold + sale.items_count) * 1000) / 1000;
    r.revenue += cents(sale.total_amount);
    r.discounts += cents(sale.discount_amount ?? 0);
  }
  const items = [...rows.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .map((r) => ({
      ...r,
      is_owner: r.seller_id === ownerId,
      revenue: fromCents(r.revenue),
      discounts: fromCents(r.discounts),
      average_sale_value: fromCents(r.sales_count ? Math.round(r.revenue / r.sales_count) : 0),
    }));
  return { period: { from, to }, items, generated_at: now() };
}
