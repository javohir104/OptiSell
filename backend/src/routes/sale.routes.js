import { Router } from 'express';
import * as ctrl from '../controllers/sale.controller.js';
import { ownerOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../validators/common.js';
import { createSaleBody, listSalesQuery, returnSaleBody, statisticsQuery } from '../validators/sale.validators.js';

const router = Router();

router.get('/', validate({ query: listSalesQuery }), ctrl.list);
router.get('/statistics', ownerOnly, validate({ query: statisticsQuery }), ctrl.statistics);
router.get('/:id', validate({ params: idParams }), ctrl.getOne);
router.post('/', validate({ body: createSaleBody }), ctrl.create);
// Returns / cancellations change the shop's money: only the owner can do them.
router.post('/:id/return', ownerOnly, validate({ params: idParams, body: returnSaleBody }), ctrl.returnSale);

export default router;
