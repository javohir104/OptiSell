import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

/** Known error -> AppError, or null for unexpected errors. */
export function normalize(err) {
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
