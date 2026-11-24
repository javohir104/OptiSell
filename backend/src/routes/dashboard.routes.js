import { Router } from 'express';
import * as ctrl from '../controllers/dashboard.controller.js';
import { validate } from '../middleware/validate.js';
import { rangeQuery, seriesQuery, topProductsQuery } from '../validators/dashboard.validators.js';

const router = Router();

router.get('/overview', validate({ query: rangeQuery }), ctrl.overview);
router.get('/sales', validate({ query: seriesQuery }), ctrl.sales);
router.get('/revenue', validate({ query: seriesQuery }), ctrl.revenue);
router.get('/profit', validate({ query: seriesQuery }), ctrl.profit);
router.get('/top-products', validate({ query: topProductsQuery }), ctrl.topProducts);

export default router;
