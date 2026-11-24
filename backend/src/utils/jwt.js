import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const ALGORITHM = 'HS256';
const ISSUER = 'optisell-api';
const AUDIENCE = 'optisell-client';

export function signAccessToken(userId) {
  return jwt.sign({}, env.JWT_SECRET, {
    algorithm: ALGORITHM,
    subject: userId,
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

/**
 * Throws if the token is invalid, expired, or signed with any algorithm other than HS256
 * (blocks "alg: none" and algorithm-confusion attacks).
 */
export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET, {
    algorithms: [ALGORITHM],
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

/** Seconds until expiry, for the client. */
export function tokenExpiresIn(token) {
  const { exp } = jwt.decode(token);
  return exp - Math.floor(Date.now() / 1000);
}
