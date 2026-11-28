import { allowsFraction } from './inventoryLedger.js';
/**
 * CSV import for products and sales. The browser parses the file; rows arrive as JSON.
 * Each row is saved on its own, so valid rows are imported and invalid rows are
 * reported back as { row, field, message } instead of failing the whole file.
 */
import { randomUUID } from 'node:crypto';
import { db, insert } from '../db/store.js';
import { normalize } from '../middleware/errorHandler.js';
import { localNoonIso, today } from '../utils/dates.js';
import { REQUIRED_COLUMNS } from '../validators/import.validators.js';
import { bulkItem } from '../validators/product.validators.js';
import { createSaleBody } from '../validators/sale.validators.js';
import { bulkUpsertProducts } from './product.service.js';
import { createSale } from './sale.service.js';

const MAX_REPORTED_ERRORS = 1000;

const str = (v) => (v == null ? '' : String(v).trim());
/** "88 500" -> "88500"; empty -> undefined. */
const numStr = (v) => {
  const s = str(v).replace(/\s/g, '');
  return s === '' ? undefined : s;
};
/** Whole number, NaN when not a whole number, undefined when empty. */
const intOrNaN = (v) => {
  const s = numStr(v);
  if (s === undefined) return undefined;
  return /^-?\d+([.,]\d{1,3})?$/.test(s) ? Number(s.replace(',', '.')) : Number.NaN;
};

// API field -> CSV column, so error reports name the column the user sees.
const PRODUCT_FIELDS = {
  selling_price: 'price',
  cost_price: 'cost',
  quantity: 'stock',
  low_stock_threshold: 'minStock',
  max_stock: 'maxStock',
};
const SALE_FIELDS = {
  'items.0.quantity': 'quantity',
  'items.0.unit_price': 'unitPrice',
  sold_at: 'date',
  customer_name: 'customer',
  payment_method: 'paymentMethod',
};

const issuesToErrors = (row, issues, fieldMap) =>
  issues.map((i) => {
    const path = i.path.join('.');
    return { row, field: fieldMap[path] ?? (path || null), message: i.message };
  });

/** Turn a save error into a row error. Unexpected errors are logged, never leaked. */
function saveError(row, err) {
  const appErr = normalize(err);
  if (!appErr) {
    console.error(`[import] row ${row}:`, err);
    return { row, field: null, message: 'Could not save this row' };
  }
  const shortage = Array.isArray(appErr.details) ? appErr.details[0] : null;
  if (appErr.code === 'INSUFFICIENT_STOCK' && shortage?.available !== undefined) {
    return { row, field: 'quantity', message: `Only ${shortage.available} in stock for ${shortage.name}` };
  }
  return { row, field: null, message: appErr.message };
}

async function importProductRow(userId, r, line) {
  const candidate = {
    sku: str(r.sku) || `SKU-${randomUUID().slice(0, 8).toUpperCase()}`,
    name: str(r.name),
    category: str(r.category),
    description: str(r.description),
    cost_price: numStr(r.cost) ?? '',
    selling_price: numStr(r.price) ?? '',
    quantity: intOrNaN(r.stock) ?? Number.NaN,
  };
  if (str(r.unit)) candidate.unit = str(r.unit);
  if (intOrNaN(r.minStock) !== undefined) candidate.low_stock_threshold = intOrNaN(r.minStock);
  if (intOrNaN(r.maxStock) !== undefined) candidate.max_stock = intOrNaN(r.maxStock);

  const errors = [];
  if (!candidate.name) errors.push({ row: line, field: 'name', message: 'Name is required' });
  if (!candidate.category) errors.push({ row: line, field: 'category', message: 'Category is required' });
  if (Number.isFinite(candidate.quantity) && !Number.isInteger(candidate.quantity) && !allowsFraction(candidate.unit ?? 'pcs')) {
    errors.push({ row: line, field: 'stock', message: 'Stock must be a whole number (fractions only for kg, l, m...)' });
  }
  const parsed = bulkItem.safeParse(candidate);
  if (!parsed.success) {
    errors.push(
      ...issuesToErrors(line, parsed.error.issues, PRODUCT_FIELDS).filter(
        (e) => !errors.some((x) => x.field === e.field),
      ),
    );
  }
  if (errors.length) return errors;

  try {
    await bulkUpsertProducts(userId, [parsed.data]);
    return [];
  } catch (err) {
    return [saveError(line, err)];
  }
}

