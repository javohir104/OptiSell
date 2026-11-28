import api, { unwrap } from './axios';
import { clean, toMovement, toProduct } from './backend';

const real = {
  /** Stock-take: [{ productId, counted }] -> differences. */
  count: ({ items, note }) => api.post('/inventory/count', clean({ items: items.map((x) => ({ product_id: x.productId, counted: Number(x.counted) })), note: note || undefined })).then(unwrap),
  generateBarcodes: (productIds) => api.post('/products/generate-barcodes', productIds?.length ? { product_ids: productIds } : {}).then(unwrap).then((d) => ({ generated: d.generated, items: d.items.map(toProduct) })),
  movements: async ({ productId, type, limit = 100 } = {}) => {
    const params = clean({ product_id: productId, type: type === 'sale' ? 'sale' : undefined, limit: Math.min(Number(limit) || 100, 100), order: 'desc' });
    const list = unwrap(await api.get('/inventory/history', { params })).map(toMovement);
    return type && type !== 'sale' ? list.filter((m) => m.type === type) : list;
  },
  adjust: async ({ productId, type, quantity, note }) => {
    const qty = Math.abs(Math.round(Number(quantity) * 1000) / 1000);
    const isIn = type !== 'out';
    const text = String(note ?? '').trim() || (isIn ? 'Restock' : 'Write-off');
    const res = unwrap(
      await api.post('/inventory/adjust', {
        product_id: productId,
        type: isIn ? 'restock' : 'adjustment',
        quantity_change: isIn ? qty : -qty,
        note: text,
      }),
    );
    const product = toProduct(unwrap(await api.get(`/products/${productId}`)));
    const movement = {
      id: `${productId}-${Date.now()}`,
      productId,
      productName: product.name,
      type: isIn ? 'in' : 'out',
      quantity: res.quantity_change,
      quantityAfter: res.quantity_after,
      note: text,
      createdAt: new Date().toISOString(),
    };
    return { product, movement };
  },
};

export const inventoryApi = real;
