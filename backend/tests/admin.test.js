import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const ADMIN_EMAIL = `admin_${randomUUID().slice(0, 8)}@test.com`;
const ADMIN_PASSWORD = 'Admin-pass-for-tests-1';
process.env.ADMIN_EMAIL = ADMIN_EMAIL;
process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
process.env.PAYMENTS_TEST_MODE = 'true';
process.env.PAYMENTS_ENABLED = 'true';

const { api, db, registerUser, startServer, stopServer } = await import('./helpers.js');
const { ensureEnvAdmin } = await import('../src/services/adminAuth.service.js');

let adminToken;

before(async () => {
  await startServer();
  await ensureEnvAdmin();
  // The admin signs in on the normal login endpoint, like every user.
  const res = await api('POST', '/api/auth/login', { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.user.role, 'admin');
  adminToken = res.body.data.token;
});
after(stopServer);

describe('admin panel access', () => {
  it('creates the admin account from .env with role admin', async () => {
    const admin = db().users.find((u) => u.email === ADMIN_EMAIL);
    assert.equal(admin.role, 'admin');
    assert.equal(admin.is_test_account, true);
  });

  it('refuses admin endpoints without a token', async () => {
    for (const path of ['/api/admin/overview', '/api/admin/users', '/api/admin/payments', '/api/admin/auth/me']) {
      const res = await api('GET', path);
      assert.equal(res.status, 401, path);
    }
  });

  it('new users get role "user" and see it in /auth/me', async () => {
    const { token, user } = await registerUser();
    assert.equal(user.role, 'user');
    const me = await api('GET', '/api/auth/me', { token });
    assert.equal(me.body.data.user.role, 'user');
  });

  it('a normal user token gets 403 on every admin endpoint', async () => {
    const { token, user } = await registerUser();
    const calls = [
      ['GET', '/api/admin/auth/me'],
      ['GET', '/api/admin/overview'],
      ['GET', '/api/admin/chart'],
      ['GET', '/api/admin/traffic'],
      ['GET', '/api/admin/active-users'],
      ['GET', '/api/admin/users'],
      ['GET', `/api/admin/users/${user.id}`],
      ['PATCH', `/api/admin/users/${user.id}`, { is_test_account: true }],
      ['GET', '/api/admin/payments'],
      ['GET', '/api/admin/audit-log'],
    ];
    for (const [method, path, body] of calls) {
      const res = await api(method, path, { token, body });
      assert.equal(res.status, 403, `${method} ${path}`);
      assert.equal(res.body.error.code, 'ADMIN_ONLY');
    }
  });

  it('the old separate admin login endpoint is gone', async () => {
    const res = await api('POST', '/api/admin/auth/login', { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    assert.notEqual(res.status, 200);
    assert.equal(res.body.data, undefined);
  });

  it('the admin also uses the normal user pages with the same token', async () => {
    const res = await api('GET', '/api/products', { token: adminToken });
    assert.equal(res.status, 200);
  });

  it('a user cannot make themselves admin through the API', async () => {
    const { token, user } = await registerUser();
    await api('PATCH', '/api/profile', { token, body: { role: 'admin' } });
    const res = await api('PATCH', `/api/admin/users/${user.id}`, { token, body: { is_test_account: true } });
    assert.equal(res.status, 403);
    assert.equal(db().users.find((u) => u.id === user.id).role, 'user');
  });

  it('admin PATCH accepts only is_test_account', async () => {
    const { user } = await registerUser();
    const bad = await api('PATCH', `/api/admin/users/${user.id}`, { token: adminToken, body: { role: 'admin' } });
    assert.equal(bad.status, 400);
    const ok = await api('PATCH', `/api/admin/users/${user.id}`, { token: adminToken, body: { is_test_account: true } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.is_test_account, true);
    assert.equal(ok.body.data.role, 'user');
  });

  it('revoking the role locks the admin out on the next request', async () => {
    db().users.find((u) => u.email === ADMIN_EMAIL).role = 'user';
    const res = await api('GET', '/api/admin/overview', { token: adminToken });
    assert.equal(res.status, 403);
    await ensureEnvAdmin();
    const again = await api('GET', '/api/admin/overview', { token: adminToken });
    assert.equal(again.status, 200);
  });
});

describe('admin statistics', () => {
  it('counts real users and keeps test payments out of revenue', async () => {
    const { token, user } = await registerUser();
    const checkout = await api('POST', '/api/billing/checkout', { token, body: { plan: 'max', months: 1, provider: 'test' } });
    assert.equal(checkout.status, 201, JSON.stringify(checkout.body));

    const ov = await api('GET', '/api/admin/overview', { token: adminToken });
    assert.equal(ov.status, 200);
    assert.ok(ov.body.data.users.total >= 1);

    const pays = await api('GET', `/api/admin/payments?user_id=${user.id}`, { token: adminToken });
    assert.equal(pays.status, 200);
    assert.equal(pays.body.data[0].is_test, true);
    assert.equal(pays.body.data[0].is_real_revenue, false);
    assert.equal(JSON.stringify(pays.body).includes('password_hash'), false);
  });

  it('lists users without secrets and serves the other screens', async () => {
    const list = await api('GET', '/api/admin/users?limit=5', { token: adminToken });
    assert.equal(list.status, 200);
    assert.equal(JSON.stringify(list.body).includes('password'), false);
    for (const path of ['/api/admin/chart?interval=week', '/api/admin/traffic', '/api/admin/active-users', '/api/admin/audit-log']) {
      const res = await api('GET', path, { token: adminToken });
      assert.equal(res.status, 200, `${path}: ${JSON.stringify(res.body)}`);
    }
  });

  it('records page views from the app', async () => {
    const visitor = randomUUID();
    const res = await api('POST', '/api/track/pageview', {
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      body: { visitor_id: visitor, session_id: randomUUID(), path: '/dashboard?secret=1' },
    });
    assert.equal(res.status, 202);
    assert.equal(res.body.data.recorded, true);
    assert.equal(db().page_views.find((v) => v.visitor_id === visitor).path, '/dashboard');
  });
});
