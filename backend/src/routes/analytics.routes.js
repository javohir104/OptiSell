import { Router } from 'express';
import * as ctrl from '../controllers/dashboard.controller.js';
import { validate } from '../middleware/validate.js';
import { dailySalesQuery } from '../validators/dashboard.validators.js';

// Data feeds for the Python AI service (forecasting / demand prediction).
const router = Router();

router.get('/daily-sales', validate({ query: dailySalesQuery }), ctrl.dailySales);

export default router;
