import { Router } from 'express';
import * as ctrl from '../controllers/dashboard.controller.js';
import { requireFeature } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { rangeQuery, seriesQuery, topProductsQuery } from '../validators/dashboard.validators.js';

const router = Router();

router.get('/overview', validate({ query: rangeQuery }), ctrl.overview);
router.get('/sales', validate({ query: seriesQuery }), ctrl.sales);
router.get('/revenue', validate({ query: seriesQuery }), ctrl.revenue);
router.get('/profit', validate({ query: seriesQuery }), ctrl.profit);
// Analytics page (Pro+): best/worst products and categories. The dashboard itself is free.
router.get('/top-products', requireFeature('analytics'), validate({ query: topProductsQuery }), ctrl.topProducts);
router.get('/categories', requireFeature('analytics'), validate({ query: rangeQuery }), ctrl.categories);

export default router;
