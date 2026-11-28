import { z } from 'zod';

export const MAX_MONEY = 9_999_999_999.99;
export const MAX_QUANTITY = 1_000_000;

/** UUID path/query/body id. Invalid ids get a 400. */
export const id = z.guid({ error: 'Must be a valid id (UUID)' });

export const idParams = z.strictObject({ id });

/**
 * Money: accepts 12.5, "12.50", "12". Returns a normalized string ("12.50") so values never pass
 * through floating-point arithmetic. Max 2 decimal places.
 */
export const money = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === 'number' ? String(v) : v.trim()))
  .refine((v) => /^\d{1,10}(\.\d{1,2})?$/.test(v), {
    error: 'Must be a non-negative amount with at most 2 decimal places',
  })
  .transform((v) => Number.parseFloat(v).toFixed(2))
  .refine((v) => Number(v) <= MAX_MONEY, { error: `Must not exceed ${MAX_MONEY}` });

export const positiveMoney = money.refine((v) => Number(v) > 0, { error: 'Must be greater than 0' });

/** Quantities may be fractional for weighed goods (0.75 kg): at most 3 decimals, rounded to 0.001. */
export const q3 = (v) => Math.round(v * 1000) / 1000;
const threeDecimals = (v) => Math.abs(Math.round(v * 1000) - v * 1000) < 1e-6;
export const quantity = z
  .number()
  .positive()
  .max(MAX_QUANTITY)
  .refine(threeDecimals, 'At most 3 decimal places')
  .transform(q3);
export const nonNegativeQuantity = z
  .number()
  .min(0)
  .max(MAX_QUANTITY)
  .refine(threeDecimals, 'At most 3 decimal places')
  .transform(q3);

/** Trimmed string; empty string becomes null when optional fields are cleared. */
export const text = (max, min = 1) => z.string().trim().min(min).max(max);
export const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export const date = z.iso.date({ error: 'Must be a date in YYYY-MM-DD format' });

export const paymentMethod = z.enum(['cash', 'card', 'transfer', 'other']);

// --------------------------------------------------------------------------- query helpers

const intParam = (def, min, max) => z.coerce.number().int().min(min).max(max).default(def);

export const pagination = {
  page: intParam(1, 1, 100_000),
  limit: intParam(20, 1, 100),
};

export const sortOrder = z.enum(['asc', 'desc']).default('desc');

/** Optional from/to, both inclusive dates. */
export const dateRangeFields = {
  from: date.optional(),
  to: date.optional(),
};

export function refineDateRange(schema) {
  return schema.refine((q) => !q.from || !q.to || q.from <= q.to, {
    error: '"from" must be on or before "to"',
    path: ['from'],
  });
}

/** Search text (matched case-insensitively). */
export const search = z.string().trim().min(1).max(100).optional();
