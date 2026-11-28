import { Router } from 'express';
import * as suppliers from '../services/supplier.service.js';
import { validate } from '../middleware/validate.js';
import { sendSuccess } from '../utils/response.js';
import { idParams } from '../validators/common.js';
import {
  createSupplierBody,
  listPurchasesQuery,
  listSuppliersQuery,
  purchaseBody,
  purchaseParams,
  supplierPaymentBody,
  updateSupplierBody,
} from '../validators/supplier.validators.js';

// Mounted behind requireAuth + ownerOnly + requireFeature('suppliers').
const router = Router();

router.get('/', validate({ query: listSuppliersQuery }), async (req, res) => {
  const { items, meta } = await suppliers.listSuppliers(req.user.id, req.valid.query);
  sendSuccess(res, items, { meta });
});

router.get('/purchases', validate({ query: listPurchasesQuery }), async (req, res) => {
  const { items, meta } = await suppliers.listPurchases(req.user.id, req.valid.query);
  sendSuccess(res, items, { meta });
});

router.post('/', validate({ body: createSupplierBody }), async (req, res) => {
  sendSuccess(res, await suppliers.createSupplier(req.user.id, req.valid.body), { status: 201 });
});

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  sendSuccess(res, await suppliers.getSupplier(req.user.id, req.valid.params.id));
});

router.put('/:id', validate({ params: idParams, body: updateSupplierBody }), async (req, res) => {
  sendSuccess(res, await suppliers.updateSupplier(req.user.id, req.valid.params.id, req.valid.body));
});

router.delete('/:id', validate({ params: idParams }), async (req, res) => {
  sendSuccess(res, await suppliers.archiveSupplier(req.user.id, req.valid.params.id));
});

router.post('/:id/purchases', validate({ params: idParams, body: purchaseBody }), async (req, res) => {
  sendSuccess(res, await suppliers.createPurchase(req.user.id, req.valid.params.id, req.valid.body), { status: 201 });
});

router.post('/:id/purchases/:purchaseId/cancel', validate({ params: purchaseParams }), async (req, res) => {
  const { id, purchaseId } = req.valid.params;
  sendSuccess(res, await suppliers.cancelPurchase(req.user.id, id, purchaseId));
});

router.post('/:id/payments', validate({ params: idParams, body: supplierPaymentBody }), async (req, res) => {
  sendSuccess(res, await suppliers.addPayment(req.user.id, req.valid.params.id, req.valid.body), { status: 201 });
});

export default router;
