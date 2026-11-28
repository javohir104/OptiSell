import { z } from 'zod';
import { password } from './auth.validators.js';

// Only raster images: an SVG data URL could carry script.
const AVATAR_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

const coord = (min, max) => z.number().finite().min(min).max(max).nullable().optional();

export const updateProfileBody = z.strictObject({
  first_name: z.string().trim().min(1).max(100).optional(),
  last_name: z.string().trim().max(100).optional(),
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((v) => v === '' || /^\+?[0-9 ()-]{7,30}$/.test(v), 'Must be a valid phone number')
    .optional(),
  business_name: z.string().trim().max(150).optional(),
  avatar_url: z
    .string()
    .max(400_000, 'Photo is too large')
    .refine((v) => v === '' || AVATAR_RE.test(v), 'Photo must be a PNG, JPEG or WebP image')
    .nullable()
    .optional(),
  // Shop location on the map (both coordinates or neither)
  shop_lat: coord(-90, 90),
  shop_lng: coord(-180, 180),
  shop_address: z.string().trim().max(200).nullable().optional(),
  // Telegram notifications
  notify_daily_report: z.boolean().optional(),
  notify_low_stock: z.boolean().optional(),
}).refine((b) => (b.shop_lat === undefined) === (b.shop_lng === undefined) && (b.shop_lat === null) === (b.shop_lng === null), {
  message: 'shop_lat and shop_lng must be sent together',
  path: ['shop_lat'],
});

export const changePasswordBody = z.strictObject({
  current_password: z.string().min(1).max(200),
  new_password: password,
});
