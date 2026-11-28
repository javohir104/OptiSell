import api, { unwrap } from './axios';

const toShop = (s) => ({ id: s.id, name: s.name, address: s.address || '', lat: s.lat, lng: s.lng, isMine: !!s.is_mine });

export const shopsApi = {
  /** Every shop that has set its location: [{ id, name, address, lat, lng, isMine }] */
  list: () => api.get('/shops').then(unwrap).then((d) => d.shops.map(toShop)),
  /** One shop and its products (view only). */
  catalog: (id) => api.get(`/shops/${encodeURIComponent(id)}`).then(unwrap).then((d) => ({
    shop: toShop(d.shop),
    products: d.products.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category || '',
      unit: p.unit || 'pcs',
      description: p.description || '',
      imageUrl: p.image_url || '',
      price: Number(p.price) || 0,
      inStock: !!p.in_stock,
    })),
  })),
};
