import { Router } from 'express';
import * as customers from '../services/customer.service.js';
import { ownerOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { sendSuccess } from '../utils/response.js';
import { idParams } from '../validators/common.js';
import {
  createCustomerBody,
  customerPaymentParams,
  listCustomersQuery,
  paymentBody,
  updateCustomerBody,
} from '../validators/customer.validators.js';

// Mounted behind requireAuth + requireFeature('debts'). Sellers can find and add customers and
// take debt payments at the till; editing, deleting and undoing payments is for the owner.
const router = Router();

router.get('/', validate({ query: listCustomersQuery }), async (req, res) => {
  const { items, meta } = await customers.listCustomers(req.user.id, req.valid.query);
  sendSuccess(res, items, { meta });
});

router.post('/', validate({ body: createCustomerBody }), async (req, res) => {
  sendSuccess(res, await customers.createCustomer(req.user.id, req.valid.body), { status: 201 });
});

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  sendSuccess(res, await customers.getCustomer(req.user.id, req.valid.params.id));
});

router.put('/:id', ownerOnly, validate({ params: idParams, body: updateCustomerBody }), async (req, res) => {
  sendSuccess(res, await customers.updateCustomer(req.user.id, req.valid.params.id, req.valid.body));
});

router.delete('/:id', ownerOnly, validate({ params: idParams }), async (req, res) => {
  sendSuccess(res, await customers.archiveCustomer(req.user.id, req.valid.params.id));
});

router.post('/:id/payments', validate({ params: idParams, body: paymentBody }), async (req, res) => {
  const result = await customers.addPayment(req.user.id, req.valid.params.id, req.valid.body, req.actor);
  sendSuccess(res, result, { status: 201 });
});

router.delete('/:id/payments/:paymentId', ownerOnly, validate({ params: customerPaymentParams }), async (req, res) => {
  const { id, paymentId } = req.valid.params;
  sendSuccess(res, await customers.deletePayment(req.user.id, id, paymentId));
});

export default router;
