import { z } from 'zod';
import { dateRangeFields, refineDateRange, text } from './common.js';
import { email, password } from './auth.validators.js';
import { phone } from './customer.validators.js';

export const createStaffBody = z.strictObject({
  full_name: text(100),
  email,
  password,
  phone,
});

export const updateStaffBody = z
  .strictObject({
    full_name: text(100).optional(),
    phone,
    password: password.optional(),
    is_active: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { error: 'Provide at least one field to update' });

export const statsQuery = refineDateRange(z.object({ ...dateRangeFields }));
