import { z } from 'zod';
import {
  date,
  dateRangeFields,
  id,
  money,
  optionalText,
  pagination,
  paymentMethod,
  quantity,
  refineDateRange,
  sortOrder,
} from './common.js';

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000; // allow small client clock skew

/** Sales can also be on credit ("nasiya"): payment_method 'debt' with a customer. */
export const salePaymentMethod = z.enum([...paymentMethod.options, 'debt']);

const saleItem = z.strictObject({
  product_id: id,
  quantity,
  // Optional override (e.g. a per-item discount). Defaults to the product's current selling_price.
  unit_price: money.optional(),
});

export const createSaleBody = z
  .strictObject({
    items: z.array(saleItem).min(1).max(200),
    payment_method: salePaymentMethod.default('cash'),
    customer_name: optionalText(150),
    // Registered customer (required for debt sales).
    customer_id: id.optional(),
    // When a debt sale has to be paid back (YYYY-MM-DD).
    due_date: date.optional(),
    // Discount on the whole sale: a percentage (0-100) or a fixed amount.
    discount_type: z.enum(['percent', 'amount']).optional(),
    discount_value: money.optional(),
    note: optionalText(500),
    // Optional: record a past sale (e.g. imported history). ISO 8601 with timezone.
    sold_at: z.iso.datetime({ offset: true }).optional(),
  })
  .superRefine((b, ctx) => {
    const seen = new Set();
    b.items.forEach((item, i) => {
      if (seen.has(item.product_id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', i, 'product_id'],
          message: 'Each product may appear only once per sale; combine the quantities',
        });
      }
      seen.add(item.product_id);
    });

    if (b.payment_method === 'debt' && !b.customer_id) {
      ctx.addIssue({ code: 'custom', path: ['customer_id'], message: 'Choose the customer for a sale on credit' });
    }
    if (b.due_date && b.payment_method !== 'debt') {
      ctx.addIssue({ code: 'custom', path: ['due_date'], message: 'Only sales on credit have a due date' });
    }
    if ((b.discount_type === undefined) !== (b.discount_value === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['discount_value'], message: 'Send both discount_type and discount_value' });
    }
    if (b.discount_type === 'percent' && Number(b.discount_value) > 100) {
      ctx.addIssue({ code: 'custom', path: ['discount_value'], message: 'A percentage discount must be 0-100' });
    }

    if (b.sold_at) {
      const t = Date.parse(b.sold_at);
      if (t > Date.now() + FUTURE_TOLERANCE_MS) {
        ctx.addIssue({ code: 'custom', path: ['sold_at'], message: 'Must not be in the future' });
      }
      if (t < Date.parse('2000-01-01T00:00:00Z')) {
        ctx.addIssue({ code: 'custom', path: ['sold_at'], message: 'Must be after 2000-01-01' });
      }
    }
  });

/** Return some items of a sale, or (no items) the whole sale. */
export const returnSaleBody = z
  .strictObject({
    items: z
      .array(z.strictObject({ product_id: id, quantity }))
      .min(1)
      .max(200)
      .optional(),
    reason: optionalText(300),
  })
  .superRefine((b, ctx) => {
    const seen = new Set();
    (b.items ?? []).forEach((item, i) => {
      if (seen.has(item.product_id)) {
        ctx.addIssue({ code: 'custom', path: ['items', i, 'product_id'], message: 'Each product may appear only once' });
      }
      seen.add(item.product_id);
    });
  });

export const idempotencyKey = z
  .string()
  .regex(/^[A-Za-z0-9_\-:.]{8,100}$/, 'Idempotency-Key must be 8-100 chars of A-Z a-z 0-9 _ - : .')
  .optional();

export const listSalesQuery = refineDateRange(
  z.object({
    ...pagination,
    ...dateRangeFields,
    status: z.enum(['completed', 'cancelled', 'returned']).optional(),
    payment_method: salePaymentMethod.optional(),
    product_id: id.optional(),
    customer_id: id.optional(),
    seller_id: id.optional(),
    sort: z.enum(['sold_at', 'total_amount']).default('sold_at'),
    order: sortOrder,
  }),
);

export const statisticsQuery = refineDateRange(z.object({ ...dateRangeFields }));
