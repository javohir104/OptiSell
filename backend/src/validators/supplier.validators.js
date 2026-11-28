import { z } from 'zod';
import {
  date,
  dateRangeFields,
  id,
  money,
  optionalText,
  pagination,
  paymentMethod,
  positiveMoney,
  quantity,
  refineDateRange,
  search,
  sortOrder,
  text,
} from './common.js';
import { phone } from './customer.validators.js';

export const createSupplierBody = z.strictObject({
  name: text(150),
  phone,
  company: optionalText(150),
  note: optionalText(500),
});

export const updateSupplierBody = z
  .strictObject({ name: text(150).optional(), phone, company: optionalText(150), note: optionalText(500) })
  .refine((b) => Object.keys(b).length > 0, { error: 'Provide at least one field to update' });

export const listSuppliersQuery = z.object({
  ...pagination,
  search,
  sort: z.enum(['name', 'balance', 'last_purchase_at']).default('name'),
  order: sortOrder,
});

export const purchaseBody = z
  .strictObject({
    items: z.array(z.strictObject({ product_id: id, quantity, unit_cost: money })).min(1).max(200),
    // How much was paid right away. Omit = paid in full; less = the rest is owed to the supplier.
    paid_amount: money.optional(),
    // Set each product's cost price to this purchase price (default true).
    update_cost: z.boolean().optional(),
    note: optionalText(500),
    purchased_at: date.optional(),
  })
  .superRefine((b, ctx) => {
    const seen = new Set();
    b.items.forEach((it, i) => {
      if (seen.has(it.product_id)) {
        ctx.addIssue({ code: 'custom', path: ['items', i, 'product_id'], message: 'Each product may appear only once' });
      }
      seen.add(it.product_id);
    });
  });

export const supplierPaymentBody = z.strictObject({
  amount: positiveMoney,
  method: paymentMethod.optional(),
  note: optionalText(300),
  paid_at: date.optional(),
});

export const purchaseParams = z.strictObject({ id, purchaseId: id });

export const listPurchasesQuery = refineDateRange(
  z.object({ ...pagination, ...dateRangeFields, supplier_id: id.optional() }),
);
