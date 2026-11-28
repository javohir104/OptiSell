import { z } from 'zod';
import { date, id, optionalText, pagination, paymentMethod, positiveMoney, search, sortOrder, text } from './common.js';

export const phone = z
  .string()
  .trim()
  .max(30)
  .refine((v) => v === '' || /^\+?[0-9 ()-]{7,30}$/.test(v), 'Must be a valid phone number')
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

export const createCustomerBody = z.strictObject({
  name: text(150),
  phone,
  note: optionalText(500),
});

export const updateCustomerBody = z
  .strictObject({ name: text(150).optional(), phone, note: optionalText(500) })
  .refine((b) => Object.keys(b).length > 0, { error: 'Provide at least one field to update' });

export const listCustomersQuery = z.object({
  ...pagination,
  search,
  status: z.enum(['all', 'debtors', 'overdue']).default('all'),
  sort: z.enum(['name', 'balance', 'created_at', 'next_due_date']).default('name'),
  order: sortOrder,
});

export const paymentBody = z.strictObject({
  amount: positiveMoney,
  method: paymentMethod.optional(),
  note: optionalText(300),
  paid_at: date.optional(),
});

export const customerPaymentParams = z.strictObject({ id, paymentId: id });
