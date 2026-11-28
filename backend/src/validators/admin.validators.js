import { z } from 'zod';
import { date, id, pagination, search, sortOrder } from './common.js';
import { daysBetween } from '../utils/dates.js';

const MAX_RANGE_DAYS = 731;
const plan = z.enum(['free', 'pro', 'max']);

/** from/to inclusive local dates; at most two years. Defaults (last 30 days) are applied in the service. */
function withRange(shape) {
  return z
    .object({ from: date.optional(), to: date.optional(), ...shape })
    .refine((q) => !q.from || !q.to || q.from <= q.to, { error: '"from" must be on or before "to"', path: ['from'] })
    .refine((q) => !q.from || !q.to || daysBetween(q.from, q.to) < MAX_RANGE_DAYS, {
      error: `The range can be at most ${MAX_RANGE_DAYS} days`,
      path: ['to'],
    });
}

export const rangeQuery = withRange({});
export const chartQuery = withRange({ interval: z.enum(['day', 'week', 'month']).default('day') });

export const activeUsersQuery = z.object({
  minutes: z.coerce.number().int().min(1).max(60).default(5),
});

export const listUsersQuery = z.object({
  ...pagination,
  search,
  plan: plan.optional(),
  role: z.enum(['user', 'admin']).optional(),
  test: z.enum(['exclude', 'include', 'only']).default('include'),
  active_within_days: z.coerce.number().int().min(1).max(365).optional(),
  sort: z.enum(['created_at', 'last_active_at', 'email', 'full_name']).default('created_at'),
  order: sortOrder,
});

export const updateUserBody = z.strictObject({ is_test_account: z.boolean() });

export const listPaymentsQuery = withRange({
  ...pagination,
  search,
  status: z.enum(['pending', 'paid', 'cancelled']).optional(),
  provider: z.enum(['click', 'payme', 'test', 'points', 'contest']).optional(),
  plan: z.enum(['pro', 'max']).optional(),
  user_id: id.optional(),
  test: z.enum(['exclude', 'include', 'only']).default('include'),
  sort: z.enum(['created_at', 'paid_at', 'amount']).default('created_at'),
  order: sortOrder,
});

export const auditLogQuery = z.object({ ...pagination });
