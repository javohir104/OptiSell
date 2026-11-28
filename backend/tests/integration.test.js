/**
 * Endpoints and fields used by the React frontend:
 * product image/max stock, sale line items in lists, category report,
 * worst sellers and CSV import.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  api,
  createProduct,
  createSale,
  registerUser,
  startServer,
  stopServer,
  stockOf,
  uniqueSku,
} from './helpers.js';

before(startServer);
after(stopServer);

describe('products: image and max stock', () => {
  it('stores, updates and clears image_url and max_stock', async () => {
    const { token } = await registerUser();
    const p = await createProduct(token, {
      image_url: 'https://example.com/a.png',
      max_stock: 50,
      initial_quantity: 10,
    });
    assert.equal(p.image_url, 'https://example.com/a.png');
    assert.equal(p.max_stock, 50);

    const res = await api('PUT', `/api/products/${p.id}`, { token, body: { max_stock: 0, image_url: '' } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.max_stock, 0);
    assert.equal(res.body.data.image_url, null);
  });

  it('rejects non-http image URLs', async () => {
    const { token } = await registerUser();
    const res = await api('POST', '/api/products', {
      token,
      body: { sku: uniqueSku(), name: 'X', selling_price: '1', image_url: 'javascript:alert(1)' },
    });
    assert.equal(res.status, 400);
  });
});

describe('sales list and reports', () => {
  let token;
  let a;
  let b;

  before(async () => {
    ({ token } = await registerUser());
    a = await createProduct(token, { name: 'Alpha', category: 'Drinks', selling_price: '10', cost_price: '4' });
    b = await createProduct(token, { name: 'Beta', category: null, selling_price: '3', cost_price: '1' });
    const r1 = await createSale(token, [{ product_id: a.id, quantity: 3 }], { sold_at: '2026-02-10T10:00:00+05:00' });
    const r2 = await createSale(token, [{ product_id: b.id, quantity: 1 }], { sold_at: '2026-02-11T10:00:00+05:00' });
    assert.equal(r1.status, 201);
    assert.equal(r2.status, 201);
  });

  it('embeds line items in the sales list', async () => {
    const res = await api('GET', '/api/sales?from=2026-02-01&to=2026-02-28', { token });
    assert.equal(res.status, 200);
    const sale = res.body.data.find((s) => s.items[0].product_id === a.id);
    assert.deepEqual(
      { name: sale.items[0].product_name, category: sale.items[0].category, qty: sale.items[0].quantity, total: sale.items[0].line_total },
      { name: 'Alpha', category: 'Drinks', qty: 3, total: '30.00' },
    );
  });

  it('reports revenue per category', async () => {
    const res = await api('GET', '/api/dashboard/categories?from=2026-02-01&to=2026-02-28', { token });
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.data.items.map((c) => [c.category, c.quantity_sold, c.revenue]),
      [
        ['Drinks', 3, '30.00'],
        [null, 1, '3.00'],
      ],
    );
  });

  it('lists worst sellers with order=asc', async () => {
    const res = await api('GET', '/api/dashboard/top-products?from=2026-02-01&to=2026-02-28&order=asc', { token });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.items.map((p) => p.name), ['Beta', 'Alpha']);
  });
});

describe('CSV import', () => {
  it('imports valid product rows and reports invalid ones', async () => {
    const { token } = await registerUser();
    const sku = uniqueSku('IMP');
    const res = await api('POST', '/api/import/products', {
      token,
      body: {
        file_name: 'products.csv',
        columns: ['name', 'category', 'price', 'cost', 'stock', 'sku', 'maxStock'],
        rows: [
          { name: 'Tea', category: 'Drinks', price: '88 500', cost: '43500', stock: '12', sku, maxStock: '40' },
          { name: '', category: 'Drinks', price: '1', cost: '1', stock: '1' },
          { name: 'Bad', category: 'X', price: 'abc', cost: '1', stock: '1.5' },
        ],
      },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const r = res.body.data;
    assert.deepEqual([r.status, r.total_rows, r.imported, r.failed], ['partial', 3, 1, 2]);
    assert.ok(r.errors.some((e) => e.row === 3 && e.field === 'name'));
    assert.ok(r.errors.some((e) => e.row === 4 && e.field === 'price'));
    assert.ok(r.errors.some((e) => e.row === 4 && e.field === 'stock'));

    const list = await api('GET', `/api/products?search=${sku}`, { token });
    const tea = list.body.data[0];
    assert.deepEqual([tea.selling_price, tea.quantity, tea.max_stock], ['88500.00', 12, 40]);

    const hist = await api('GET', '/api/import/history', { token });
    assert.equal(hist.body.data[0].id, r.id);
  });

  it('imports sales by SKU, decrements stock and rejects unknown SKUs and overselling', async () => {
    const { token } = await registerUser();
    const p = await createProduct(token, { initial_quantity: 5 });
    const res = await api('POST', '/api/import/sales', {
      token,
      body: {
        file_name: 'sales.csv',
        columns: ['sku', 'quantity', 'date', 'paymentMethod'],
        rows: [
          { sku: p.sku.toLowerCase(), quantity: '2', date: '2026-03-01', paymentMethod: 'card' },
          { sku: 'NOPE', quantity: '1' },
          { sku: p.sku, quantity: '99' },
          { sku: p.sku, quantity: '1', date: '2026-02-31' },
        ],
      },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const r = res.body.data;
    assert.deepEqual([r.status, r.imported, r.failed], ['partial', 1, 3]);
    assert.deepEqual(
      r.errors.map((e) => [e.row, e.field]),
      [
        [3, 'sku'],
        [4, 'quantity'],
        [5, 'date'],
      ],
    );
    assert.equal(await stockOf(token, p.id), 3);

    const sales = await api('GET', '/api/sales?from=2026-03-01&to=2026-03-01', { token });
    assert.equal(sales.body.data.length, 1);
    assert.equal(sales.body.data[0].payment_method, 'card');
  });

  it('fails the file when required columns are missing', async () => {
    const { token } = await registerUser();
    const res = await api('POST', '/api/import/sales', {
      token,
      body: { file_name: 's.csv', columns: ['sku'], rows: [{ sku: 'A' }] },
    });
    assert.equal(res.status, 201);
    assert.deepEqual([res.body.data.status, res.body.data.failed], ['failed', 1]);
    assert.match(res.body.data.errors[0].message, /quantity/);
  });

  it('rejects unknown import types and requires auth', async () => {
    const { token } = await registerUser();
    assert.equal((await api('POST', '/api/import/users', { token, body: {} })).status, 400);
    assert.equal((await api('GET', '/api/import/history')).status, 401);
  });
});
