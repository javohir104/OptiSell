import { Router } from 'express';
import * as ctrl from '../controllers/inventory.controller.js';
import * as inventoryService from '../services/inventory.service.js';
import { sendSuccess } from '../utils/response.js';
import { ownerOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  adjustBody,
  countBody,
  historyQuery,
  listInventoryQuery,
  lowStockQuery,
  productIdParams,
} from '../validators/inventory.validators.js';

const router = Router();

// Static paths must be registered before "/:productId".
router.get('/', validate({ query: listInventoryQuery }), ctrl.list);
router.get('/history', ownerOnly, validate({ query: historyQuery }), ctrl.history);
router.get('/low-stock', validate({ query: lowStockQuery }), ctrl.lowStock);
router.post('/count', ownerOnly, validate({ body: countBody }), async (req, res) => {
  sendSuccess(res, await inventoryService.stockCount(req.user.id, req.valid.body));
});
router.post('/adjust', ownerOnly, validate({ body: adjustBody }), ctrl.adjust);
router.get('/:productId', validate({ params: productIdParams }), ctrl.getOne);

export default router;
