import { Router } from 'express';
import { listShops, shopCatalog } from '../services/shop.service.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../validators/common.js';
import { sendSuccess } from '../utils/response.js';

// Mounted behind requireAuth. req.user.id is the shop owner (sellers work as their owner).
const router = Router();

router.get('/', (req, res) => sendSuccess(res, { shops: listShops(req.user.id) }));

router.get('/:id', validate({ params: idParams }), (req, res) => {
  sendSuccess(res, shopCatalog(req.valid.params.id, req.user.id));
});

export default router;
