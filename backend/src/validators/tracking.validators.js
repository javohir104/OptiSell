import { z } from 'zod';
import { id } from './common.js';

/** Page path only: query string and hash are dropped (they can carry tokens or personal data). */
const path = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((p) => p.startsWith('/'), { error: 'Must be a path starting with /' })
  .transform((p) => p.split(/[?#]/)[0].slice(0, 500));

export const pageViewBody = z.object({
  visitor_id: id,
  session_id: id,
  path,
  referrer: z.string().trim().max(2000).optional(),
});

export const heartbeatBody = z.object({ visitor_id: id, path });
