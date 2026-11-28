import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/product.controller.js';
import { ownerOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../validators/common.js';
import {
  bulkProductsBody,
  createProductBody,
  listProductsQuery,
  lookupQuery,
  updateProductBody,
} from '../validators/product.validators.js';

const router = Router();

router.get('/', validate({ query: listProductsQuery }), ctrl.list);
router.get('/categories', ctrl.categories);
router.get('/lookup', validate({ query: lookupQuery }), ctrl.lookup);
router.post('/generate-barcodes', ownerOnly, validate({ body: z.strictObject({ product_ids: z.array(z.guid()).max(5000).optional() }) }), (req, res, next) => {
  req.body = req.valid.body;
  return ctrl.generateBarcodes(req, res, next);
});
// Sellers (staff) can look products up and sell them, but not change the catalogue.
router.post('/bulk', ownerOnly, validate({ body: bulkProductsBody }), ctrl.bulk);
router.get('/:id', validate({ params: idParams }), ctrl.getOne);
router.post('/', ownerOnly, validate({ body: createProductBody }), ctrl.create);
router.put('/:id', ownerOnly, validate({ params: idParams, body: updateProductBody }), ctrl.update);
router.delete('/:id', ownerOnly, validate({ params: idParams }), ctrl.remove);

export default router;
