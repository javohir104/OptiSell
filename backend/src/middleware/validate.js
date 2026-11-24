import { AppError } from '../utils/AppError.js';

/**
 * Validate req.params / req.query / req.body against zod schemas.
 * Parsed (typed, defaulted, stripped) values are placed on req.valid.{params,query,body}.
 * Controllers must read from req.valid, never from the raw request.
 */
export function validate(schemas) {
  return (req, res, next) => {
    req.valid = {};
    const details = [];

    for (const location of ['params', 'query', 'body']) {
      const schema = schemas[location];
      if (!schema) continue;

      const result = schema.safeParse(req[location] ?? {});
      if (result.success) {
        req.valid[location] = result.data;
      } else {
        for (const issue of result.error.issues) {
          details.push({
            location,
            field: issue.path.join('.') || null,
            message: issue.message,
          });
        }
      }
    }

    if (details.length) return next(AppError.validation(details));
    return next();
  };
}
