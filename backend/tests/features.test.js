import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PASSWORD, api, createProduct, createSale, db, registerUser, startServer, stockOf, stopServer } from './helpers.js';

before(startServer);
after(stopServer);

const inAMonth = () => new Date(Date.now() + 30 * 86_400_000).toISOString();

/** Put a registered user on a plan directly in the data. */
function setPlan(userId, plan) {
  const u = db().users.find((x) => x.id === userId);
  u.plan = plan;
  u.plan_expires_at = plan === 'free' ? null : inAMonth();
}

describe('plan features', () => {
  it('free plan: no expenses, no analytics; the dashboard still works', async () => {
    const { token, user } = await registerUser();
    setPlan(user.id, 'free');

    const me = await api('GET', '/api/auth/me', { token });
    assert.deepEqual(me.body.data.user.subscription.features, []);

    const exp = await api('GET', '/api/expenses', { token });
    assert.equal(exp.status, 403);
    assert.equal(exp.body.error.code, 'PLAN_FEATURE_LOCKED');
    assert.equal(exp.body.error.details.required_plan, 'pro');

    const top = await api('GET', '/api/dashboard/top-products', { token });
    assert.equal(top.status, 403);
    assert.equal((await api('GET', '/api/dashboard/categories', { token })).status, 403);
    assert.equal((await api('GET', '/api/dashboard/overview', { token })).status, 200);
    assert.equal((await api('GET', '/api/customers', { token })).status, 403);
    assert.equal((await api('GET', '/api/suppliers', { token })).status, 403);
  });

  it('pro plan (trial) unlocks expenses and analytics but not sellers / Telegram', async () => {
    const { token } = await registerUser();
    assert.equal((await api('GET', '/api/expenses', { token })).status, 200);
    assert.equal((await api('GET', '/api/dashboard/top-products', { token })).status, 200);
    const staff = await api('POST', '/api/staff', { token, body: { full_name: 'A', email: `s_${randomUUID()}@t.com`, password: PASSWORD } });
    assert.equal(staff.status, 403);
    assert.equal((await api('POST', '/api/telegram/link', { token })).status, 403);
  });

  it('public plan list shows the features of each plan', async () => {
    const res = await api('GET', '/api/billing/plans');
    const byId = Object.fromEntries(res.body.data.plans.map((p) => [p.id, p]));
    assert.deepEqual(byId.free.features, []);
    assert.ok(byId.pro.features.includes('expenses'));
    assert.ok(byId.max.features.includes('staff'));
  });
});

