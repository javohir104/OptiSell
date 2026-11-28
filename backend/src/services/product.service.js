import { db, insert, now, update } from '../db/store.js';
import { assertProductCapacity } from './subscription.service.js';
import { AppError } from '../utils/AppError.js';
import { matches, paginate, sameText, sortRows } from '../utils/list.js';
import { cents } from '../utils/money.js';
import { assertQuantityFits, assertSkuFree, findBySku, findProduct, productOr404, setStock } from './inventoryLedger.js';

const PRODUCT_FIELDS = ['sku', 'barcode', 'name', 'category', 'unit', 'description', 'image_url', 'cost_price', 'selling_price'];
const STOCK_FIELDS = ['low_stock_threshold', 'max_stock'];

/** Stored product -> API shape. */
export function toProduct(p) {
  return {
    id: p.id,
    sku: p.sku,
    barcode: p.barcode ?? null,
    name: p.name,
    category: p.category,
    unit: p.unit,
    description: p.description,
    image_url: p.image_url,
    cost_price: p.cost_price,
    selling_price: p.selling_price,
    is_active: p.is_active,
    quantity: p.quantity,
    low_stock_threshold: p.low_stock_threshold,
    max_stock: p.max_stock,
    out_of_stock: p.quantity === 0,
    low_stock: p.quantity <= p.low_stock_threshold,
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}

/** in_stock / low / out */
export function stockStatus(p) {
  if (p.quantity === 0) return 'out';
  return p.quantity <= p.low_stock_threshold ? 'low' : 'in_stock';
}

export const userProducts = (userId) => db.products.filter((p) => p.user_id === userId);

const SORT_KEYS = {
  created_at: (p) => p.created_at,
  name: (p) => p.name,
  sku: (p) => p.sku,
  selling_price: (p) => cents(p.selling_price),
  quantity: (p) => p.quantity,
};

export async function listProducts(userId, q) {
  const rows = userProducts(userId).filter(
    (p) =>
      (q.status === 'all' || p.is_active === (q.status === 'active')) &&
      matches(q.search, p.name, p.sku, p.barcode) &&
      (!q.category || sameText(p.category, q.category)) &&
      (!q.stock_status || stockStatus(p) === q.stock_status),
  );
  const { items, meta } = paginate(sortRows(rows, SORT_KEYS[q.sort], q.order), q.page, q.limit);
  return { items: items.map(toProduct), meta };
}

export async function getProduct(userId, productId) {
  const p = findProduct(userId, productId, { includeArchived: true });
  if (!p) throw AppError.notFound('Product not found');
  return toProduct(p);
}

/** Active product whose barcode (exact) or SKU (any case) is `code`. 404 when none. */
export async function lookupProduct(userId, code) {
  const products = userProducts(userId).filter((p) => p.is_active);
  const p = products.find((x) => x.barcode && x.barcode === code) ?? products.find((x) => sameText(x.sku, code));
  if (!p) throw new AppError(404, 'PRODUCT_NOT_FOUND', `No product with barcode or SKU "${code}"`);
  return toProduct(p);
}

function assertBarcodeFree(userId, barcode, exceptId = null) {
  if (!barcode) return;
  const taken = userProducts(userId).some((p) => p.is_active && p.id !== exceptId && p.barcode === barcode);
  if (taken) throw AppError.conflict('Another product already has this barcode', undefined, 'DUPLICATE_BARCODE');
}

export async function listCategories(userId) {
  const counts = new Map();
  for (const p of userProducts(userId)) {
    if (p.is_active && p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  }
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, product_count]) => ({ category, product_count }));
}

