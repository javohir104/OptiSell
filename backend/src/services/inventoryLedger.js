/** Shared stock helpers: find a product, change its stock and write the movement history. */
import { db, insert, now, save } from '../db/store.js';
import { AppError } from '../utils/AppError.js';
import { sameText } from '../utils/list.js';
import { onStockChange } from './telegram.service.js';

/** The user's product (active only, unless includeArchived), or null. */
export function findProduct(userId, productId, { includeArchived = false } = {}) {
  const p = db.products.find((x) => x.id === productId && x.user_id === userId);
  if (!p || (!includeArchived && !p.is_active)) return null;
  return p;
}

export function productOr404(userId, productId) {
  const p = findProduct(userId, productId);
  if (!p) throw AppError.notFound('Product not found');
  return p;
}

/** Active product with this SKU (case-insensitive), or null. */
export function findBySku(userId, sku, exceptId = null) {
  return (
    db.products.find(
      (p) => p.user_id === userId && p.is_active && p.id !== exceptId && sameText(p.sku, sku),
    ) ?? null
  );
}

export function assertSkuFree(userId, sku, exceptId = null) {
  if (findBySku(userId, sku, exceptId)) {
    throw AppError.conflict('A product with this SKU already exists', undefined, 'DUPLICATE_SKU');
  }
}

export function recordMovement({ userId, productId, type, change, after, saleId = null, note = null }) {
  insert('inventory_movements', {
    user_id: userId,
    product_id: productId,
    movement_type: type,
    quantity_change: change,
    quantity_after: after,
    sale_id: saleId,
    note,
  });
}

/** Units sold by weight / volume / length can be fractional (0.75 kg); everything else is counted. */
const FRACTIONAL_UNITS = new Set(['kg', 'g', 'gr', 'l', 'ml', 'm', 'cm', 'кг', 'г', 'л', 'мл', 'м', 'litr', 'metr', 'gramm']);
export const allowsFraction = (unit) => FRACTIONAL_UNITS.has(String(unit ?? '').trim().toLowerCase());

/** Round to 0.001 so 0.1 + 0.2 style float noise never shows up in stock. */
export const q3 = (v) => Math.round(v * 1000) / 1000;

/** 400 when a counted product (pcs, box...) gets a fractional quantity. */
export function assertQuantityFits(product, qty, field = 'quantity') {
  if (!Number.isInteger(qty) && !allowsFraction(product.unit)) {
    throw new AppError(400, 'WHOLE_QUANTITY_REQUIRED', `${product.name} is sold in ${product.unit}: the quantity must be a whole number`, {
      field, product_id: product.id, unit: product.unit,
    });
  }
}

/** Set the stock of a product and record the difference. No-op when unchanged. */
export function setStock(product, rawQuantity, type, { note = null, saleId = null } = {}) {
  const quantity = q3(rawQuantity);
  const change = q3(quantity - product.quantity);
  if (change === 0) return;
  const before = product.quantity;
  product.quantity = quantity;
  product.updated_at = now();
  save('products');
  recordMovement({ userId: product.user_id, productId: product.id, type, change, after: quantity, saleId, note });
  onStockChange(product, before);
}
