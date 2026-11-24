import { Router } from 'express';
import * as ctrl from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginLimiter, registerLimiter } from '../middleware/rateLimiters.js';
import { registerBody, loginBody } from '../validators/auth.validators.js';

const router = Router();

router.post('/register', registerLimiter, validate({ body: registerBody }), ctrl.register);
router.post('/login', loginLimiter, validate({ body: loginBody }), ctrl.login);
router.get('/me', requireAuth, ctrl.me);

export default router;
