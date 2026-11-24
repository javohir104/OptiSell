import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { api, createProduct, registerUser, startServer, stockOf, stopServer } from './helpers.js';

before(startServer);
after(stopServer);

describe('inventory', () => {
  let token;
  before(async () => {
    ({ token } = await registerUser());
  });

  it('restock increases stock and records a movement', async () => {
    const p = await createProduct(token, { initial_quantity: 10 });
    const res = await api('POST', '/api/inventory/adjust', {
      token,
      body: { product_id: p.id, type: 'restock', quantity_change: 15, note: 'Supplier delivery' },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(
      { b: res.body.data.quantity_before, c: res.body.data.quantity_change, a: res.body.data.quantity_after },
      { b: 10, c: 15, a: 25 },
    );
    assert.equal(await stockOf(token, p.id), 25);

    const detail = await api('GET', `/api/inventory/${p.id}`, { token });
    assert.equal(detail.body.data.recent_movements[0].movement_type, 'restock');
    assert.equal(detail.body.data.recent_movements[0].note, 'Supplier delivery');
  });

  it('never lets stock go below zero (409, stock unchanged)', async () => {
    const p = await createProduct(token, { initial_quantity: 3 });
    const res = await api('POST', '/api/inventory/adjust', {
      token,
      body: { product_id: p.id, type: 'adjustment', quantity_change: -4 },
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'INSUFFICIENT_STOCK');
    assert.equal(res.body.error.details.available, 3);
    assert.equal(await stockOf(token, p.id), 3);
  });

  it('stock-take with new_quantity sets the absolute level', async () => {
    const p = await createProduct(token, { initial_quantity: 20 });
    const res = await api('POST', '/api/inventory/adjust', {
      token,
      body: { product_id: p.id, type: 'adjustment', new_quantity: 17, note: 'Counted' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.quantity_change, -3);
    assert.equal(await stockOf(token, p.id), 17);
  });

  it('validates adjust input', async () => {
    const p = await createProduct(token);
    const bad = [
      { product_id: p.id, type: 'restock', quantity_change: -5 },
      { product_id: p.id, type: 'restock', quantity_change: 0 },
      { product_id: p.id, type: 'restock' },
      { product_id: p.id, type: 'adjustment', quantity_change: 1, new_quantity: 1 },
      { product_id: p.id, type: 'restock', new_quantity: 5 },
      { product_id: p.id, type: 'sale', quantity_change: -1 },
      { product_id: p.id, type: 'restock', quantity_change: 1.5 },
      { product_id: 'nope', type: 'restock', quantity_change: 1 },
    ];
    for (const body of bad) {
      const res = await api('POST', '/api/inventory/adjust', { token, body });
      assert.equal(res.status, 400, JSON.stringify(body));
    }
  });

  it('cannot adjust archived products', async () => {
    const p = await createProduct(token);
    await api('DELETE', `/api/products/${p.id}`, { token });
    const res = await api('POST', '/api/inventory/adjust', {
      token,
      body: { product_id: p.id, type: 'restock', quantity_change: 1 },
    });
    assert.equal(res.status, 404);
  });

  it('concurrent adjustments are serialized (no lost updates)', async () => {
    const p = await createProduct(token, { initial_quantity: 0 });
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        api('POST', '/api/inventory/adjust', {
          token,
          body: { product_id: p.id, type: 'restock', quantity_change: 1 },
        }),
      ),
    );
    assert.ok(results.every((r) => r.status === 200));
    assert.equal(await stockOf(token, p.id), 20);
  });
});

describe('inventory listing, low stock and history', () => {
  let token;
  let low;
  let out;
  before(async () => {
    ({ token } = await registerUser());
    low = await createProduct(token, { name: 'Low', initial_quantity: 2, low_stock_threshold: 5 });
    out = await createProduct(token, { name: 'Out', initial_quantity: 0 });
    await createProduct(token, { name: 'Plenty', initial_quantity: 100, cost_price: '2.50' });
  });

  it('lists inventory with stock status and value', async () => {
    const res = await api('GET', '/api/inventory?sort=name', { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.meta.total, 3);
    const plenty = res.body.data.find((r) => r.name === 'Plenty');
    assert.equal(plenty.stock_status, 'in_stock');
    assert.equal(plenty.stock_value_cost, '250.00');
  });

  it('low-stock lists low and out-of-stock items, emptiest first', async () => {
    const res = await api('GET', '/api/inventory/low-stock', { token });
    assert.deepEqual(
      res.body.data.map((r) => [r.product_id, r.stock_status]),
      [
        [out.id, 'out'],
        [low.id, 'low'],
      ],
    );
  });

  it('history filters by type and date range', async () => {
    const all = await api('GET', '/api/inventory/history', { token });
    assert.equal(all.body.meta.total, 2); // two products had initial stock > 0
    const initial = await api('GET', '/api/inventory/history?type=initial', { token });
    assert.equal(initial.body.meta.total, 2);
    const restock = await api('GET', '/api/inventory/history?type=restock', { token });
    assert.equal(restock.body.meta.total, 0);
    const old = await api('GET', '/api/inventory/history?from=2020-01-01&to=2020-12-31', { token });
    assert.equal(old.body.meta.total, 0);
    const badRange = await api('GET', '/api/inventory/history?from=2025-02-01&to=2025-01-01', { token });
    assert.equal(badRange.status, 400);
  });
});
