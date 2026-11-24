import { z } from 'zod';
import {
  date,
  dateRangeFields,
  optionalText,
  pagination,
  paymentMethod,
  positiveMoney,
  refineDateRange,
  search,
  sortOrder,
  text,
} from './common.js';

const fields = {
  category: text(100),
  amount: positiveMoney,
  description: optionalText(500),
  expense_date: date.optional(), // defaults to today (business timezone)
  payment_method: paymentMethod.optional(),
};

export const createExpenseBody = z.strictObject(fields);

export const updateExpenseBody = z
  .strictObject({
    ...fields,
    category: text(100).optional(),
    amount: positiveMoney.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { error: 'Provide at least one field to update' });

export const listExpensesQuery = refineDateRange(
  z.object({
    ...pagination,
    ...dateRangeFields,
    category: text(100).optional(),
    payment_method: paymentMethod.optional(),
    search,
    sort: z.enum(['expense_date', 'amount', 'created_at']).default('expense_date'),
    order: sortOrder,
  }),
);
