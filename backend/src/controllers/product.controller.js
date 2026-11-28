import * as productService from '../services/product.service.js';
import { sendSuccess } from '../utils/response.js';
import { checkReferralActivation } from '../services/bonus.service.js';

export async function list(req, res) {
  const { items, meta } = await productService.listProducts(req.user.id, req.valid.query);
  sendSuccess(res, items, { meta });
}

export async function categories(req, res) {
  sendSuccess(res, await productService.listCategories(req.user.id));
}

export async function getOne(req, res) {
  sendSuccess(res, await productService.getProduct(req.user.id, req.valid.params.id));
}

export async function create(req, res) {
  const product = await productService.createProduct(req.user.id, req.valid.body);
  checkReferralActivation(req.user.id);
  sendSuccess(res, product, { status: 201 });
}

export async function update(req, res) {
  const product = await productService.updateProduct(
    req.user.id,
    req.valid.params.id,
    req.valid.body,
  );
  sendSuccess(res, product);
}

export async function remove(req, res) {
  sendSuccess(res, await productService.archiveProduct(req.user.id, req.valid.params.id));
}

export async function bulk(req, res) {
  const result = await productService.bulkUpsertProducts(req.user.id, req.valid.body.products);
  sendSuccess(res, result);
}

export async function generateBarcodes(req, res) {
  sendSuccess(res, await productService.generateBarcodes(req.user.id, req.body?.product_ids));
}

export async function lookup(req, res) {
  sendSuccess(res, await productService.lookupProduct(req.user.id, req.valid.query.code));
}
