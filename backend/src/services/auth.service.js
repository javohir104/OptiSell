import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { signAccessToken, tokenExpiresIn } from '../utils/jwt.js';

const USER_COLUMNS = 'id, email, full_name, business_name, created_at';

// Compared against when the email does not exist, so a login for an unknown email
// takes the same time as a wrong password (prevents user enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('optisell-timing-equalizer', env.BCRYPT_ROUNDS);

function authResult(user) {
  const token = signAccessToken(user.id);
  return {
    user,
    token,
    token_type: 'Bearer',
    expires_in: tokenExpiresIn(token),
  };
}

export async function register({ email, password, full_name, business_name }) {
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  try {
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, full_name, business_name)
       VALUES ($1, $2, $3, $4)
       RETURNING ${USER_COLUMNS}`,
      [email, passwordHash, full_name, business_name ?? null],
    );
    return authResult(rows[0]);
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'users_email_uq') {
      throw AppError.conflict('An account with this email already exists', undefined, 'EMAIL_TAKEN');
    }
    throw err;
  }
}

export async function login({ email, password }) {
  const { rows } = await query(
    `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE email = $1`,
    [email],
  );
  const row = rows[0];

  const valid = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !valid) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const { password_hash: _omit, ...user } = row;
  return authResult(user);
}
