import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { api, createProduct, createSale, registerUser, startServer, stopServer, uniqueSku } from './helpers.js';

before(startServer);
after(stopServer);

/*
 * Known data set (business timezone Asia/Tashkent, UTC+5):
 *   P1: cost 10, price 25     P2: cost 4, price 10
 *   Sale A: 2026-01-09T20:00Z (= Jan 10 01:00 local)  P1 x2            revenue 50, cogs 20
 *   Sale B: 2026-01-12 local                           P2 x5 + P1 x1@20 revenue 70, cogs 30
 *   Expense: Jan 10 rent 30.00, Jan 15 utilities 15.50
 * Totals Jan 10..16: revenue 120, cogs 50, gross 70, expenses 45.50, net 24.50
 */
describe('dashboard analytics', () => {
  let token;
  let p1;
  let p2;
  const range = 'from=2026-01-10&to=2026-01-16';

  before(async () => {
    ({ token } = await registerUser());
    p1 = await createProduct(token, { sku: uniqueSku('A'), name: 'P1', cost_price: '10', selling_price: '25', initial_quantity: 100 });
    p2 = await createProduct(token, { sku: uniqueSku('B'), name: 'P2', cost_price: '4', selling_price: '10', initial_quantity: 100 });

    let r = await createSale(token, [{ product_id: p1.id, quantity: 2 }], { sold_at: '2026-01-09T20:00:00Z' });
    assert.equal(r.status, 201);
    r = await createSale(
      token,
      [
        { product_id: p2.id, quantity: 5 },
        { product_id: p1.id, quantity: 1, unit_price: '20' },
      ],
      { sold_at: '2026-01-12T15:00:00+05:00' },
    );
    assert.equal(r.status, 201);

    await api('POST', '/api/expenses', { token, body: { category: 'Rent', amount: '30', expense_date: '2026-01-10' } });
    await api('POST', '/api/expenses', { token, body: { category: 'Utilities', amount: '15.50', expense_date: '2026-01-15' } });
  });

  it('overview: revenue, COGS, expenses and profit are exact', async () => {
    const res = await api('GET', `/api/dashboard/overview?${range}`, { token });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const d = res.body.data;
    assert.deepEqual(d.period, { from: '2026-01-10', to: '2026-01-16' });
    assert.equal(d.sales.count, 2);
    assert.equal(d.sales.units_sold, 8);
    assert.equal(d.sales.average_sale_value, '60.00');
    assert.deepEqual(d.profit, {
      revenue: '120.00',
      cogs: '50.00',
      gross_profit: '70.00',
      expenses: '45.50',
      net_profit: '24.50',
      gross_margin_percent: '58.33',
      net_margin_percent: '20.42',
    });
    // Inventory: P1 100-3=97 units @10, P2 95 @4
    assert.equal(d.inventory.active_products, 2);
    assert.equal(d.inventory.total_units, 192);
    assert.equal(d.inventory.stock_value_cost, '1350.00');
  });

  it('uses the business timezone: the 20:00Z sale belongs to Jan 10, not Jan 9', async () => {
    const jan9 = await api('GET', '/api/dashboard/overview?from=2026-01-09&to=2026-01-09', { token });
    assert.equal(jan9.body.data.profit.revenue, '0.00');
    const jan10 = await api('GET', '/api/dashboard/overview?from=2026-01-10&to=2026-01-10', { token });
    assert.equal(jan10.body.data.profit.revenue, '50.00');
  });

  it('daily profit series is zero-filled and consistent', async () => {
    const res = await api('GET', `/api/dashboard/profit?${range}&interval=day`, { token });
    assert.equal(res.status, 200);
    const s = res.body.data.series;
    assert.equal(s.length, 7);
    assert.deepEqual(s[0], {
      period_start: '2026-01-10',
      revenue: '50.00',
      cogs: '20.00',
      gross_profit: '30.00',
      expenses: '30.00',
      net_profit: '0.00',
    });
    assert.equal(s[1].revenue, '0.00');
    assert.equal(s[2].revenue, '70.00');
    assert.equal(s[5].expenses, '15.50');
    assert.equal(s[5].net_profit, '-15.50');
    assert.equal(res.body.data.totals.net_profit, '24.50');
  });

  it('weekly buckets start on Monday', async () => {
    const res = await api('GET', `/api/dashboard/revenue?${range}&interval=week`, { token });
    assert.deepEqual(
      res.body.data.series.map((b) => [b.period_start, b.revenue]),
      [
        ['2026-01-05', '50.00'],
        ['2026-01-12', '70.00'],
      ],
    );
  });

  it('sales series counts sales and units', async () => {
    const res = await api('GET', `/api/dashboard/sales?${range}&interval=month`, { token });
    assert.deepEqual(res.body.data.series, [
      { period_start: '2026-01-01', sales_count: 2, units_sold: 8, revenue: '120.00' },
    ]);
  });

  it('top products by revenue, quantity and profit', async () => {
    const byRevenue = await api('GET', `/api/dashboard/top-products?${range}`, { token });
    assert.deepEqual(byRevenue.body.data.items.map((i) => [i.name, i.revenue]), [
      ['P1', '70.00'],
      ['P2', '50.00'],
    ]);
    const byQty = await api('GET', `/api/dashboard/top-products?${range}&by=quantity`, { token });
    assert.deepEqual(byQty.body.data.items.map((i) => [i.name, i.quantity_sold]), [
      ['P2', 5],
      ['P1', 3],
    ]);
    const byProfit = await api('GET', `/api/dashboard/top-products?${range}&by=profit&limit=1`, { token });
    assert.deepEqual(byProfit.body.data.items.map((i) => [i.name, i.gross_profit]), [['P1', '40.00']]);
  });

  it('validates ranges and intervals', async () => {
    const tooLong = await api('GET', '/api/dashboard/sales?from=2020-01-01&to=2026-01-01&interval=day', { token });
    assert.equal(tooLong.status, 400);
    const reversed = await api('GET', '/api/dashboard/overview?from=2026-02-01&to=2026-01-01', { token });
    assert.equal(reversed.status, 400);
    const badInterval = await api('GET', '/api/dashboard/sales?interval=hour', { token });
    assert.equal(badInterval.status, 400);
  });

  it('default range is the last 30 days and "today" reflects today\'s sales', async () => {
    const before = await api('GET', '/api/dashboard/overview', { token });
    assert.equal(before.body.data.profit.revenue, '0.00');
    await createSale(token, [{ product_id: p2.id, quantity: 1 }]);
    const after = await api('GET', '/api/dashboard/overview', { token });
    assert.equal(after.body.data.today.revenue, '10.00');
    assert.equal(after.body.data.today.sales_count, 1);
    assert.equal(after.body.data.sales.count, 1);
  });
});