/** lower(sku) -> product id, for the user's active products. */
function activeProductsBySku(userId) {
  return new Map(
    db.products.filter((p) => p.user_id === userId && p.is_active).map((p) => [p.sku.toLowerCase(), p.id]),
  );
}

/** Sale time for a CSV date: noon local time, or now when noon today is still ahead. */
function soldAt(date) {
  if (!date) return undefined;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(date) ? localNoonIso(date) : null;
  if (!iso) return null;
  return date === today() && Date.parse(iso) > Date.now() ? new Date().toISOString() : iso;
}

async function importSaleRow(userId, r, line, productIds) {
  const sku = str(r.sku);
  if (!sku) return [{ row: line, field: 'sku', message: 'SKU is required' }];
  const productId = productIds.get(sku.toLowerCase());
  if (!productId) return [{ row: line, field: 'sku', message: `No active product with SKU "${sku}"` }];

  const when = soldAt(str(r.date));
  if (when === null) return [{ row: line, field: 'date', message: 'Date must be a real date in YYYY-MM-DD format' }];

  const item = { product_id: productId, quantity: intOrNaN(r.quantity) ?? Number.NaN };
  if (numStr(r.unitPrice) !== undefined) item.unit_price = numStr(r.unitPrice);
  const body = { items: [item], customer_name: str(r.customer) };
  if (str(r.paymentMethod)) body.payment_method = str(r.paymentMethod).toLowerCase();
  if (when) body.sold_at = when;

  const parsed = createSaleBody.safeParse(body);
  if (!parsed.success) return issuesToErrors(line, parsed.error.issues, SALE_FIELDS);

  try {
    await createSale(userId, parsed.data);
    return [];
  } catch (err) {
    return [saveError(line, err)];
  }
}

const toResult = (row) => ({
  id: row.id,
  type: row.type,
  file_name: row.file_name,
  status: row.status,
  total_rows: row.total_rows,
  imported: row.imported,
  failed: row.failed,
  errors: row.errors,
  created_at: row.created_at,
});

export async function runImport(userId, type, { file_name, columns, rows }) {
  const errors = [];
  let imported = 0;
  let failed = 0;

  const missing = REQUIRED_COLUMNS[type].filter((c) => !columns.includes(c));
  if (missing.length) {
    const list = missing.join(', ');
    errors.push({ row: 1, field: list, message: `Missing required column(s): ${list}` });
    failed = rows.length;
  } else if (!rows.length) {
    errors.push({ row: null, field: null, message: 'The file has a header row but no data rows.' });
  } else {
    const productIds = type === 'sales' ? activeProductsBySku(userId) : null;

    // Sequential on purpose: later rows may depend on earlier ones (same SKU, stock levels).
    for (const [index, r] of rows.entries()) {
      const line = index + 2; // line 1 is the header
      const rowErrors =
        type === 'products'
          ? await importProductRow(userId, r, line)
          : await importSaleRow(userId, r, line, productIds);
      if (rowErrors.length) {
        errors.push(...rowErrors);
        failed += 1;
      } else {
        imported += 1;
      }
    }
  }

  const status = imported === 0 ? 'failed' : failed ? 'partial' : 'completed';
  const saved = insert('imports', {
    user_id: userId,
    type,
    file_name,
    status,
    total_rows: rows.length,
    imported,
    failed,
    errors: errors.slice(0, MAX_REPORTED_ERRORS),
  });
  return toResult(saved);
}

export async function listImports(userId, { limit }) {
  return db.imports
    .filter((r) => r.user_id === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit)
    .map(toResult);
}
