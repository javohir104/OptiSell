import { z } from 'zod';
import {
  money,
  nonNegativeQuantity,
  optionalText,
  pagination,
  search,
  sortOrder,
  text,
} from './common.js';

// No control characters in SKUs (they're shown in UIs, CSVs and barcodes).
const sku = text(64).regex(/^[^\x00-\x1F\x7F]+$/, 'SKU contains invalid characters');

// Only http(s) URLs, so a stored value can never become a javascript: link in the UI.
const imageUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^https?:\/\/[^\s]+$/i.test(v), 'Must be an http(s) URL')
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

// Barcode printed on the package (EAN-13, UPC, Code128...). Digits/letters only.
const barcode = z
  .string()
  .trim()
  .max(64)
  .refine((v) => v === '' || /^[A-Za-z0-9\-.]+$/.test(v), 'Barcode may contain only letters, digits, "-" and "."')
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

const editableFields = {
  sku,
  barcode,
  name: text(200),
  category: optionalText(100),
  unit: text(20).optional(),
  description: optionalText(2000),
  cost_price: money.optional(),
  selling_price: money,
  low_stock_threshold: nonNegativeQuantity.optional(),
  max_stock: nonNegativeQuantity.optional(), // 0 = no upper level
  image_url: imageUrl,
};

export const createProductBody = z.strictObject({
  ...editableFields,
  initial_quantity: nonNegativeQuantity.optional(),
});

export const updateProductBody = z
  .strictObject({
    ...editableFields,
    selling_price: money.optional(),
    sku: sku.optional(),
    name: text(200).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { error: 'Provide at least one field to update' });

export const listProductsQuery = z.object({
  ...pagination,
  search,
  category: text(100).optional(),
  status: z.enum(['active', 'archived', 'all']).default('active'),
  stock_status: z.enum(['in_stock', 'low', 'out']).optional(),
  sort: z.enum(['created_at', 'name', 'sku', 'selling_price', 'quantity']).default('created_at'),
  order: sortOrder,
});

export const bulkItem = z.strictObject({
  ...editableFields,
  // Absolute stock level to set. Omit to leave existing stock unchanged (0 for new products).
  quantity: nonNegativeQuantity.optional(),
});

export const bulkProductsBody = z
  .strictObject({ products: z.array(bulkItem).min(1).max(1000) })
  .superRefine((body, ctx) => {
    const seen = new Map();
    body.products.forEach((p, i) => {
      const key = p.sku.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['products', i, 'sku'],
          message: `Duplicate SKU in request (same as row ${seen.get(key)})`,
        });
      } else {
        seen.set(key, i);
      }
    });
  });

/** Find a product by its barcode or SKU (scanner / quick search). */
export const lookupQuery = z.object({ code: text(64) });
