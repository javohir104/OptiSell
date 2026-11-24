import { z } from 'zod';
import {
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

const saleItem = z.strictObject({
  product_id: id,
  quantity,
  // Optional override (e.g. discount). Defaults to the product's current selling_price.
  unit_price: money.optional(),
});

export const createSaleBody = z
  .strictObject({
    items: z.array(saleItem).min(1).max(200),
    payment_method: paymentMethod.default('cash'),
    customer_name: optionalText(150),
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

export const idempotencyKey = z
  .string()
  .regex(/^[A-Za-z0-9_\-:.]{8,100}$/, 'Idempotency-Key must be 8-100 chars of A-Z a-z 0-9 _ - : .')
  .optional();

export const listSalesQuery = refineDateRange(
  z.object({
    ...pagination,
    ...dateRangeFields,
    status: z.enum(['completed', 'cancelled']).optional(),
    payment_method: paymentMethod.optional(),
    product_id: id.optional(),
    sort: z.enum(['sold_at', 'total_amount']).default('sold_at'),
    order: sortOrder,
  }),
);

export const statisticsQuery = refineDateRange(z.object({ ...dateRangeFields }));
