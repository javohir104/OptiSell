import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { api, registerUser, startServer, stopServer } from './helpers.js';

before(startServer);
after(stopServer);

describe('expenses', () => {
  let token;
  before(async () => {
    ({ token } = await registerUser());
  });

  it('full CRUD', async () => {
    const created = await api('POST', '/api/expenses', {
      token,
      body: { category: 'Rent', amount: '1500000.50', expense_date: '2025-06-01', description: 'June' },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const e = created.body.data;
    assert.equal(e.amount, '1500000.50');
    assert.equal(e.expense_date, '2025-06-01');
    assert.equal(e.payment_method, 'cash');

    const got = await api('GET', `/api/expenses/${e.id}`, { token });
    assert.equal(got.body.data.category, 'Rent');

    const upd = await api('PUT', `/api/expenses/${e.id}`, {
      token,
      body: { amount: 99, description: '', payment_method: 'transfer' },
    });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.data.amount, '99.00');
    assert.equal(upd.body.data.description, null);
    assert.equal(upd.body.data.category, 'Rent');

    const del = await api('DELETE', `/api/expenses/${e.id}`, { token });
    assert.equal(del.status, 200);
    assert.equal((await api('GET', `/api/expenses/${e.id}`, { token })).status, 404);
    assert.equal((await api('DELETE', `/api/expenses/${e.id}`, { token })).status, 404);
  });

  it('defaults expense_date to today', async () => {
    const res = await api('POST', '/api/expenses', { token, body: { category: 'Misc', amount: 1 } });
    assert.match(res.body.data.expense_date, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('validates amount and fields', async () => {
    for (const body of [
      { category: 'X', amount: 0 },
      { category: 'X', amount: -10 },
      { category: 'X', amount: '1.234' },
      { category: '', amount: 5 },
      { amount: 5 },
      { category: 'X', amount: 5, expense_date: '2025-13-40' },
      { category: 'X', amount: 5, user_id: randomUUID() },
    ]) {
      const res = await api('POST', '/api/expenses', { token, body });
      assert.equal(res.status, 400, JSON.stringify(body));
    }
  });

  it('lists with filters, totals and categories', async () => {
    const { token: t } = await registerUser();
    for (const [category, amount, expense_date] of [
      ['Rent', '100', '2025-01-05'],
      ['Salary', '200', '2025-01-20'],
      ['rent', '50', '2025-02-05'],
    ]) {
      await api('POST', '/api/expenses', { token: t, body: { category, amount, expense_date } });
    }
    const jan = await api('GET', '/api/expenses?from=2025-01-01&to=2025-01-31', { token: t });
    assert.equal(jan.body.meta.total, 2);
    assert.equal(jan.body.meta.total_amount, '300.00');

    const rent = await api('GET', '/api/expenses?category=RENT', { token: t });
    assert.equal(rent.body.meta.total, 2);

    const byAmount = await api('GET', '/api/expenses?sort=amount&order=asc', { token: t });
    assert.deepEqual(byAmount.body.data.map((e) => e.amount), ['50.00', '100.00', '200.00']);

    const cats = await api('GET', '/api/expenses/categories', { token: t });
    assert.equal(cats.status, 200);
    assert.ok(cats.body.data.length >= 2);
  });
});
