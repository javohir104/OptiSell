// This file runs in its own process, so we can lower the auth rate limit before the app loads.
process.env.AUTH_RATE_LIMIT_MAX = '3';

const { describe, it, before, after } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const { api, createProduct, registerUser, startServer, stopServer } = await import('./helpers.js');

before(startServer);
after(stopServer);

describe('HTTP hardening', () => {
  it('sends security headers and hides the framework', async () => {
    const res = await api('GET', '/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-powered-by'), null);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(res.headers.get('content-security-policy'));
    assert.ok(res.headers.get('strict-transport-security'));
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
  });

  it('health reports ok', async () => {
    const res = await api('GET', '/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'ok');
  });

  it('CORS allows configured origins only', async () => {
    const ok = await api('GET', '/api/health', { headers: { origin: 'http://localhost:5173' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    const evil = await api('GET', '/api/health', { headers: { origin: 'https://evil.example' } });
    assert.equal(evil.headers.get('access-control-allow-origin'), null);
  });

  it('returns JSON 404 for unknown routes', async () => {
    const res = await api('GET', '/api/does-not-exist');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  it('rejects malformed JSON with 400 and oversized bodies with 413', async () => {
    const bad = await api('POST', '/api/auth/login', { rawBody: '{"email": ' });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.message, 'Malformed JSON body');

    const big = await api('POST', '/api/auth/login', {
      rawBody: JSON.stringify({ email: 'a@b.com', password: 'x'.repeat(1_100_000) }),
    });
    assert.equal(big.status, 413);
  });
});

describe('input attacks on authenticated endpoints', () => {
  let token;
  before(async () => {
    ({ token } = await registerUser());
    await createProduct(token, { name: 'Normal product' });
    await createProduct(token, { name: '100% cotton_shirt' });
  });

  it('SQL injection in search is treated as plain text', async () => {
    for (const search of ["' OR '1'='1", "'; DROP TABLE users; --", '" OR ""="']) {
      const res = await api('GET', `/api/products?search=${encodeURIComponent(search)}`, { token });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 0);
    }
    const users = await api('GET', '/api/auth/me', { token });
    assert.equal(users.status, 200, 'users table must still exist');
  });

  it('LIKE wildcards in search are matched literally', async () => {
    const pct = await api('GET', `/api/products?search=${encodeURIComponent('%')}`, { token });
    assert.equal(pct.body.data.length, 1);
    assert.equal(pct.body.data[0].name, '100% cotton_shirt');
    const underscore = await api('GET', '/api/products?search=_', { token });
    assert.equal(underscore.body.data.length, 1);
  });

  it('sort / order only accept whitelisted values', async () => {
    for (const qs of ['sort=name;DROP TABLE products', 'sort=password_hash', 'order=asc;--']) {
      const res = await api('GET', `/api/products?${qs}`, { token });
      assert.equal(res.status, 400, qs);
    }
  });

  it('rejects HTTP parameter pollution and absurd pagination', async () => {
    for (const qs of ['page=1&page=2', 'limit=1000', 'page=0', 'limit=-1', 'page=abc']) {
      const res = await api('GET', `/api/products?${qs}`, { token });
      assert.equal(res.status, 400, qs);
    }
  });

  it('rejects invalid UUIDs in the path with 400 (not 500)', async () => {
    for (const id of ['123', "1' OR '1'='1", 'null']) {
      const res = await api('GET', `/api/products/${encodeURIComponent(id)}`, { token });
      assert.equal(res.status, 400, id);
    }
  });

  it('rejects prototype pollution and unknown fields in bodies', async () => {
    const res = await api('POST', '/api/products', {
      token,
      rawBody: '{"sku":"P1","name":"x","selling_price":1,"__proto__":{"isAdmin":true}}',
    });
    assert.equal(res.status, 400);
    assert.equal({}.isAdmin, undefined);

    const withUserId = await api('POST', '/api/products', {
      token,
      body: { sku: 'P2', name: 'x', selling_price: 1, user_id: '00000000-0000-0000-0000-000000000000' },
    });
    assert.equal(withUserId.status, 400);
  });

  it('rejects non-JSON content types', async () => {
    const res = await api('POST', '/api/products', {
      token,
      rawBody: 'sku=P3&name=x&selling_price=1',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    assert.equal(res.status, 400);
  });

  it('rejects oversized strings', async () => {
    const res = await api('POST', '/api/products', {
      token,
      body: { sku: 'P4', name: 'x'.repeat(201), selling_price: 1 },
    });
    assert.equal(res.status, 400);
  });
});

describe('brute-force protection', () => {
  it('blocks login after too many failed attempts, even with a spoofed X-Forwarded-For', async () => {
    const body = { email: 'victim@test.com', password: 'Wrong-pass1' };
    for (let i = 0; i < 3; i++) {
      const res = await api('POST', '/api/auth/login', { body });
      assert.equal(res.status, 401);
    }
    const blocked = await api('POST', '/api/auth/login', { body });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, 'RATE_LIMITED');

    const spoofed = await api('POST', '/api/auth/login', {
      body,
      headers: { 'x-forwarded-for': '1.2.3.4' },
    });
    assert.equal(spoofed.status, 429);
  });
});
