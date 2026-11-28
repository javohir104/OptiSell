/**
 * Shops map: every shop whose owner has set its location.
 * Only what a customer needs is shared: name, address, map point, and the public product list.
 */
import { db } from '../db/store.js';
import { AppError } from '../utils/AppError.js';
import { isStaff, shopLocationOf } from './user.shared.js';

const listed = (u) => !isStaff(u) && u.role !== 'admin' && !u.is_test_account && u.is_active !== false;

const toShop = (user, location, viewerOwnerId) => ({
  id: user.id,
  name: user.business_name?.trim() || user.full_name || 'OptiSell',
  address: location.address,
  lat: location.lat,
  lng: location.lng,
  is_mine: user.id === viewerOwnerId,
});

export function listShops(viewerOwnerId) {
  return db.users
    .filter(listed)
    .map((u) => ({ user: u, location: shopLocationOf(u) }))
    .filter(({ location }) => location)
    .map(({ user, location }) => toShop(user, location, viewerOwnerId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A shop on the map and what it sells. Only what a customer may see: name, category, price,
 * photo and whether it is in stock (never cost price or the exact quantity).
 */
export function shopCatalog(shopId, viewerOwnerId) {
  const user = db.users.find((u) => u.id === shopId);
  const location = user && listed(user) ? shopLocationOf(user) : null;
  if (!location) throw AppError.notFound('Shop not found');
  const products = db.products
    .filter((p) => p.user_id === user.id && p.is_active)
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category ?? null,
      unit: p.unit ?? 'pcs',
      description: p.description ?? null,
      image_url: p.image_url ?? null,
      price: p.selling_price,
      in_stock: Number(p.quantity) > 0,
    }))
    // in stock first, then by name
    .sort((a, b) => Number(b.in_stock) - Number(a.in_stock) || a.name.localeCompare(b.name));
  return { shop: toShop(user, location, viewerOwnerId), products };
}
