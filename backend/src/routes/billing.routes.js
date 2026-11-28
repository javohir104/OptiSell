import { Router } from 'express';
import { z } from 'zod';
import * as subscriptions from '../services/subscription.service.js';
import { ownerOnly, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { sendSuccess } from '../utils/response.js';
import { idParams } from '../validators/common.js';

const router = Router();

const checkoutBody = z.strictObject({
  plan: z.enum(['pro', 'max']),
  months: z.coerce.number().int().refine((m) => [1, 3, 6, 12].includes(m), 'Must be 1, 3, 6 or 12'),
  provider: z.enum(['click', 'payme', 'test']),
});

router.get('/plans', (req, res) => sendSuccess(res, subscriptions.listPlans()));

router.get('/subscription', requireAuth, async (req, res) => {
  sendSuccess(res, await subscriptions.getSubscription(req.user));
});

router.post('/checkout', requireAuth, ownerOnly, validate({ body: checkoutBody }), async (req, res) => {
  sendSuccess(res, await subscriptions.createCheckout(req.user.id, req.valid.body), { status: 201 });
});

router.get('/payments', requireAuth, ownerOnly, async (req, res) => {
  sendSuccess(res, await subscriptions.listPayments(req.user.id));
});

router.get('/payments/:id', requireAuth, ownerOnly, validate({ params: idParams }), async (req, res) => {
  sendSuccess(res, await subscriptions.getPayment(req.user.id, req.valid.params.id));
});

export default router;
