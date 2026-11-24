import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { api, createProduct, registerUser, startServer, stopServer, uniqueSku } from './helpers.js';

before(startServer);
after(stopServer);

describe('products CRUD', () => {
  let token;
  before(async () => {
    ({ token } = await registerUser());
  });

  it('creates a product with stock, money as exact strings and an initial movement', async () => {
    const p = await createProduct(token, {
      name: 'Coca-Cola 1L',
      category: 'Drinks',
      selling_price: 12.5,
      cost_price: '9.99',
      initial_quantity: 40,
      low_stock_threshold: 8,
    });
    assert.equal(p.selling_price, '12.50');
    assert.equal(p.cost_price, '9.99');
    assert.equal(p.quantity, 40);
    assert.equal(p.low_stock_threshold, 8);
    assert.equal(p.unit, 'pcs');
    assert.equal(p.is_active, true);

    const hist = await api('GET', `/api/inventory/history?product_id=${p.id}`, { token });
    assert.equal(hist.body.data.length, 1);
    assert.equal(hist.body.data[0].movement_type, 'initial');
    assert.equal(hist.body.data[0].quantity_change, 40);
  });

  it('defaults cost_price to 0 and quantity to 0 (no movement)', async () => {
    const res = await api('POST', '/api/products', {
      token,
      body: { sku: uniqueSku(), name: 'Bare', selling_price: '5' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.cost_price, '0.00');
    assert.equal(res.body.data.quantity, 0);
    assert.equal(res.body.data.out_of_stock, true);
  });

  it('validates money: negatives, >2 decimals, NaN strings, too large', async () => {
    for (const selling_price of [-1, '10.999', 'abc', '1e5', 99_999_999_999, '']) {
      const res = await api('POST', '/api/products', {
        token,
        body: { sku: uniqueSku(), name: 'X', selling_price },
      });
      assert.equal(res.status, 400, String(selling_price));
    }
  });

  it('rejects duplicate SKU (case-insensitive) with 409, but allows it after archiving', async () => {
    const sku = uniqueSku('DUP');
    const first = await createProduct(token, { sku });
    const dup = await api('POST', '/api/products', {
      token,
      body: { sku: sku.toLowerCase(), name: 'Dup', selling_price: 1 },
    });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'DUPLICATE_SKU');

    const del = await api('DELETE', `/api/products/${first.id}`, { token });
    assert.equal(del.status, 200);
    assert.equal(del.body.data.is_active, false);

    const again = await api('POST', '/api/products', {
      token,
      body: { sku, name: 'Reused', selling_price: 1 },
    });
    assert.equal(again.status, 201);
  });

  it('gets, updates (partial) and clears optional fields', async () => {
    const p = await createProduct(token, { category: 'Old', description: 'desc' });
    const res = await api('PUT', `/api/products/${p.id}`, {
      token,
      body: { name: 'Renamed', selling_price: '30', category: '', low_stock_threshold: 2 },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.name, 'Renamed');
    assert.equal(res.body.data.selling_price, '30.00');
    assert.equal(res.body.data.category, null);
    assert.equal(res.body.data.description, 'desc');
    assert.equal(res.body.data.low_stock_threshold, 2);

    const got = await api('GET', `/api/products/${p.id}`, { token });
    assert.equal(got.body.data.name, 'Renamed');
  });

  it('does not allow changing stock through PUT, nor empty updates', async () => {
    const p = await createProduct(token);
    const qty = await api('PUT', `/api/products/${p.id}`, { token, body: { quantity: 999 } });
    assert.equal(qty.status, 400);
    const empty = await api('PUT', `/api/products/${p.id}`, { token, body: {} });
    assert.equal(empty.status, 400);
  });

  it('archived products: 404 on update/delete, visible with status=archived', async () => {
    const p = await createProduct(token);
    await api('DELETE', `/api/products/${p.id}`, { token });
    assert.equal((await api('PUT', `/api/products/${p.id}`, { token, body: { name: 'x' } })).status, 404);
    assert.equal((await api('DELETE', `/api/products/${p.id}`, { token })).status, 404);

    const archived = await api('GET', '/api/products?status=archived&limit=100', { token });
    assert.ok(archived.body.data.some((x) => x.id === p.id));
    const active = await api('GET', '/api/products?limit=100', { token });
    assert.ok(!active.body.data.some((x) => x.id === p.id));
  });

  it('returns 404 for a random UUID', async () => {
    const res = await api('GET', '/api/products/7d4f0a52-2f5e-4c1b-9a7e-3c1f0b6f9e11', { token });
    assert.equal(res.status, 404);
  });
});

describe('product listing', () => {
  let token;
  before(async () => {
    ({ token } = await registerUser());
    await createProduct(token, { name: 'Apple', category: 'Fruit', selling_price: 3, initial_quantity: 0 });
    await createProduct(token, { name: 'Banana', category: 'fruit', selling_price: 2, initial_quantity: 3 });
    await createProduct(token, { name: 'Milk', category: 'Dairy', selling_price: 8, initial_quantity: 50 });
  });

  it('paginates with meta', async () => {
    const res = await api('GET', '/api/products?limit=2&page=1&sort=name&order=asc', { token });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.meta, { page: 1, limit: 2, total: 3, total_pages: 2 });
    assert.deepEqual(res.body.data.map((p) => p.name), ['Apple', 'Banana']);
    const p2 = await api('GET', '/api/products?limit=2&page=2&sort=name&order=asc', { token });
    assert.deepEqual(p2.body.data.map((p) => p.name), ['Milk']);
  });

  it('searches by name/sku and filters by category (case-insensitive)', async () => {
    const s = await api('GET', '/api/products?search=ban', { token });
    assert.deepEqual(s.body.data.map((p) => p.name), ['Banana']);
    const c = await api('GET', '/api/products?category=FRUIT', { token });
    assert.equal(c.body.data.length, 2);
  });

  it('filters by stock status', async () => {
    const out = await api('GET', '/api/products?stock_status=out', { token });
    assert.deepEqual(out.body.data.map((p) => p.name), ['Apple']);
    const low = await api('GET', '/api/products?stock_status=low', { token });
    assert.deepEqual(low.body.data.map((p) => p.name), ['Banana']);
  });

  it('lists categories with counts', async () => {
    const res = await api('GET', '/api/products/categories', { token });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.find((c) => c.category === 'Dairy' && c.product_count === 1));
  });
});

