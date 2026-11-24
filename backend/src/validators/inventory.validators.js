import { z } from 'zod';
import {
  MAX_QUANTITY,
  dateRangeFields,
  id,
  nonNegativeQuantity,
  optionalText,
  pagination,
  refineDateRange,
  search,
  sortOrder,
  text,
} from './common.js';

export const adjustBody = z
  .strictObject({
    product_id: id,
    type: z.enum(['restock', 'adjustment', 'return']),
    // Relative change (+ adds stock, - removes stock)...
    quantity_change: z.number().int().min(-MAX_QUANTITY).max(MAX_QUANTITY).optional(),
    // ...or, for type "adjustment" only, the absolute counted quantity (stock-take).
    new_quantity: nonNegativeQuantity.optional(),
    note: optionalText(500),
  })
  .superRefine((b, ctx) => {
    const hasChange = b.quantity_change !== undefined;
    const hasNew = b.new_quantity !== undefined;
    if (hasChange === hasNew) {
      ctx.addIssue({
        code: 'custom',
        path: ['quantity_change'],
        message: 'Provide exactly one of quantity_change or new_quantity',
      });
      return;
    }
    if (hasNew && b.type !== 'adjustment') {
      ctx.addIssue({
        code: 'custom',
        path: ['new_quantity'],
        message: 'new_quantity is only allowed with type "adjustment"',
      });
    }
    if (hasChange && b.quantity_change === 0) {
      ctx.addIssue({ code: 'custom', path: ['quantity_change'], message: 'Must not be 0' });
    }
    if (hasChange && ['restock', 'return'].includes(b.type) && b.quantity_change < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['quantity_change'],
        message: `Must be positive for type "${b.type}"`,
      });
    }
  });

export const listInventoryQuery = z.object({
  ...pagination,
  search,
  category: text(100).optional(),
  stock_status: z.enum(['in_stock', 'low', 'out']).optional(),
  sort: z.enum(['name', 'quantity', 'updated_at']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export const historyQuery = refineDateRange(
  z.object({
    ...pagination,
    ...dateRangeFields,
    product_id: id.optional(),
    type: z.enum(['initial', 'restock', 'adjustment', 'sale', 'return', 'import']).optional(),
    order: sortOrder,
  }),
);

export const lowStockQuery = z.object({ ...pagination });

export const productIdParams = z.strictObject({ productId: id });
