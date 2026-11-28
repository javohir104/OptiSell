import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { api, createProduct, createSale, registerUser, startServer, stockOf, stopServer } from './helpers.js';

before(startServer);
after(stopServer);

describe('tenant isolation: user B can never touch user A data', () => {
  let a;
  let b;
  let product;
  let sale;
  let expense;

  before(async () => {
    a = await registerUser();
    b = await registerUser();
    product = await createProduct(a.token, { name: 'A secret product', initial_quantity: 10 });
    sale = (await createSale(a.token, [{ product_id: product.id, quantity: 1 }])).body.data;
    expense = (await api('POST', '/api/expenses', { token: a.token, body: { category: 'Rent', amount: 100 } })).body.data;
  });

  it('cannot read, update or delete A product (404, not 403, to avoid leaking existence)', async () => {
    assert.equal((await api('GET', `/api/products/${product.id}`, { token: b.token })).status, 404);
    assert.equal(
      (await api('PUT', `/api/products/${product.id}`, { token: b.token, body: { name: 'hacked' } })).status,
      404,
    );
    assert.equal((await api('DELETE', `/api/products/${product.id}`, { token: b.token })).status, 404);
    const still = await api('GET', `/api/products/${product.id}`, { token: a.token });
    assert.equal(still.body.data.name, 'A secret product');
    assert.equal(still.body.data.is_active, true);
  });

  it('cannot see or change A inventory', async () => {
    assert.equal((await api('GET', `/api/inventory/${product.id}`, { token: b.token })).status, 404);
    const adj = await api('POST', '/api/inventory/adjust', {
      token: b.token,
      body: { product_id: product.id, type: 'adjustment', quantity_change: -9 },
    });
    assert.equal(adj.status, 404);
    const hist = await api('GET', `/api/inventory/history?product_id=${product.id}`, { token: b.token });
    assert.equal(hist.body.meta.total, 0);
    assert.equal(await stockOf(a.token, product.id), 9);
  });

  it('cannot sell A product', async () => {
    const res = await createSale(b.token, [{ product_id: product.id, quantity: 1 }]);
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_PRODUCTS');
    assert.equal(await stockOf(a.token, product.id), 9);
  });

  it('cannot read A sales or expenses', async () => {
    assert.equal((await api('GET', `/api/sales/${sale.id}`, { token: b.token })).status, 404);
    assert.equal((await api('GET', `/api/expenses/${expense.id}`, { token: b.token })).status, 404);
    assert.equal(
      (await api('PUT', `/api/expenses/${expense.id}`, { token: b.token, body: { amount: 1 } })).status,
      404,
    );
    assert.equal((await api('DELETE', `/api/expenses/${expense.id}`, { token: b.token })).status, 404);
  });

  it('B lists and dashboards contain none of A data', async () => {
    for (const path of ['/api/products', '/api/inventory', '/api/sales', '/api/expenses', '/api/inventory/history']) {
      const res = await api('GET', path, { token: b.token });
      assert.equal(res.status, 200, path);
      assert.equal(res.body.meta.total, 0, path);
    }
    const overview = await api('GET', '/api/dashboard/overview', { token: b.token });
    assert.equal(overview.body.data.profit.revenue, '0.00');
    assert.equal(overview.body.data.profit.expenses, '0.00');
    assert.equal(overview.body.data.inventory.active_products, 0);
  });

  it('B cannot sell A product', async () => {
    const res = await api('POST', '/api/sales', { token: b.token, body: { items: [{ product_id: product.id, quantity: 1 }] } });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_PRODUCTS');
  });
});
