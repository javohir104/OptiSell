import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { api, createProduct, createSale, db, registerUser, startServer, stockOf, stopServer } from './helpers.js';

before(startServer);
after(stopServer);

describe('creating sales', () => {
  let token;
  before(async () => {
    ({ token } = await registerUser());
  });

  it('creates a sale, computes exact totals, decrements stock and writes the ledger', async () => {
    const a = await createProduct(token, { selling_price: '19.99', cost_price: '12.10', initial_quantity: 10 });
    const b = await createProduct(token, { selling_price: '0.10', cost_price: '0.05', initial_quantity: 100 });

    const res = await createSale(
      token,
      [
        { product_id: a.id, quantity: 3 },
        { product_id: b.id, quantity: 3, unit_price: '0.20' },
      ],
      { payment_method: 'card', customer_name: 'Ali' },
    );
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const sale = res.body.data;
    // 3*19.99 + 3*0.20 = 59.97 + 0.60 = 60.57 (exact, no float error)
    assert.equal(sale.total_amount, '60.57');
    // 3*12.10 + 3*0.05 = 36.30 + 0.15 = 36.45
    assert.equal(sale.total_cost, '36.45');
    assert.equal(sale.gross_profit, '24.12');
    assert.equal(sale.items_count, 6);
    assert.equal(sale.payment_method, 'card');
    assert.equal(sale.items.length, 2);

    assert.equal(await stockOf(token, a.id), 7);
    assert.equal(await stockOf(token, b.id), 97);

    const hist = await api('GET', `/api/inventory/history?type=sale&product_id=${a.id}`, { token });
    assert.equal(hist.body.data[0].quantity_change, -3);
    assert.equal(hist.body.data[0].quantity_after, 7);
    assert.equal(hist.body.data[0].sale_id, sale.id);
  });

  it('keeps the cost snapshot: changing product cost later does not change old sales', async () => {
    const p = await createProduct(token, { cost_price: '5.00', selling_price: '10.00' });
    const sale = (await createSale(token, [{ product_id: p.id, quantity: 2 }])).body.data;
    await api('PUT', `/api/products/${p.id}`, { token, body: { cost_price: '9.00', selling_price: '99' } });
    const again = await api('GET', `/api/sales/${sale.id}`, { token });
    assert.equal(again.body.data.total_cost, '10.00');
    assert.equal(again.body.data.total_amount, '20.00');
    assert.equal(again.body.data.items[0].unit_cost, '5.00');
  });

  it('rejects the whole sale atomically when any item lacks stock', async () => {
    const ok = await createProduct(token, { initial_quantity: 10 });
    const short = await createProduct(token, { initial_quantity: 1 });
    const res = await createSale(token, [
      { product_id: ok.id, quantity: 5 },
      { product_id: short.id, quantity: 2 },
    ]);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'INSUFFICIENT_STOCK');
    assert.deepEqual(res.body.error.details.map((d) => [d.product_id, d.available, d.requested]), [
      [short.id, 1, 2],
    ]);
    assert.equal(await stockOf(token, ok.id), 10, 'first item must be rolled back');
    assert.equal(await stockOf(token, short.id), 1);
  });

  it('rejects unknown/archived products and duplicate lines', async () => {
    const p = await createProduct(token);
    const archived = await createProduct(token);
    await api('DELETE', `/api/products/${archived.id}`, { token });

    const unknown = await createSale(token, [{ product_id: randomUUID(), quantity: 1 }]);
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error.code, 'INVALID_PRODUCTS');

    const arch = await createSale(token, [{ product_id: archived.id, quantity: 1 }]);
    assert.equal(arch.body.error.code, 'INVALID_PRODUCTS');

    const dup = await createSale(token, [
      { product_id: p.id, quantity: 1 },
      { product_id: p.id, quantity: 1 },
    ]);
    assert.equal(dup.status, 400);
  });

  it('validates quantities, items, sold_at and payment method', async () => {
    const p = await createProduct(token);
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const bad = [
      { items: [] },
      { items: [{ product_id: p.id, quantity: 0 }] },
      { items: [{ product_id: p.id, quantity: -1 }] },
      { items: [{ product_id: p.id, quantity: 1.5 }] },
      { items: [{ product_id: p.id, quantity: 1, unit_price: '-1' }] },
      { items: [{ product_id: p.id, quantity: 1 }], sold_at: future },
      { items: [{ product_id: p.id, quantity: 1 }], payment_method: 'bitcoin' },
      { items: [{ product_id: p.id, quantity: 1 }], total_amount: '0.01' },
    ];
    for (const body of bad) {
      const res = await api('POST', '/api/sales', { token, body });
      assert.equal(res.status, 400, JSON.stringify(body));
    }
    assert.equal(await stockOf(token, p.id), 10);
  });

  it('accepts a backdated sold_at (historical import)', async () => {
    const p = await createProduct(token);
    const res = await createSale(token, [{ product_id: p.id, quantity: 1 }], {
      sold_at: '2025-03-01T10:00:00+05:00',
    });
    assert.equal(res.status, 201);
    assert.equal(new Date(res.body.data.sold_at).toISOString(), '2025-03-01T05:00:00.000Z');
  });
});

