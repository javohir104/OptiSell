import { z } from 'zod';

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ error: 'Must be a valid email address' }));

// bcrypt only uses the first 72 bytes, so cap the length to avoid silent truncation.
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, 'Password must be at most 72 bytes')
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Password must contain letters and numbers');

export const registerBody = z.strictObject({
  email,
  password,
  full_name: z.string().trim().min(2).max(100),
  business_name: z.string().trim().min(1).max(150).optional(),
});

export const loginBody = z.strictObject({
  email,
  password: z.string().min(1).max(200),
});