function insertProduct(userId, data, { quantity = 0, movementType = 'initial' } = {}) {
  assertProductCapacity(userId);
  assertSkuFree(userId, data.sku);
  assertBarcodeFree(userId, data.barcode);
  assertQuantityFits({ name: data.name, unit: data.unit ?? 'pcs', id: null }, quantity, 'initial_quantity');
  const time = now();
  const product = insert('products', {
    user_id: userId,
    sku: data.sku,
    barcode: data.barcode ?? null,
    name: data.name,
    category: data.category ?? null,
    unit: data.unit ?? 'pcs',
    description: data.description ?? null,
    image_url: data.image_url ?? null,
    cost_price: data.cost_price ?? '0.00',
    selling_price: data.selling_price,
    is_active: true,
    quantity: 0,
    low_stock_threshold: data.low_stock_threshold ?? 5,
    max_stock: data.max_stock ?? 0,
    created_at: time,
    updated_at: time,
  });
  setStock(product, quantity, movementType, { note: movementType === 'initial' ? 'Initial stock' : 'Bulk import' });
  return product;
}

/** Update the given fields of an active product (404 if not found or archived). */
function updateFields(userId, productId, data) {
  const product = productOr404(userId, productId);
  if (data.sku !== undefined) assertSkuFree(userId, data.sku, product.id);
  if (data.barcode !== undefined) assertBarcodeFree(userId, data.barcode, product.id);
  const changes = {};
  for (const field of [...PRODUCT_FIELDS, ...STOCK_FIELDS]) {
    if (data[field] !== undefined) changes[field] = data[field];
  }
  if (Object.keys(changes).length) update('products', product, changes);
  return product;
}

export async function createProduct(userId, data) {
  return toProduct(insertProduct(userId, data, { quantity: data.initial_quantity ?? 0 }));
}

export async function updateProduct(userId, productId, data) {
  return toProduct(updateFields(userId, productId, data));
}

/** Soft delete: sales history keeps referencing the product; its SKU becomes reusable. */
export async function archiveProduct(userId, productId) {
  const product = productOr404(userId, productId);
  update('products', product, { is_active: false });
  return { id: product.id, is_active: false };
}

/**
 * Bulk upsert by SKU (for CSV/Excel import). All-or-nothing: every row is checked before
 * anything is saved. Existing active product with the same SKU -> updated; otherwise created.
 * `quantity`, when given, sets the absolute stock level and is recorded as an 'import' movement.
 */
export async function bulkUpsertProducts(userId, items) {
  const newCount = items.filter((item) => !findBySku(userId, item.sku)).length;
  if (newCount) assertProductCapacity(userId, newCount);

  const results = items.map((item, index) => {
    const existing = findBySku(userId, item.sku);
    if (!existing) {
      const created = insertProduct(userId, item, { quantity: item.quantity ?? 0, movementType: 'import' });
      return { row: index, sku: item.sku, id: created.id, action: 'created' };
    }
    const { quantity, sku: _sku, ...fields } = item;
    updateFields(userId, existing.id, fields);
    if (quantity !== undefined) setStock(existing, quantity, 'import', { note: 'Bulk import' });
    return { row: index, sku: item.sku, id: existing.id, action: 'updated' };
  });

  return {
    created: results.filter((r) => r.action === 'created').length,
    updated: results.filter((r) => r.action === 'updated').length,
    results,
  };
}

/** EAN-13 check digit for 12 digits. */
export function ean13Check(d12) {
  const sum = [...d12].reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
}

/**
 * Give every active product without a barcode an in-store EAN-13 ("200" prefix = for internal
 * use, never clashes with factory barcodes), so labels can be printed and scanned.
 */
export async function generateBarcodes(userId, productIds) {
  const mine = userProducts(userId).filter((p) => p.is_active);
  const taken = new Set(mine.map((p) => p.barcode).filter(Boolean));
  const targets = mine.filter((p) => !p.barcode && (!productIds?.length || productIds.includes(p.id)));
  let n = mine.reduce((max, p) => (/^200\d{10}$/.test(p.barcode ?? '') ? Math.max(max, Number(p.barcode.slice(3, 12))) : max), 0);
  const updated = [];
  for (const p of targets) {
    let code;
    do {
      n += 1;
      const d12 = `200${String(n).padStart(9, '0')}`;
      code = d12 + ean13Check(d12);
    } while (taken.has(code));
    taken.add(code);
    update('products', p, { barcode: code });
    updated.push(toProduct(p));
  }
  return { generated: updated.length, items: updated };
}