describe('concurrency and idempotency', () => {
  let token;
  before(async () => {
    ({ token } = await registerUser());
  });

  it('parallel sales can never oversell: 10 buyers, 5 in stock -> exactly 5 succeed', async () => {
    const p = await createProduct(token, { initial_quantity: 5 });
    const results = await Promise.all(
      Array.from({ length: 10 }, () => createSale(token, [{ product_id: p.id, quantity: 1 }])),
    );
    const statuses = results.map((r) => r.status).sort();
    assert.equal(statuses.filter((s) => s === 201).length, 5, statuses.join(','));
    assert.equal(statuses.filter((s) => s === 409).length, 5);
    assert.equal(await stockOf(token, p.id), 0);

    const moves = db().inventory_movements.filter((m) => m.product_id === p.id && m.movement_type === 'sale');
    assert.equal(moves.length, 5);
  });

  it('opposite item order in parallel sales does not deadlock', async () => {
    const a = await createProduct(token, { initial_quantity: 100 });
    const b = await createProduct(token, { initial_quantity: 100 });
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        createSale(
          token,
          i % 2
            ? [
                { product_id: a.id, quantity: 1 },
                { product_id: b.id, quantity: 1 },
              ]
            : [
                { product_id: b.id, quantity: 1 },
                { product_id: a.id, quantity: 1 },
              ],
        ),
      ),
    );
    assert.ok(results.every((r) => r.status === 201), results.map((r) => r.status).join(','));
    assert.equal(await stockOf(token, a.id), 80);
    assert.equal(await stockOf(token, b.id), 80);
  });

  it('Idempotency-Key: retries return the same sale and stock is charged once', async () => {
    const p = await createProduct(token, { initial_quantity: 10 });
    const key = `retry-${randomUUID()}`;
    const first = await createSale(token, [{ product_id: p.id, quantity: 2 }], {}, { 'idempotency-key': key });
    const second = await createSale(token, [{ product_id: p.id, quantity: 2 }], {}, { 'idempotency-key': key });
    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('idempotent-replayed'), 'true');
    assert.equal(second.body.data.id, first.body.data.id);
    assert.equal(await stockOf(token, p.id), 8);
  });

  it('Idempotency-Key: concurrent duplicates create exactly one sale', async () => {
    const p = await createProduct(token, { initial_quantity: 10 });
    const key = `race-${randomUUID()}`;
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        createSale(token, [{ product_id: p.id, quantity: 1 }], {}, { 'idempotency-key': key }),
      ),
    );
    assert.ok(results.every((r) => [200, 201].includes(r.status)), results.map((r) => r.status).join(','));
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.equal(new Set(results.map((r) => r.body.data.id)).size, 1);
    assert.equal(await stockOf(token, p.id), 9);
  });

  it('rejects malformed Idempotency-Key headers', async () => {
    const p = await createProduct(token);
    const res = await createSale(token, [{ product_id: p.id, quantity: 1 }], {}, { 'idempotency-key': 'bad key!' });
    assert.equal(res.status, 400);
  });
});

describe('listing and statistics', () => {
  let token;
  let p;
  before(async () => {
    ({ token } = await registerUser());
    p = await createProduct(token, { selling_price: '10', cost_price: '4', initial_quantity: 100 });
    const q = await createProduct(token, { selling_price: '5', cost_price: '1', initial_quantity: 100 });
    await createSale(token, [{ product_id: p.id, quantity: 2 }], { payment_method: 'cash' });
    await createSale(token, [{ product_id: q.id, quantity: 4 }], { payment_method: 'card' });
    await createSale(token, [{ product_id: p.id, quantity: 1 }], { sold_at: '2025-01-15T12:00:00+05:00' });
  });

  it('lists sales with pagination and filters', async () => {
    const all = await api('GET', '/api/sales', { token });
    assert.equal(all.status, 200);
    assert.equal(all.body.meta.total, 3);
    const card = await api('GET', '/api/sales?payment_method=card', { token });
    assert.equal(card.body.meta.total, 1);
    const withP = await api('GET', `/api/sales?product_id=${p.id}`, { token });
    assert.equal(withP.body.meta.total, 2);
    const jan = await api('GET', '/api/sales?from=2025-01-15&to=2025-01-15', { token });
    assert.equal(jan.body.meta.total, 1);
    const sorted = await api('GET', '/api/sales?sort=total_amount&order=asc', { token });
    assert.deepEqual(sorted.body.data.map((s) => s.total_amount), ['10.00', '20.00', '20.00']);
  });

  it('computes statistics for the default (last 30 days) range', async () => {
    const res = await api('GET', '/api/sales/statistics', { token });
    assert.equal(res.status, 200);
    const s = res.body.data;
    assert.equal(s.sales_count, 2);
    assert.equal(s.units_sold, 6);
    assert.equal(s.revenue, '40.00');
    assert.equal(s.cogs, '12.00');
    assert.equal(s.gross_profit, '28.00');
    assert.equal(s.average_sale_value, '20.00');
    assert.equal(s.by_payment_method.length, 2);
  });

  it('GET /api/sales/:id returns items; unknown id is 404', async () => {
    const list = await api('GET', '/api/sales?limit=1', { token });
    const one = await api('GET', `/api/sales/${list.body.data[0].id}`, { token });
    assert.equal(one.status, 200);
    assert.ok(Array.isArray(one.body.data.items));
    assert.equal((await api('GET', `/api/sales/${randomUUID()}`, { token })).status, 404);
  });
});
