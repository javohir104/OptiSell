import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { api, createProduct, registerUser, startServer, stopServer } from './helpers.js';

before(startServer);
after(stopServer);

describe('shops map', () => {
  it('an owner sets the shop location and every signed-in user sees it on the map', async () => {
    const owner = await registerUser({ business_name: 'Map Shop' });
    const viewer = await registerUser();
    assert.equal((await api('GET', '/api/profile', { token: owner.token })).body.data.user.shop_location, null);

    const res = await api('PATCH', '/api/profile', { token: owner.token, body: { shop_lat: 41.3, shop_lng: 69.25, shop_address: 'Chilonzor 9' } });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.user.shop_location, { lat: 41.3, lng: 69.25, address: 'Chilonzor 9' });

    const shops = (await api('GET', '/api/shops', { token: viewer.token })).body.data.shops;
    const shop = shops.find((s) => s.id === owner.user.id);
    assert.deepEqual(shop, { id: owner.user.id, name: 'Map Shop', address: 'Chilonzor 9', lat: 41.3, lng: 69.25, is_mine: false });
    assert.ok(!shops.some((s) => s.id === viewer.user.id)); // no location yet -> not listed
    assert.equal('phone' in shop || 'email' in shop, false);

    const mine = (await api('GET', '/api/shops', { token: owner.token })).body.data.shops.find((s) => s.id === owner.user.id);
    assert.equal(mine.is_mine, true);
  });

  it('rejects bad coordinates and a lone latitude; requires sign-in', async () => {
    const owner = await registerUser();
    assert.equal((await api('PATCH', '/api/profile', { token: owner.token, body: { shop_lat: 120, shop_lng: 69 } })).status, 400);
    assert.equal((await api('PATCH', '/api/profile', { token: owner.token, body: { shop_lat: 41 } })).status, 400);
    assert.equal((await api('GET', '/api/shops')).status, 401);
  });

  it("a shop's catalog shows prices and stock status, never cost or quantity", async () => {
    const owner = await registerUser({ business_name: 'Catalog Shop' });
    const viewer = await registerUser();
    const p = await createProduct(owner.token, { name: 'Non', selling_price: '4000.00', cost_price: '3000.00', initial_quantity: 7 });
    await createProduct(owner.token, { name: 'Sut', initial_quantity: 0 });

    // no location yet: not on the map, so no catalog
    assert.equal((await api('GET', `/api/shops/${owner.user.id}`, { token: viewer.token })).status, 404);
    await api('PATCH', '/api/profile', { token: owner.token, body: { shop_lat: 41.3, shop_lng: 69.2 } });

    const res = await api('GET', `/api/shops/${owner.user.id}`, { token: viewer.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.shop.name, 'Catalog Shop');
    const items = res.body.data.products;
    assert.deepEqual(items.map((x) => [x.name, x.in_stock]), [['Non', true], ['Sut', false]]);
    const non = items.find((x) => x.id === p.id);
    assert.equal(Number(non.price), 4000);
    for (const key of ['cost_price', 'quantity', 'sku', 'barcode', 'user_id']) assert.equal(key in non, false, key);

    assert.equal((await api('GET', '/api/shops/not-a-uuid', { token: viewer.token })).status, 400);
    assert.equal((await api('GET', `/api/shops/${owner.user.id}`)).status, 401);
  });
});
