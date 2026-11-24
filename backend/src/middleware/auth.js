import { query } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import { verifyAccessToken } from '../utils/jwt.js';

/**
 * Requires "Authorization: Bearer <jwt>".
 * Also confirms the user still exists, so tokens of deleted accounts stop working immediately.
 * Sets req.user = { id, email, full_name, business_name }.
 */
export async function requireAuth(req, res, next) {
  const header = req.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*)$/.exec(header);
  if (!match) {
    throw AppError.unauthorized('Missing or malformed Authorization header');
  }

  let payload;
  try {
    payload = verifyAccessToken(match[1]);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new AppError(401, 'TOKEN_EXPIRED', 'Access token has expired');
    }
    throw AppError.unauthorized('Invalid access token');
  }

  if (typeof payload.sub !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.sub)) {
    throw AppError.unauthorized('Invalid access token');
  }

  const { rows } = await query(
    'SELECT id, email, full_name, business_name, created_at FROM users WHERE id = $1',
    [payload.sub],
  );
  if (!rows.length) {
    throw AppError.unauthorized('Invalid access token');
  }

  req.user = rows[0];
  next();
}
