import * as authService from '../services/auth.service.js';
import * as googleService from '../services/google.service.js';
import * as handoff from '../services/googleHandoff.service.js';
import { sendSuccess } from '../utils/response.js';

export async function register(req, res) {
  const result = await authService.register(req.valid.body);
  sendSuccess(res, result, { status: 201 });
}

export async function login(req, res) {
  const result = await authService.login(req.valid.body);
  sendSuccess(res, result);
}

export async function google(req, res) {
  const { credential, handoff: handoffId, referral_code: referralCode } = req.valid.body;
  if (handoffId) handoff.assertHandoffOpen(handoffId);
  const { created, ...result } = await googleService.googleLogin({ credential, referralCode });
  if (handoffId) {
    // Browser opened from the Telegram Mini App: the session goes back to the Mini App, not here.
    handoff.completeHandoff(handoffId, { ...result, created });
    return sendSuccess(res, { handoff: true });
  }
  return sendSuccess(res, result, { status: created ? 201 : 200 });
}

export function googleHandoffStart(req, res) {
  sendSuccess(res, handoff.startHandoff(), { status: 201 });
}

export function googleHandoffClaim(req, res) {
  const result = handoff.claimHandoff(req.valid.body);
  if (!result) return sendSuccess(res, { pending: true }, { status: 202 });
  const { created, ...session } = result;
  return sendSuccess(res, { ...session, created }, { status: 200 });
}

export function me(req, res) {
  sendSuccess(res, { user: req.profile });
}
