import { z } from 'zod';
import { dateRangeFields, refineDateRange } from './common.js';

export const rangeQuery = refineDateRange(z.object({ ...dateRangeFields }));

export const seriesQuery = refineDateRange(
  z.object({
    ...dateRangeFields,
    interval: z.enum(['day', 'week', 'month']).default('day'),
  }),
);

export const topProductsQuery = refineDateRange(
  z.object({
    ...dateRangeFields,
    limit: z.coerce.number().int().min(1).max(50).default(10),
    by: z.enum(['revenue', 'quantity', 'profit']).default('revenue'),
    order: z.enum(['asc', 'desc']).default('desc'),
  }),
);

