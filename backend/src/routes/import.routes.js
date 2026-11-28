import { Router } from 'express';
import * as ctrl from '../controllers/import.controller.js';
import { validate } from '../middleware/validate.js';
import { importHistoryQuery, importTypeParams } from '../validators/import.validators.js';

const router = Router();

router.get('/history', validate({ query: importHistoryQuery }), ctrl.history);
router.post('/:type', validate({ params: importTypeParams }), ctrl.create);

export default router;
