import { Router } from 'express';
import * as profileService from '../services/profile.service.js';
import { validate } from '../middleware/validate.js';
import { loginLimiter } from '../middleware/rateLimiters.js';
import { sendSuccess } from '../utils/response.js';
import { checkReferralActivation } from '../services/bonus.service.js';
import { changePasswordBody, updateProfileBody } from '../validators/profile.validators.js';

const router = Router();

router.get('/', (req, res) => sendSuccess(res, { user: req.profile }));

router.patch('/', validate({ body: updateProfileBody }), async (req, res) => {
  const user = await profileService.updateProfile(req.actor.id, req.valid.body);
  checkReferralActivation(req.actor.id);
  sendSuccess(res, { user });
});

// Same limiter as login: failed attempts slow down guessing the current password.
router.post('/password', loginLimiter, validate({ body: changePasswordBody }), async (req, res) => {
  sendSuccess(res, await profileService.changePassword(req.actor.id, req.valid.body));
});

export default router;
