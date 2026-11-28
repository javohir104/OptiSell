import * as importService from '../services/import.service.js';
import { AppError } from '../utils/AppError.js';
import { sendSuccess } from '../utils/response.js';
import { importBodyFor } from '../validators/import.validators.js';

export async function create(req, res) {
  const { type } = req.valid.params;
  // The row schema depends on the import type, so the body is validated here.
  const parsed = importBodyFor(type).safeParse(req.body ?? {});
  if (!parsed.success) {
    throw AppError.validation(
      parsed.error.issues.map((i) => ({
        location: 'body',
        field: i.path.join('.') || null,
        message: i.message,
      })),
    );
  }
  sendSuccess(res, await importService.runImport(req.user.id, type, parsed.data), { status: 201 });
}

export async function history(req, res) {
  sendSuccess(res, await importService.listImports(req.user.id, req.valid.query));
}
