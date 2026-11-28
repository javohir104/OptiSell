import * as dashboard from '../services/dashboard.service.js';
import { sendSuccess } from '../utils/response.js';

export async function overview(req, res) {
  sendSuccess(res, await dashboard.getOverview(req.user.id, req.valid.query));
}

export async function sales(req, res) {
  sendSuccess(res, await dashboard.getSalesSeries(req.user.id, req.valid.query));
}

export async function revenue(req, res) {
  sendSuccess(res, await dashboard.getRevenueSeries(req.user.id, req.valid.query));
}

export async function profit(req, res) {
  sendSuccess(res, await dashboard.getProfitSeries(req.user.id, req.valid.query));
}

export async function topProducts(req, res) {
  sendSuccess(res, await dashboard.getTopProducts(req.user.id, req.valid.query));
}

export async function categories(req, res) {
  sendSuccess(res, await dashboard.getCategories(req.user.id, req.valid.query));
}

