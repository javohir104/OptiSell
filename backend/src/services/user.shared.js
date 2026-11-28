import { effectivePlan, featuresOf, limitsOf } from '../config/plans.js';
import { db } from '../db/store.js';

export const findUserByEmail = (email) => db.users.find((u) => u.email === email) ?? null;
export const findUser = (id) => db.users.find((u) => u.id === id) ?? null;

/** Seller accounts belong to a shop owner: they work with the owner's data and plan. */
export const isStaff = (row) => row?.role === 'staff' && Boolean(row.owner_id);

/** The account whose data and subscription this user works with (itself, or the shop owner). */
export const ownerOf = (row) => (isStaff(row) ? findUser(row.owner_id) : row);

const ROLES = ['user', 'admin', 'staff'];

/** Where the shop is on the map, or null when the owner has not set it yet. */
export function shopLocationOf(owner) {
  if (!Number.isFinite(owner?.shop_lat) || !Number.isFinite(owner?.shop_lng)) return null;
  return { lat: owner.shop_lat, lng: owner.shop_lng, address: owner.shop_address ?? null };
}

/** Stored user -> API user (never the password hash) with the subscription in force right now. */
export function toPublicUser(row) {
  if (!row) return row;
  const owner = ownerOf(row) ?? row;
  const { plan, plan_expires_at, trial_used } = owner;
  const current = effectivePlan(owner);
  const unlimited = owner.role === 'admin';
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    phone: row.phone ?? null,
    avatar_url: row.avatar_url ?? null,
    business_name: owner.business_name ?? row.business_name ?? null,
    role: ROLES.includes(row.role) ? row.role : 'user',
    owner_id: isStaff(row) ? row.owner_id : null,
    shop_location: shopLocationOf(owner),
    telegram_connected: Boolean(row.telegram_chat_id),
    notify_daily_report: row.notify_daily_report !== false,
    notify_low_stock: row.notify_low_stock !== false,
    created_at: row.created_at,
    subscription: {
      plan: current,
      purchased_plan: plan,
      expires_at: current === 'free' || unlimited ? null : plan_expires_at,
      trial_used: Boolean(trial_used),
      unlimited,
      limits: limitsOf(owner),
      features: featuresOf(owner),
    },
  };
}
