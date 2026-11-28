import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { update } from '../db/store.js';
import { AppError } from '../utils/AppError.js';
import { findUser, isStaff, toPublicUser } from './user.shared.js';

const FIELDS = ['first_name', 'last_name', 'phone', 'business_name', 'avatar_url'];
// Only the shop owner sets where the shop is (sellers share the owner's shop).
const SHOP_FIELDS = ['shop_lat', 'shop_lng', 'shop_address'];
const FLAGS = ['notify_daily_report', 'notify_low_stock'];

function userOr404(userId) {
  const user = findUser(userId);
  if (!user) throw AppError.notFound('User not found');
  return user;
}

/** Update the provided profile fields. full_name is kept as "First Last". */
export async function updateProfile(userId, data) {
  const user = userOr404(userId);
  const changes = {};
  for (const field of FIELDS) {
    if (data[field] !== undefined) changes[field] = data[field] === '' ? null : data[field];
  }
  if (!isStaff(user)) {
    for (const field of SHOP_FIELDS) {
      if (data[field] !== undefined) changes[field] = data[field] === '' ? null : data[field];
    }
  }
  for (const flag of FLAGS) {
    if (data[flag] !== undefined) changes[flag] = data[flag];
  }
  if (!Object.keys(changes).length) return toPublicUser(user);

  if (data.first_name !== undefined || data.last_name !== undefined) {
    const first = 'first_name' in changes ? changes.first_name : user.first_name;
    const last = 'last_name' in changes ? changes.last_name : user.last_name;
    changes.full_name = [first, last].filter(Boolean).join(' ').trim().slice(0, 100) || user.full_name;
  }
  return toPublicUser(update('users', user, changes));
}

export async function changePassword(userId, { current_password, new_password }) {
  const user = userOr404(userId);
  if (!user.password_hash) {
    throw new AppError(400, 'NO_PASSWORD', 'This account signs in with Google and has no password');
  }
  const valid = await bcrypt.compare(current_password, user.password_hash);
  if (!valid) throw new AppError(400, 'WRONG_PASSWORD', 'Current password is incorrect');
  update('users', user, { password_hash: await bcrypt.hash(new_password, env.BCRYPT_ROUNDS) });
  return { changed: true };
}
