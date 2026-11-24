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

const editableFields = {
  sku,
  name: text(200),
  category: optionalText(100),
  unit: text(20).optional(),
  description: optionalText(2000),
  cost_price: money.optional(),
  selling_price: money,
  low_stock_threshold: nonNegativeQuantity.optional(),
};

export const createProductBody = z.strictObject({
  ...editableFields,
  initial_quantity: nonNegativeQuantity.optional(),
});

export const updateProductBody = z
  .strictObject({ ...editableFields, selling_price: money.optional(), sku: sku.optional(), name: text(200).optional() })
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

const bulkItem = z.strictObject({
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
