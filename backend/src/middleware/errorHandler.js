import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

// Specific constraints -> friendly, stable error codes.
const CONSTRAINT_ERRORS = {
  products_user_sku_active_uq: () =>
    AppError.conflict('A product with this SKU already exists', undefined, 'DUPLICATE_SKU'),
  users_email_uq: () =>
    AppError.conflict('An account with this email already exists', undefined, 'EMAIL_TAKEN'),
  inventory_quantity_non_negative_chk: () =>
    AppError.conflict('Not enough stock', undefined, 'INSUFFICIENT_STOCK'),
};

// Generic PostgreSQL error codes -> API errors.
// https://www.postgresql.org/docs/current/errcodes-appendix.html
const PG_ERRORS = {
  23505: () => AppError.conflict('A record with these values already exists', undefined, 'DUPLICATE'),
  23503: () => AppError.badRequest('Referenced record does not exist'),
  23514: () => AppError.badRequest('Value violates a business constraint'),
  22003: () => new AppError(400, 'VALUE_OUT_OF_RANGE', 'A numeric value or total is out of range'),
  '22P02': () => AppError.badRequest('Invalid input syntax'),
  57014: () => new AppError(503, 'QUERY_TIMEOUT', 'The request took too long, please try again'),
};

function normalize(err) {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) {
    return AppError.validation(
      err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }

  // body-parser errors
  if (err.type === 'entity.parse.failed') return AppError.badRequest('Malformed JSON body');
  if (err.type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }
  if (err.type === 'encoding.unsupported' || err.type === 'charset.unsupported') {
    return new AppError(415, 'UNSUPPORTED_ENCODING', 'Unsupported request encoding');
  }

  if (err.constraint && CONSTRAINT_ERRORS[err.constraint]) return CONSTRAINT_ERRORS[err.constraint]();
  if (err.code && PG_ERRORS[err.code]) return PG_ERRORS[err.code]();

  return null;
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const appErr = normalize(err);

  if (!appErr) {
    // Unexpected error: log full details server-side, never leak internals to the client.
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        ...(env.NODE_ENV === 'development' && { debug: err.message }),
      },
    });
  }

  if (appErr.statusCode >= 500) {
    console.error(`[${req.method} ${req.originalUrl}] ${appErr.code}: ${err.message}`);
  }

  const error = { code: appErr.code, message: appErr.message };
  if (appErr.details !== undefined) error.details = appErr.details;
  return res.status(appErr.statusCode).json({ success: false, error });
}
