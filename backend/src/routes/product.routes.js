import { Router } from 'express';
import * as ctrl from '../controllers/product.controller.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../validators/common.js';
import {
  bulkProductsBody,
  createProductBody,
  listProductsQuery,
  updateProductBody,
} from '../validators/product.validators.js';

const router = Router();

router.get('/', validate({ query: listProductsQuery }), ctrl.list);
router.get('/categories', ctrl.categories);
router.post('/bulk', validate({ body: bulkProductsBody }), ctrl.bulk);
router.get('/:id', validate({ params: idParams }), ctrl.getOne);
router.post('/', validate({ body: createProductBody }), ctrl.create);
router.put('/:id', validate({ params: idParams, body: updateProductBody }), ctrl.update);
router.delete('/:id', validate({ params: idParams }), ctrl.remove);

export default router;
