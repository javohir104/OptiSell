import * as authService from '../services/auth.service.js';
import { sendSuccess } from '../utils/response.js';

export async function register(req, res) {
  const result = await authService.register(req.valid.body);
  sendSuccess(res, result, { status: 201 });
}

export async function login(req, res) {
  const result = await authService.login(req.valid.body);
  sendSuccess(res, result);
}

export function me(req, res) {
  sendSuccess(res, { user: req.user });
}
