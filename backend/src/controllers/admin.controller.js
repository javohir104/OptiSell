import * as stats from '../services/adminStats.service.js';
import { sendSuccess } from '../utils/response.js';

export function me(req, res) {
  sendSuccess(res, { admin: req.admin });
}

export async function overview(req, res) {
  sendSuccess(res, await stats.getOverview(req.valid.query));
}

export async function chart(req, res) {
  sendSuccess(res, await stats.getChart(req.valid.query));
}

export async function traffic(req, res) {
  sendSuccess(res, await stats.getTraffic(req.valid.query));
}

export async function activeUsers(req, res) {
  sendSuccess(res, await stats.getActiveUsers(req.valid.query));
}

export async function listUsers(req, res) {
  const { items, meta } = await stats.listUsers(req.valid.query);
  sendSuccess(res, items, { meta });
}

export async function getUser(req, res) {
  sendSuccess(res, await stats.getUser(req.valid.params.id));
}

export async function updateUser(req, res) {
  sendSuccess(res, await stats.updateUser(req.admin.id, req.valid.params.id, req.valid.body, req.ip));
}

export async function listPayments(req, res) {
  const { items, meta } = await stats.listPayments(req.valid.query);
  sendSuccess(res, items, { meta });
}

export async function auditLog(req, res) {
  const { items, meta } = await stats.listAuditLog(req.valid.query);
  sendSuccess(res, items, { meta });
}
