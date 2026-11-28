import { Router } from 'express';
import { z } from 'zod';
import * as bonus from '../services/bonus.service.js';
import { validate } from '../middleware/validate.js';
import { sendSuccess } from '../utils/response.js';

// Mounted behind requireAuth + ownerOnly.
const router = Router();

router.get('/', (req, res) => sendSuccess(res, bonus.overview(req.user.id)));

router.get('/contest', validate({ query: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }) }), (req, res) => {
  sendSuccess(res, bonus.contest(req.user.id, req.valid.query.month));
});

router.post('/redeem', validate({ body: z.strictObject({ plan: z.enum(['pro', 'max']) }) }), (req, res) => {
  sendSuccess(res, bonus.redeem(req.user.id, req.valid.body.plan));
});

export default router;
