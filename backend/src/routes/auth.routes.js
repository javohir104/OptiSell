import { Router } from 'express';
import * as ctrl from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { handoffLimiter, loginLimiter, registerLimiter } from '../middleware/rateLimiters.js';
import { forgotBody, googleBody, handoffClaimBody, loginBody, registerBody, resetCodeBody, resetTokenBody } from '../validators/auth.validators.js';
import * as reset from '../services/passwordReset.service.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

router.post('/register', registerLimiter, validate({ body: registerBody }), ctrl.register);
router.post('/login', loginLimiter, validate({ body: loginBody }), ctrl.login);
router.post('/google', loginLimiter, validate({ body: googleBody }), ctrl.google);
// Telegram Mini App: Google sign-in happens in the external browser (see googleHandoff.service.js).
router.post('/google/handoff', handoffLimiter, ctrl.googleHandoffStart);
router.post('/google/handoff/claim', validate({ body: handoffClaimBody }), ctrl.googleHandoffClaim);
router.get('/me', requireAuth, ctrl.me);

// Forgot password (same limiter as login: slows down code guessing and spam).
router.post('/password/forgot', loginLimiter, validate({ body: forgotBody }), async (req, res) => {
  sendSuccess(res, await reset.requestReset(req.valid.body.email));
});
router.post('/password/reset', loginLimiter, validate({ body: resetCodeBody }), async (req, res) => {
  sendSuccess(res, await reset.resetWithCode(req.valid.body));
});
router.post('/password/reset-link', loginLimiter, validate({ body: resetTokenBody }), async (req, res) => {
  sendSuccess(res, await reset.resetWithToken(req.valid.body));
});

export default router;
