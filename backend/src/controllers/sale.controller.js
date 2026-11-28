import * as saleService from '../services/sale.service.js';
import { AppError } from '../utils/AppError.js';
import { checkReferralActivation } from '../services/bonus.service.js';
import { sendSuccess } from '../utils/response.js';
import { idempotencyKey } from '../validators/sale.validators.js';

export async function create(req, res) {
  const keyResult = idempotencyKey.safeParse(req.get('idempotency-key'));
  if (!keyResult.success) {
    throw AppError.validation([
      { location: 'headers', field: 'Idempotency-Key', message: keyResult.error.issues[0].message },
    ]);
  }

  const { sale, replayed } = await saleService.createSale(req.user.id, req.valid.body, keyResult.data, req.actor);
  if (replayed) res.set('Idempotent-Replayed', 'true');
  else checkReferralActivation(req.user.id);
  sendSuccess(res, sale, { status: replayed ? 200 : 201 });
}

export async function list(req, res) {
  const { items, meta } = await saleService.listSales(req.user.id, req.valid.query);
  sendSuccess(res, items, { meta });
}

export async function getOne(req, res) {
  sendSuccess(res, await saleService.getSale(req.user.id, req.valid.params.id));
}

export async function statistics(req, res) {
  sendSuccess(res, await saleService.getStatistics(req.user.id, req.valid.query));
}

export async function returnSale(req, res) {
  sendSuccess(res, await saleService.returnSale(req.user.id, req.valid.params.id, req.valid.body, req.actor));
}
