import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Payments not integrated yet: plans are visible, nothing can be bought (not even the test provider).
process.env.PAYMENTS_ENABLED = 'false';
process.env.PAYMENTS_TEST_MODE = 'true';

const { api, db, registerUser, startServer, stopServer } = await import('./helpers.js');

before(startServer);
after(stopServer);

describe('buying plans while payments are not integrated', () => {
  it('still lists the plans, with purchasing switched off', async () => {
    const res = await api('GET', '/api/billing/plans');
    assert.equal(res.status, 200);
    assert.ok(res.body.data.plans.length >= 3);
    assert.equal(res.body.data.purchasing_enabled, false);
    assert.deepEqual(res.body.data.providers, { click: false, payme: false, test: false });
  });

  it('refuses every checkout and creates no payment', async () => {
    const { token, user } = await registerUser();
    for (const provider of ['test', 'click', 'payme']) {
      const res = await api('POST', '/api/billing/checkout', { token, body: { plan: 'max', months: 1, provider } });
      assert.equal(res.status, 503, provider);
      assert.equal(res.body.error.code, 'PAYMENTS_NOT_INTEGRATED');
    }
    assert.equal(db().payments.filter((p) => p.user_id === user.id).length, 0);
  });
});
