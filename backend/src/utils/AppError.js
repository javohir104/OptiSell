/**
 * Operational error with an HTTP status and a stable machine-readable code.
 * Throw these from services/controllers; the error handler formats them.
 */
export class AppError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = 'Bad request', details) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static validation(details, message = 'Validation failed') {
    return new AppError(400, 'VALIDATION_ERROR', message, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'Forbidden') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Resource not found') {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(message = 'Conflict', details, code = 'CONFLICT') {
    return new AppError(409, code, message, details);
  }
}
