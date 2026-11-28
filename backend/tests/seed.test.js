import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { api, startServer, stopServer } from './helpers.js';

before(startServer);
after(stopServer);

describe('npm run seed', () => {
  it('creates a working test account with data, and is safe to run twice', async () => {
    const { seed, TEST_USER } = await import('../src/db/seed.js');
    const first = await seed({ days: 10, log: () => {} });
    assert.equal(first.created, true);
    assert.equal((await seed({ log: () => {} })).created, false);

    const login = await api('POST', '/api/auth/login', {
      body: { email: TEST_USER.email, password: TEST_USER.password },
    });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    const token = login.body.data.token;

    const products = await api('GET', '/api/products', { token });
    assert.equal(products.body.data.length, 6);
    const overview = await api('GET', '/api/dashboard/overview', { token });
    assert.ok(Number(overview.body.data.sales.revenue) > 0);
    assert.ok(Number(overview.body.data.profit.expenses) > 0);
  });
});
