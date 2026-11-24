import { Router } from 'express';
import * as ctrl from '../controllers/expense.controller.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../validators/common.js';
import {
  createExpenseBody,
  listExpensesQuery,
  updateExpenseBody,
} from '../validators/expense.validators.js';

const router = Router();

router.get('/', validate({ query: listExpensesQuery }), ctrl.list);
router.get('/categories', ctrl.categories);
router.get('/:id', validate({ params: idParams }), ctrl.getOne);
router.post('/', validate({ body: createExpenseBody }), ctrl.create);
router.put('/:id', validate({ params: idParams, body: updateExpenseBody }), ctrl.update);
router.delete('/:id', validate({ params: idParams }), ctrl.remove);

export default router;
