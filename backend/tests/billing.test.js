import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

process.env.PAYMENTS_TEST_MODE = 'true';
process.env.PAYMENTS_ENABLED = 'true';
process.env.CLICK_SERVICE_ID = '111';
process.env.CLICK_MERCHANT_ID = '222';
process.env.CLICK_SECRET_KEY = 'click-secret-for-tests';
process.env.PAYME_MERCHANT_ID = 'payme-merchant';
process.env.PAYME_KEY = 'payme-key-for-tests';

const { api, createProduct, db, registerUser, startServer, stopServer } = await import('./helpers.js');

before(startServer);
after(stopServer);

const makeFree = (userId) => Object.assign(db().users.find((u) => u.id === userId), { plan: 'free', plan_expires_at: null });

describe('subscription', () => {
  it('new accounts get a one-month Pro trial', async () => {
    const { user } = await registerUser({ first_name: 'Ali', last_name: 'Valiyev' });
    assert.equal(user.subscription.plan, 'pro');
    assert.equal(user.subscription.trial_used, true);
    const days = (Date.parse(user.subscription.expires_at) - Date.now()) / 86_400_000;
    assert.ok(days > 27 && days < 32, `trial days: ${days}`);
    assert.equal(user.first_name, 'Ali');
    assert.equal(user.last_name, 'Valiyev');
  });

  it('lists plans publicly', async () => {
    const res = await api('GET', '/api/billing/plans');
    assert.equal(res.status, 200);
    const free = res.body.data.plans.find((p) => p.id === 'free');
    assert.equal(free.limits.products, 15);
    assert.equal(res.body.data.providers.click, true);
  });

  it('stops the free plan at 15 products', async () => {
    const { token, user } = await registerUser();
    makeFree(user.id);
    const bulk = Array.from({ length: 15 }, (_, i) => ({ sku: `BULK-${i}`, name: `Bulk ${i}`, selling_price: 1 }));
    assert.equal((await api('POST', '/api/products/bulk', { token, body: { products: bulk } })).status, 200);
    const res = await api('POST', '/api/products', { token, body: { sku: 'ONE-MORE', name: 'x', selling_price: 1 } });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'PLAN_LIMIT_PRODUCTS');

    // A paid plan lifts the limit.
    const pay = await api('POST', '/api/billing/checkout', { token, body: { plan: 'pro', months: 1, provider: 'test' } });
    assert.equal(pay.status, 201);
    await createProduct(token);
  });

  it('test payment extends the same plan and reports usage', async () => {
    const { token, user } = await registerUser();
    const before = Date.parse(user.subscription.expires_at);
    const res = await api('POST', '/api/billing/checkout', { token, body: { plan: 'pro', months: 3, provider: 'test' } });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.payment.status, 'paid');
    assert.equal(res.body.data.payment.amount, '132000.00');

    const sub = await api('GET', '/api/billing/subscription', { token });
    const added = (Date.parse(sub.body.data.expires_at) - before) / 86_400_000;
    assert.ok(added > 88 && added < 93, `added days: ${added}`);
    assert.equal(sub.body.data.usage.products, 0);

    const list = await api('GET', '/api/billing/payments', { token });
    assert.equal(list.body.data.length, 1);
  });

  it('rejects unknown plans and periods', async () => {
    const { token } = await registerUser();
    for (const body of [{ plan: 'free', months: 1, provider: 'test' }, { plan: 'pro', months: 2, provider: 'test' }]) {
      const res = await api('POST', '/api/billing/checkout', { token, body });
      assert.equal(res.status, 400);
    }
  });
});

