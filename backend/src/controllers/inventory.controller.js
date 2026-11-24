import * as inventoryService from '../services/inventory.service.js';
import { sendSuccess } from '../utils/response.js';

export async function list(req, res) {
  const { items, meta } = await inventoryService.listInventory(req.user.id, req.valid.query);
  sendSuccess(res, items, { meta });
}

export async function lowStock(req, res) {
  const { items, meta } = await inventoryService.listLowStock(req.user.id, req.valid.query);
  sendSuccess(res, items, { meta });
}

export async function history(req, res) {
  const { items, meta } = await inventoryService.listHistory(req.user.id, req.valid.query);
  sendSuccess(res, items, { meta });
}

export async function getOne(req, res) {
  sendSuccess(
    res,
    await inventoryService.getProductInventory(req.user.id, req.valid.params.productId),
  );
}

export async function adjust(req, res) {
  sendSuccess(res, await inventoryService.adjustStock(req.user.id, req.valid.body));
}
