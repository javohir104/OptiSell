import api, { unwrap } from './axios';
import { clean, fromProduct, getAll, toProduct } from './backend';

const get = (id) => api.get(`/products/${id}`).then(unwrap).then(toProduct);

const real = {
  list: async ({ search, category } = {}) => {
    const rows = await getAll('/products', clean({ search, sort: 'name', order: 'asc' }));
    const list = rows.map(toProduct);
    return category ? list.filter((p) => p.category === category) : list;
  },
  get,
  /** Product by barcode or SKU (scanner). */
  lookup: (code) => api.get('/products/lookup', { params: { code } }).then(unwrap).then(toProduct),
  create: (payload) => api.post('/products', fromProduct(payload, { isNew: true })).then(unwrap).then(toProduct),
  update: async (id, payload) => {
    let product = toProduct(unwrap(await api.put(`/products/${id}`, fromProduct(payload, { isNew: false }))));
    // Stock is never edited directly on the backend; a changed count is a stock-take adjustment.
    const stock = Math.round(Number(payload.stock));
    if (Number.isInteger(stock) && stock >= 0 && stock !== product.stock) {
      await api.post('/inventory/adjust', { product_id: id, type: 'adjustment', new_quantity: stock, note: 'Manual edit' });
      product = await get(id);
    }
    return product;
  },
  /** Archives the product (sales history keeps referencing it). */
  remove: (id) => api.delete(`/products/${id}`).then(unwrap),
};

export const productsApi = real;
