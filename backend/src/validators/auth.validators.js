import { z } from 'zod';

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ error: 'Must be a valid email address' }));

// bcrypt only uses the first 72 bytes, so cap the length to avoid silent truncation.
export const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, 'Password must be at most 72 bytes')
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Password must contain letters and numbers');

export const registerBody = z.strictObject({
  email,
  password,
  full_name: z.string().trim().min(2).max(100),
  first_name: z.string().trim().min(1).max(100).optional(),
  last_name: z.string().trim().max(100).optional(),
  business_name: z.string().trim().min(1).max(150).optional(),
  // Invite code of the friend who brought this user (bonus points).
  referral_code: z.string().trim().max(20).optional(),
});

const handoffId = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

/** The ID token (JWT) the browser got from Google Identity Services (+ Telegram handoff id, optional). */
export const googleBody = z.strictObject({
  credential: z.string().min(20).max(4096),
  handoff: handoffId.optional(),
  referral_code: z.string().trim().max(20).optional(),
});

/** Telegram Mini App collecting the session after Google sign-in in the external browser. */
export const handoffClaimBody = z.strictObject({
  id: handoffId,
  secret: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
});

export const forgotBody = z.strictObject({ email });
export const resetCodeBody = z.strictObject({ email, code: z.string().regex(/^\d{6}$/), new_password: password });
export const resetTokenBody = z.strictObject({ token: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/), new_password: password });

export const loginBody = z.strictObject({
  email,
  password: z.string().min(1).max(200),
});
