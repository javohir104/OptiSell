import { Router } from 'express';
import * as ctrl from '../controllers/inventory.controller.js';
import { validate } from '../middleware/validate.js';
import {
  adjustBody,
  historyQuery,
  listInventoryQuery,
  lowStockQuery,
  productIdParams,
} from '../validators/inventory.validators.js';

const router = Router();

// Static paths must be registered before "/:productId".
router.get('/', validate({ query: listInventoryQuery }), ctrl.list);
router.get('/history', validate({ query: historyQuery }), ctrl.history);
router.get('/low-stock', validate({ query: lowStockQuery }), ctrl.lowStock);
router.post('/adjust', validate({ body: adjustBody }), ctrl.adjust);
router.get('/:productId', validate({ params: productIdParams }), ctrl.getOne);

export default router;