describe('discounts', () => {
  it('splits a percentage discount over the lines exactly', async () => {
    const { token } = await registerUser();
    const a = await createProduct(token, { selling_price: '10000', cost_price: '6000', initial_quantity: 10 });
    const b = await createProduct(token, { selling_price: '3333', cost_price: '1000', initial_quantity: 10 });
    const res = await createSale(token, [{ product_id: a.id, quantity: 1 }, { product_id: b.id, quantity: 1 }], {
      discount_type: 'percent',
      discount_value: 10,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const sale = res.body.data;
    assert.equal(sale.subtotal_amount, '13333.00');
    assert.equal(sale.discount_amount, '1333.30');
    assert.equal(sale.total_amount, '11999.70');
    const lines = sale.items.reduce((s, it) => s + Number(it.line_total) * 100, 0);
    assert.equal(Math.round(lines), 1199970);

    const stats = await api('GET', '/api/sales/statistics', { token });
    assert.equal(stats.body.data.discounts.amount, '1333.30');
    const top = await api('GET', '/api/dashboard/top-products', { token });
    const total = top.body.data.items.reduce((s, it) => s + Math.round(Number(it.revenue) * 100), 0);
    assert.equal(total, 1199970);
  });

  it('rejects a discount larger than the total', async () => {
    const { token } = await registerUser();
    const p = await createProduct(token, { selling_price: '100' });
    const res = await createSale(token, [{ product_id: p.id, quantity: 1 }], { discount_type: 'amount', discount_value: '101' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'DISCOUNT_TOO_LARGE');
  });
});

describe('returns', () => {
  it('partial return restocks, reduces totals; full return marks the sale returned', async () => {
    const { token } = await registerUser();
    const p = await createProduct(token, { selling_price: '50', cost_price: '20', initial_quantity: 10 });
    const sale = (await createSale(token, [{ product_id: p.id, quantity: 4 }])).body.data;
    assert.equal(await stockOf(token, p.id), 6);

    const part = await api('POST', `/api/sales/${sale.id}/return`, { token, body: { items: [{ product_id: p.id, quantity: 1 }], reason: 'Broken' } });
    assert.equal(part.status, 200, JSON.stringify(part.body));
    assert.equal(part.body.data.status, 'completed');
    assert.equal(part.body.data.total_amount, '150.00');
    assert.equal(part.body.data.returned_amount, '50.00');
    assert.equal(await stockOf(token, p.id), 7);

    const tooMany = await api('POST', `/api/sales/${sale.id}/return`, { token, body: { items: [{ product_id: p.id, quantity: 9 }] } });
    assert.equal(tooMany.status, 400);

    const all = await api('POST', `/api/sales/${sale.id}/return`, { token, body: {} });
    assert.equal(all.body.data.status, 'returned');
    assert.equal(all.body.data.total_amount, '0.00');
    assert.equal(await stockOf(token, p.id), 10);

    const again = await api('POST', `/api/sales/${sale.id}/return`, { token, body: {} });
    assert.equal(again.status, 409);

    const hist = await api('GET', `/api/inventory/history?type=return&product_id=${p.id}`, { token });
    assert.equal(hist.body.data.length, 2);
  });
});

describe('customers and nasiya', () => {
  it('debt sale -> balance, FIFO payments, returns lower the debt, overdue', async () => {
    const { token } = await registerUser();
    const p = await createProduct(token, { selling_price: '100', initial_quantity: 50 });
    const c = (await api('POST', '/api/customers', { token, body: { name: 'Aziz', phone: '+998 90 111 22 33' } })).body.data;

    const noCustomer = await createSale(token, [{ product_id: p.id, quantity: 1 }], { payment_method: 'debt' });
    assert.equal(noCustomer.status, 400);

    const s1 = (await createSale(token, [{ product_id: p.id, quantity: 2 }], { payment_method: 'debt', customer_id: c.id, due_date: '2020-01-01' })).body.data;
    await createSale(token, [{ product_id: p.id, quantity: 3 }], { payment_method: 'debt', customer_id: c.id });
    assert.equal(s1.customer_name, 'Aziz');

    let cust = (await api('GET', `/api/customers/${c.id}`, { token })).body.data;
    assert.equal(cust.balance, '500.00');
    assert.equal(cust.is_overdue, true);
    assert.equal(cust.overdue_amount, '200.00');

    const pay = await api('POST', `/api/customers/${c.id}/payments`, { token, body: { amount: '250' } });
    assert.equal(pay.status, 201);
    assert.equal(pay.body.data.customer.balance, '250.00');
    assert.equal(pay.body.data.customer.is_overdue, false); // the old sale is paid first

    const over = await api('POST', `/api/customers/${c.id}/payments`, { token, body: { amount: '251' } });
    assert.equal(over.body.error.code, 'PAYMENT_TOO_LARGE');

    await api('POST', `/api/sales/${s1.id}/return`, { token, body: { items: [{ product_id: p.id, quantity: 1 }] } });
    cust = (await api('GET', `/api/customers/${c.id}`, { token })).body.data;
    assert.equal(cust.balance, '150.00');

    const del = await api('DELETE', `/api/customers/${c.id}`, { token });
    assert.equal(del.body.error.code, 'CUSTOMER_HAS_DEBT');

    const list = await api('GET', '/api/customers?status=debtors', { token });
    assert.equal(list.body.meta.summary.total_debt, '150.00');
    assert.equal(list.body.data.length, 1);
  });

  it('free plan cannot sell on credit', async () => {
    const { token, user } = await registerUser();
    const p = await createProduct(token);
    const c = (await api('POST', '/api/customers', { token, body: { name: 'X' } })).body.data;
    setPlan(user.id, 'free');
    const res = await createSale(token, [{ product_id: p.id, quantity: 1 }], { payment_method: 'debt', customer_id: c.id });
    assert.equal(res.status, 403);
  });
});

describe('suppliers and purchases', () => {
  it('purchase adds stock, updates cost, tracks what the shop owes', async () => {
    const { token } = await registerUser();
    const p = await createProduct(token, { cost_price: '10', initial_quantity: 5 });
    const s = (await api('POST', '/api/suppliers', { token, body: { name: 'Ulgurji', phone: '+998901234567' } })).body.data;

    const pur = await api('POST', `/api/suppliers/${s.id}/purchases`, {
      token,
      body: { items: [{ product_id: p.id, quantity: 10, unit_cost: '12' }], paid_amount: '20' },
    });
    assert.equal(pur.status, 201, JSON.stringify(pur.body));
    assert.equal(pur.body.data.total_amount, '120.00');
    assert.equal(pur.body.data.debt_amount, '100.00');
    assert.equal(await stockOf(token, p.id), 15);
    assert.equal((await api('GET', `/api/products/${p.id}`, { token })).body.data.cost_price, '12.00');

    const pay = await api('POST', `/api/suppliers/${s.id}/payments`, { token, body: { amount: '60' } });
    assert.equal(pay.body.data.supplier.balance, '40.00');

    const cancel = await api('POST', `/api/suppliers/${s.id}/purchases/${pur.body.data.id}/cancel`, { token });
    assert.equal(cancel.status, 200);
    assert.equal(await stockOf(token, p.id), 5);
    const sup = (await api('GET', `/api/suppliers/${s.id}`, { token })).body.data;
    assert.equal(sup.balance, '-60.00');
  });
});

describe('barcodes', () => {
  it('finds a product by barcode or SKU, and keeps barcodes unique', async () => {
    const { token } = await registerUser();
    const p = await createProduct(token, { barcode: '4780000000017', sku: 'COLA-1' });
    assert.equal((await api('GET', '/api/products/lookup?code=4780000000017', { token })).body.data.id, p.id);
    assert.equal((await api('GET', '/api/products/lookup?code=cola-1', { token })).body.data.id, p.id);
    assert.equal((await api('GET', '/api/products/lookup?code=nope', { token })).status, 404);
    const dup = await api('POST', '/api/products', { token, body: { sku: 'X-2', name: 'Y', selling_price: '1', barcode: '4780000000017' } });
    assert.equal(dup.body.error.code, 'DUPLICATE_BARCODE');
  });
});

describe('seller accounts', () => {
  it('owner on Max adds a seller; the seller sells but sees no costs and no reports', async () => {
    const { token, user } = await registerUser({ business_name: 'Do\'kon' });
    setPlan(user.id, 'max');
    const p = await createProduct(token, { cost_price: '7', selling_price: '10', initial_quantity: 5 });
    const email = `seller_${randomUUID()}@test.com`;
    const created = await api('POST', '/api/staff', { token, body: { full_name: 'Sotuvchi', email, password: PASSWORD } });
    assert.equal(created.status, 201, JSON.stringify(created.body));

    const login = await api('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
    assert.equal(login.status, 200);
    const st = login.body.data.token;
    assert.equal(login.body.data.user.role, 'staff');
    assert.equal(login.body.data.user.business_name, "Do'kon");
    assert.equal(login.body.data.user.subscription.plan, 'max');

    const products = await api('GET', '/api/products', { token: st });
    assert.equal(products.body.data[0].id, p.id);
    assert.equal(products.body.data[0].cost_price, undefined);

    const sale = await createSale(st, [{ product_id: p.id, quantity: 1 }]);
    assert.equal(sale.status, 201);
    assert.equal(sale.body.data.seller_name, 'Sotuvchi');
    assert.equal(sale.body.data.gross_profit, undefined);
    assert.equal(sale.body.data.total_cost, undefined);

    for (const [method, path] of [
      ['GET', '/api/dashboard/overview'],
      ['GET', '/api/expenses'],
      ['POST', `/api/sales/${sale.body.data.id}/return`],
      ['POST', '/api/products'],
      ['GET', '/api/staff'],
      ['POST', '/api/billing/checkout'],
    ]) {
      const res = await api(method, path, { token: st, body: method === 'POST' ? {} : undefined });
      assert.equal(res.status, 403, `${method} ${path}`);
    }

    const stats = await api('GET', '/api/staff/stats', { token });
    const seller = stats.body.data.items.find((r) => r.seller_name === 'Sotuvchi');
    assert.equal(seller.sales_count, 1);

    // Disabled seller is signed out on the next request.
    await api('PATCH', `/api/staff/${created.body.data.id}`, { token, body: { is_active: false } });
    assert.equal((await api('GET', '/api/products', { token: st })).status, 401);
    assert.equal((await api('POST', '/api/auth/login', { body: { email, password: PASSWORD } })).status, 403);

    // Owner's plan ends -> sellers cannot work.
    await api('PATCH', `/api/staff/${created.body.data.id}`, { token, body: { is_active: true } });
    setPlan(user.id, 'pro');
    assert.equal((await api('GET', '/api/products', { token: st })).status, 401);
  });
});

describe('telegram', () => {
  it('links a chat with a one-time code and sends low-stock alerts', async () => {
    const { outbox } = await import('../src/services/telegram.service.js');
    const { token, user } = await registerUser();
    setPlan(user.id, 'max');
    const link = await api('POST', '/api/telegram/link', { token });
    assert.equal(link.status, 200);
    const { code } = link.body.data;

    // The bot needs the shared secret; none is configured in tests, so every call is refused.
    const noSecret = await api('POST', '/api/telegram/bot/link', { body: { code, chat_id: 42 } });
    assert.equal(noSecret.status, 401);

    // Simulate what the bot does after a successful link.
    const row = db().users.find((u) => u.id === user.id);
    row.telegram_chat_id = 4242;
    const p = await createProduct(token, { initial_quantity: 6, low_stock_threshold: 5 });
    await createSale(token, [{ product_id: p.id, quantity: 1 }]);
    assert.ok(outbox.some((m) => m.chat_id === 4242 && m.text.includes('Kam qoldi')));
    await createSale(token, [{ product_id: p.id, quantity: 5 }]);
    assert.ok(outbox.some((m) => m.chat_id === 4242 && m.text.includes('Tugadi')));

    const report = await api('POST', '/api/telegram/report', { token });
    assert.equal(report.status, 200);
    assert.ok(outbox.some((m) => m.chat_id === 4242 && m.text.includes('kunlik hisobot')));
  });
});

describe('admin account', () => {
  it('always has every feature (Max, no expiry), even with a free plan', async () => {
    const { token, user } = await registerUser();
    const row = db().users.find((u) => u.id === user.id);
    row.role = 'admin';
    row.plan = 'free';
    row.plan_expires_at = null;
    const me = (await api('GET', '/api/auth/me', { token })).body.data.user;
    assert.equal(me.subscription.plan, 'max');
    assert.equal(me.subscription.unlimited, true);
    assert.equal(me.subscription.expires_at, null);
    assert.equal((await api('GET', '/api/dashboard/top-products', { token })).status, 200);
    assert.equal((await api('GET', '/api/expenses', { token })).status, 200);
    assert.equal((await api('POST', '/api/telegram/link', { token })).status, 200);
  });
});

describe('weighed goods (kg / l)', () => {
  it('sells 0.75 kg with exact money, refuses fractions for pieces', async () => {
    const { token } = await registerUser();
    const kg = await createProduct(token, { unit: 'kg', selling_price: '12000', cost_price: '8000', initial_quantity: 10.5 });
    const sale = await createSale(token, [{ product_id: kg.id, quantity: 0.75 }]);
    assert.equal(sale.status, 201, JSON.stringify(sale.body));
    assert.equal(sale.body.data.total_amount, '9000.00');
    assert.equal(sale.body.data.total_cost, '6000.00');
    assert.equal(await stockOf(token, kg.id), 9.75);

    await createSale(token, [{ product_id: kg.id, quantity: 0.1 }]);
    await createSale(token, [{ product_id: kg.id, quantity: 0.2 }]);
    assert.equal(await stockOf(token, kg.id), 9.45); // no float noise

    const pcs = await createProduct(token, { unit: 'pcs' });
    const bad = await createSale(token, [{ product_id: pcs.id, quantity: 1.5 }]);
    assert.equal(bad.body.error.code, 'WHOLE_QUANTITY_REQUIRED');
    const tooPrecise = await createSale(token, [{ product_id: kg.id, quantity: 0.0001 }]);
    assert.equal(tooPrecise.status, 400);
  });
});