describe('bulk import (POST /api/products/bulk)', () => {
  let token;
  before(async () => {
    ({ token } = await registerUser());
  });

  it('creates new and updates existing products by SKU, setting absolute stock', async () => {
    const existing = await createProduct(token, { sku: 'IMP-1', initial_quantity: 5 });
    const res = await api('POST', '/api/products/bulk', {
      token,
      body: {
        products: [
          { sku: 'imp-1', name: 'Updated', selling_price: '40', quantity: 12 },
          { sku: 'IMP-2', name: 'New', selling_price: '15', cost_price: '7', quantity: 30 },
        ],
      },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.created, 1);
    assert.equal(res.body.data.updated, 1);

    const p1 = await api('GET', `/api/products/${existing.id}`, { token });
    assert.equal(p1.body.data.name, 'Updated');
    assert.equal(p1.body.data.quantity, 12);

    const hist = await api('GET', `/api/inventory/history?product_id=${existing.id}&type=import`, { token });
    assert.equal(hist.body.data[0].quantity_change, 7);
  });

  it('rejects duplicate SKUs inside one payload', async () => {
    const res = await api('POST', '/api/products/bulk', {
      token,
      body: {
        products: [
          { sku: 'X-1', name: 'a', selling_price: 1 },
          { sku: 'x-1', name: 'b', selling_price: 1 },
        ],
      },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.details[0].field, 'products.1.sku');
  });

  it('is all-or-nothing: an invalid row means nothing is saved', async () => {
    const res = await api('POST', '/api/products/bulk', {
      token,
      body: {
        products: [
          { sku: 'ATOMIC-1', name: 'ok', selling_price: 1 },
          { sku: 'ATOMIC-2', name: 'bad', selling_price: -5 },
        ],
      },
    });
    assert.equal(res.status, 400);
    const list = await api('GET', '/api/products?search=ATOMIC', { token });
    assert.equal(list.body.data.length, 0);
  });
});