describe('profile', () => {
  it('updates names, phone and photo; full_name follows', async () => {
    const { token } = await registerUser();
    const avatar = 'data:image/png;base64,iVBORw0KGgo=';
    const res = await api('PATCH', '/api/profile', {
      token,
      body: { first_name: 'Vali', last_name: 'Aliyev', phone: '+998 90 123 45 67', avatar_url: avatar },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.user.full_name, 'Vali Aliyev');
    assert.equal(res.body.data.user.avatar_url, avatar);

    const me = await api('GET', '/api/auth/me', { token });
    assert.equal(me.body.data.user.phone, '+998 90 123 45 67');
  });

  it('refuses SVG photos', async () => {
    const { token } = await registerUser();
    const res = await api('PATCH', '/api/profile', { token, body: { avatar_url: 'data:image/svg+xml;base64,PHN2Zz4=' } });
    assert.equal(res.status, 400);
  });

  it('changes the password only with the current one', async () => {
    const { token, email } = await registerUser();
    const wrong = await api('POST', '/api/profile/password', { token, body: { current_password: 'nope', new_password: 'NewPassw0rd' } });
    assert.equal(wrong.status, 400);
    const ok = await api('POST', '/api/profile/password', { token, body: { current_password: 'Passw0rd-strong', new_password: 'NewPassw0rd' } });
    assert.equal(ok.status, 200);
    const login = await api('POST', '/api/auth/login', { body: { email, password: 'NewPassw0rd' } });
    assert.equal(login.status, 200);
  });
});

/* ------------------------------------------------------------------ providers */

async function pendingPayment(provider) {
  const { token } = await registerUser();
  const res = await api('POST', '/api/billing/checkout', { token, body: { plan: 'max', months: 1, provider } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.ok(res.body.data.checkout_url);
  return { token, payment: res.body.data.payment, url: res.body.data.checkout_url };
}

const paymeAuth = { authorization: `Basic ${Buffer.from('Paycom:payme-key-for-tests').toString('base64')}` };
const rpc = (method, params, headers = paymeAuth) =>
  api('POST', '/api/payments/payme', { headers, body: { jsonrpc: '2.0', id: 1, method, params } });

describe('Payme merchant API', () => {
  it('rejects a wrong key', async () => {
    const res = await rpc('CheckPerformTransaction', {}, { authorization: 'Basic eDp5' });
    assert.equal(res.status, 200);
    assert.equal(res.body.error.code, -32504);
  });

  it('create -> perform activates the plan; checks amount and order', async () => {
    const { token, payment, url } = await pendingPayment('payme');
    assert.match(url, /^https:\/\/checkout\.(test\.)?paycom\.uz\//);
    const account = { order_id: String(payment.order_no) };
    const amount = 99_000 * 100;

    assert.equal((await rpc('CheckPerformTransaction', { amount: amount - 1, account })).body.error.code, -31001);
    assert.equal((await rpc('CheckPerformTransaction', { amount, account: { order_id: '999999999' } })).body.error.code, -31050);
    assert.deepEqual((await rpc('CheckPerformTransaction', { amount, account })).body.result, { allow: true });

    const txn = `payme-${payment.order_no}`;
    const created = await rpc('CreateTransaction', { id: txn, time: Date.now(), amount, account });
    assert.equal(created.body.result.state, 1);
    // A second transaction for the same order is refused.
    assert.equal((await rpc('CreateTransaction', { id: `${txn}-2`, time: Date.now(), amount, account })).body.error.code, -31051);

    const performed = await rpc('PerformTransaction', { id: txn });
    assert.equal(performed.body.result.state, 2);
    const again = await rpc('PerformTransaction', { id: txn });
    assert.equal(again.body.result.perform_time, performed.body.result.perform_time);

    const check = await rpc('CheckTransaction', { id: txn });
    assert.equal(check.body.result.state, 2);
    assert.equal((await rpc('CancelTransaction', { id: txn, reason: 5 })).body.error.code, -31007);

    const sub = await api('GET', '/api/billing/subscription', { token });
    assert.equal(sub.body.data.plan, 'max');
  });

  it('cancelling before perform leaves the plan unchanged', async () => {
    const { token, payment } = await pendingPayment('payme');
    const account = { order_id: String(payment.order_no) };
    const txn = `payme-cancel-${payment.order_no}`;
    await rpc('CreateTransaction', { id: txn, time: Date.now(), amount: 9_900_000, account });
    const cancel = await rpc('CancelTransaction', { id: txn, reason: 3 });
    assert.equal(cancel.body.result.state, -1);
    const sub = await api('GET', '/api/billing/subscription', { token });
    assert.equal(sub.body.data.plan, 'pro');
  });
});

describe('Click SHOP API', () => {
  const sign = (b) =>
    createHash('md5')
      .update(`${b.click_trans_id}${b.service_id}click-secret-for-tests${b.merchant_trans_id}${b.merchant_prepare_id ?? ''}${b.amount}${b.action}${b.sign_time}`)
      .digest('hex');
  const form = (b) =>
    api('POST', `/api/payments/click/${b.action === 0 ? 'prepare' : 'complete'}`, {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      rawBody: new URLSearchParams(Object.entries(b).map(([k, v]) => [k, String(v)])).toString(),
    });

  it('prepare -> complete activates the plan; bad sign is refused', async () => {
    const { token, payment, url } = await pendingPayment('click');
    assert.match(url, /my\.click\.uz\/services\/pay/);
    const base = {
      click_trans_id: 7001,
      service_id: 111,
      click_paydoc_id: 1,
      merchant_trans_id: payment.order_no,
      amount: '99000.00',
      error: 0,
      error_note: 'Success',
      sign_time: '2026-11-25 12:00:00',
    };

    const bad = await form({ ...base, action: 0, sign_string: 'deadbeef' });
    assert.equal(bad.body.error, -1);

    const prep = { ...base, action: 0 };
    const prepared = await form({ ...prep, sign_string: sign(prep) });
    assert.equal(prepared.body.error, 0, JSON.stringify(prepared.body));

    const comp = { ...base, action: 1, merchant_prepare_id: prepared.body.merchant_prepare_id };
    const completed = await form({ ...comp, sign_string: sign(comp) });
    assert.equal(completed.body.error, 0, JSON.stringify(completed.body));
    const twice = await form({ ...comp, sign_string: sign(comp) });
    assert.equal(twice.body.error, -4);

    const sub = await api('GET', '/api/billing/subscription', { token });
    assert.equal(sub.body.data.plan, 'max');
  });
});
