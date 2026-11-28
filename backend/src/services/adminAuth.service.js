/**
 * Admin role bootstrap + audit log.
 * Admins sign in on the normal login page; /api/admin/* checks role = 'admin' in the DB per request.
 * There is no API endpoint that grants the admin role: it comes only from backend/.env
 * (ADMIN_EMAIL / ADMIN_PASSWORD, see ensureEnvAdmin) or the server CLI (npm run admin).
 */
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { insert, update } from '../db/store.js';
import { createUser } from './auth.service.js';
import { findUserByEmail } from './user.shared.js';

export function audit(adminId, action, { targetId = null, details = {}, ip = null } = {}) {
  insert('admin_audit_log', { admin_id: adminId, action, target_id: targetId, details, ip });
}

/**
 * Make sure the account in ADMIN_EMAIL exists, has role 'admin' and the password ADMIN_PASSWORD.
 * Runs on every server start, so changing the password in .env and restarting is enough.
 */
export async function ensureEnvAdmin() {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return null;
  const existing = findUserByEmail(env.ADMIN_EMAIL);

  if (existing && existing.role === 'admin' && existing.password_hash && (await bcrypt.compare(env.ADMIN_PASSWORD, existing.password_hash))) {
    return { email: env.ADMIN_EMAIL, changed: false };
  }

  const password_hash = await bcrypt.hash(env.ADMIN_PASSWORD, env.BCRYPT_ROUNDS);
  const admin = existing
    ? update('users', existing, { password_hash, role: 'admin', is_test_account: true })
    : createUser({
        email: env.ADMIN_EMAIL,
        password_hash,
        full_name: 'Admin',
        first_name: 'Admin',
        role: 'admin',
        is_test_account: true,
      });
  audit(null, existing ? 'role.grant' : 'admin.created', {
    targetId: admin.id,
    details: { email: env.ADMIN_EMAIL, via: 'env' },
  });
  return { email: env.ADMIN_EMAIL, changed: true };
}
