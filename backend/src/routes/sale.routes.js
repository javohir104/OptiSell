import { Router } from 'express';
import * as ctrl from '../controllers/sale.controller.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../validators/common.js';
import { createSaleBody, listSalesQuery, statisticsQuery } from '../validators/sale.validators.js';

const router = Router();

router.get('/', validate({ query: listSalesQuery }), ctrl.list);
router.get('/statistics', validate({ query: statisticsQuery }), ctrl.statistics);
router.get('/:id', validate({ params: idParams }), ctrl.getOne);
router.post('/', validate({ body: createSaleBody }), ctrl.create);

export default router;
