import express, { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { trackLimiter } from '../middleware/rateLimiters.js';
import { AppError } from '../utils/AppError.js';
import { heartbeatBody, pageViewBody } from '../validators/tracking.validators.js';
import { isBot, recordHeartbeat, recordPageView } from '../services/tracking.service.js';

/** /api/track — public. navigator.sendBeacon sends text/plain, so both JSON and text are accepted. */
const router = Router();

const textJson = [
  express.text({ type: 'text/plain', limit: '8kb' }),
  (req, res, next) => {
    if (typeof req.body === 'string') {
      try {
        req.body = JSON.parse(req.body);
      } catch {
        throw AppError.badRequest('Malformed JSON body');
      }
    }
    next();
  },
];

const skip = (req) => isBot(req.get('user-agent')) || req.user?.role === 'admin';
const accepted = (res, recorded) => res.status(202).json({ success: true, data: { recorded } });

router.post('/pageview', trackLimiter, textJson, optionalAuth, validate({ body: pageViewBody }), async (req, res) => {
  if (skip(req)) return accepted(res, false);
  await recordPageView({ userId: req.user?.id, userAgent: req.get('user-agent'), body: req.valid.body });
  return accepted(res, true);
});

router.post('/heartbeat', trackLimiter, textJson, optionalAuth, validate({ body: heartbeatBody }), async (req, res) => {
  if (skip(req)) return accepted(res, false);
  await recordHeartbeat({ userId: req.user?.id, body: req.valid.body });
  return accepted(res, true);
});

export default router;
